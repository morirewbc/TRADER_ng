import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/security";

export interface NewsArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string; // ISO date string
  snippet: string;     // Plain-text excerpt, max 200 chars
  mentions: string[];  // Queried tickers mentioned in the article
}

// ─── RSS Sources ──────────────────────────────────────────────────────────────

const RSS_FEEDS: { name: string; url: string }[] = [
  {
    name: "BusinessDay",
    url: "https://businessday.ng/feed/",
  },
  {
    name: "Punch Business",
    url: "https://punchng.com/category/business/feed/",
  },
  {
    name: "The Nation Business",
    url: "https://thenationonlineng.net/category/business/feed/",
  },
];

// Map NGX ticker codes to company name keywords for article matching
const TICKER_KEYWORDS: Record<string, string[]> = {
  DANGCEM:    ["dangote cement", "dangote", "dangcem"],
  MTNN:       ["mtn nigeria", "mtn", "mtnn"],
  AIRTELAFRI: ["airtel africa", "airtel", "airtelafri"],
  ZENITHBANK: ["zenith bank", "zenith bank plc", "zenithbank"],
  GTCO:       ["guaranty trust", "gtco", "gtbank", "gt holding"],
  FBNH:       ["fbn holdings", "first bank", "fbnh"],
  ACCESS:     ["access holdings", "access bank", "access holdings plc"],
  UBA:        ["united bank for africa", "uba"],
  BUACEMENT:  ["bua cement", "buacement"],
  BUAFOODS:   ["bua foods", "buafoods"],
  NESTLE:     ["nestle nigeria", "nestlé nigeria", "nestle"],
  SEPLAT:     ["seplat energy", "seplat petroleum", "seplat"],
  STANBIC:    ["stanbic ibtc", "stanbic"],
  WAPCO:      ["lafarge africa", "lafarge", "wapco"],
  NB:         ["nigerian breweries", "heineken nigeria"],
  DANGSUGAR:  ["dangote sugar", "dangsugar"],
  FLOURMILL:  ["flour mills of nigeria", "flour mills", "flourmill"],
  PRESCO:     ["presco plc", "presco"],
  OKOMUOIL:   ["okomu oil palm", "okomu oil", "okomuoil"],
  TRANSCORP:  ["transnational corporation", "transcorp"],
  TRANSCOHOT: ["transcorp hotels", "transcohot"],
  FIDELITYB:  ["fidelity bank", "fidelityb"],
  FCMB:       ["fcmb group", "first city monument", "fcmb"],
  OANDO:      ["oando plc", "oando"],
  TOTAL:      ["totalenergies nigeria", "total nigeria", "total marketing"],
  CONOIL:     ["conoil plc", "conoil"],
  FIDSON:     ["fidson healthcare", "fidson"],
  UNILEVER:   ["unilever nigeria"],
  CADBURY:    ["cadbury nigeria"],
  STERLINGB:  ["sterling bank", "sterling financial"],
  // Broad market keywords — always include
  NGSEINDEX:  ["ngx", "nigerian exchange", "nse", "stock market", "equity market", "capital market"],
  NGX30:      ["ngx 30", "blue chip stocks", "market capitalization"],
};

// ─── Cache (15-minute TTL) ────────────────────────────────────────────────────

interface CacheEntry {
  articles: NewsArticle[];
  expiresAt: number;
}

const newsCache = new Map<string, CacheEntry>();

// ─── RSS Parsing ──────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(xml: string, tag: string): string {
  // Match both <tag>...</tag> and <tag><![CDATA[...]]></tag>
  const cdataMatch = xml.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, "i"));
  if (cdataMatch) return cdataMatch[1].trim();

  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1].trim() : "";
}

function parseRSSItems(xml: string, sourceName: string): NewsArticle[] {
  const items: NewsArticle[] = [];
  const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];

  for (const item of itemMatches) {
    const title = stripHtml(extractTag(item, "title"));
    const link  = extractTag(item, "link").trim();
    const pubDateRaw = extractTag(item, "pubDate");
    const description = stripHtml(extractTag(item, "description"));

    if (!title || !link) continue;

    let publishedAt: string;
    try {
      publishedAt = pubDateRaw ? new Date(pubDateRaw).toISOString() : new Date().toISOString();
    } catch {
      publishedAt = new Date().toISOString();
    }

    items.push({
      title,
      url: link,
      source: sourceName,
      publishedAt,
      snippet: description.slice(0, 200),
      mentions: [], // filled by caller
    });
  }

  return items;
}

// ─── Fetching ─────────────────────────────────────────────────────────────────

async function fetchFeed(feed: { name: string; url: string }): Promise<NewsArticle[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(feed.url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PineScriptAI/1.0; RSS reader)" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSSItems(xml, feed.name);
  } catch {
    return []; // silently skip failed feeds
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Article Filtering ────────────────────────────────────────────────────────

function isNGXRelevant(article: NewsArticle): boolean {
  const text = (article.title + " " + article.snippet).toLowerCase();
  // Always include if it mentions the market broadly
  const broadTerms = ["ngx", "nigerian exchange", "nse", "stock exchange", "capital market",
    "equity", "shares", "stock market", "listed company", "trading floor"];
  return broadTerms.some((t) => text.includes(t));
}

function findMentions(article: NewsArticle, tickers: string[]): string[] {
  const text = (article.title + " " + article.snippet).toLowerCase();
  const found: string[] = [];

  for (const ticker of tickers) {
    const keywords = TICKER_KEYWORDS[ticker] ?? [ticker.toLowerCase()];
    if (keywords.some((kw) => text.includes(kw.toLowerCase()))) {
      found.push(ticker);
    }
  }

  return found;
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const rateLimitResponse = checkRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = new URL(req.url);
  const tickerParam = searchParams.get("tickers") ?? "";

  // Parse and sanitize ticker list
  const tickers = tickerParam
    .split(",")
    .map((t) => t.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .filter((t) => t.length > 0 && t.length <= 20)
    .slice(0, 20); // max 20 tickers per request

  const cacheKey = tickers.sort().join(",") || "__general__";
  const cached = newsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json({ articles: cached.articles, fetchedAt: new Date(cached.expiresAt - 15 * 60 * 1000).toISOString(), cached: true });
  }

  // Fetch all feeds in parallel
  const feedResults = await Promise.all(RSS_FEEDS.map(fetchFeed));
  const allArticles = feedResults.flat();

  // Filter: keep NGX-relevant articles OR those mentioning queried tickers
  const filtered = allArticles.filter((article) => {
    if (tickers.length === 0) return isNGXRelevant(article);
    const mentions = findMentions(article, tickers);
    if (mentions.length > 0) {
      article.mentions = mentions;
      return true;
    }
    return isNGXRelevant(article);
  });

  // Ensure mentions are populated for all filtered articles
  for (const article of filtered) {
    if (article.mentions.length === 0 && tickers.length > 0) {
      article.mentions = findMentions(article, tickers);
    }
  }

  // Deduplicate by URL, sort newest first, cap at 30
  const seen = new Set<string>();
  const deduplicated = filtered.filter((a) => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  deduplicated.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const articles = deduplicated.slice(0, 30);

  // Cache result
  newsCache.set(cacheKey, { articles, expiresAt: Date.now() + 15 * 60 * 1000 });

  // Prune old cache entries
  for (const [key, entry] of newsCache) {
    if (entry.expiresAt < Date.now()) newsCache.delete(key);
  }

  return Response.json({ articles, fetchedAt: new Date().toISOString(), cached: false });
}
