import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/security";
import type { NewsArticle } from "@/app/api/news/route";

export type { NewsArticle };

// ─── RSS Sources ──────────────────────────────────────────────────────────────

const RSS_FEEDS: { name: string; url: string }[] = [
  { name: "NGX Group",       url: "https://ngxgroup.com/feed/" },
  { name: "BusinessDay",     url: "https://businessday.ng/feed/" },
  { name: "Punch Business",  url: "https://punchng.com/category/business/feed/" },
  { name: "The Nation",      url: "https://thenationonlineng.net/category/business/feed/" },
];

// ─── Ticker → Company keyword map ────────────────────────────────────────────

const TICKER_KEYWORDS: Record<string, string[]> = {
  DANGCEM:    ["dangote cement", "dangote", "dangcem"],
  MTNN:       ["mtn nigeria", "mtn", "mtnn"],
  AIRTELAFRI: ["airtel africa", "airtel", "airtelafri"],
  ZENITHBANK: ["zenith bank", "zenith bank plc"],
  GTCO:       ["guaranty trust", "gtco", "gtbank", "gt holding"],
  FBNH:       ["fbn holdings", "first bank", "fbnh"],
  ACCESS:     ["access holdings", "access bank"],
  UBA:        ["united bank for africa", "uba"],
  BUACEMENT:  ["bua cement", "buacement"],
  BUAFOODS:   ["bua foods", "buafoods"],
  NESTLE:     ["nestle nigeria", "nestlé nigeria"],
  SEPLAT:     ["seplat energy", "seplat petroleum", "seplat"],
  STANBIC:    ["stanbic ibtc", "stanbic"],
  WAPCO:      ["lafarge africa", "lafarge", "wapco"],
  NB:         ["nigerian breweries", "heineken nigeria"],
  DANGSUGAR:  ["dangote sugar", "dangsugar"],
  FLOURMILL:  ["flour mills of nigeria", "flour mills"],
  PRESCO:     ["presco plc", "presco"],
  OKOMUOIL:   ["okomu oil palm", "okomu oil"],
  TRANSCORP:  ["transnational corporation", "transcorp"],
  TRANSCOHOT: ["transcorp hotels", "transcohot"],
  FIDELITYB:  ["fidelity bank"],
  FCMB:       ["fcmb group", "first city monument", "fcmb"],
  OANDO:      ["oando plc", "oando"],
  TOTAL:      ["totalenergies nigeria", "total nigeria"],
  CONOIL:     ["conoil plc", "conoil"],
  FIDSON:     ["fidson healthcare", "fidson"],
  UNILEVER:   ["unilever nigeria"],
  CADBURY:    ["cadbury nigeria"],
  STERLNBANK: ["sterling bank", "sterling financial"],
  GEREGU:     ["geregu power", "geregu"],
  ARADEL:     ["aradel holdings", "aradel"],
  NGSEINDEX:  ["ngx", "nigerian exchange", "nse", "stock market", "equity market", "capital market"],
  NGX30:      ["ngx 30", "blue chip stocks"],
};

// ─── RSS Helpers ─────────────────────────────────────────────────────────────

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
  const cdataMatch = xml.match(
    new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, "i"),
  );
  if (cdataMatch) return cdataMatch[1].trim();
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1].trim() : "";
}

function parseRSSItems(xml: string, sourceName: string): NewsArticle[] {
  const items: NewsArticle[] = [];
  const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];

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
      mentions: [],
    });
  }

  return items;
}

// ─── Filtering ────────────────────────────────────────────────────────────────

function isNGXRelevant(article: NewsArticle): boolean {
  const text = (article.title + " " + article.snippet).toLowerCase();
  const terms = [
    "ngx", "nigerian exchange", "nse", "stock exchange", "capital market",
    "equity", "shares", "stock market", "listed company", "trading floor",
    "earnings", "dividend", "ipo", "rights issue", "agm", "annual report",
  ];
  return terms.some((t) => text.includes(t));
}

function findMentions(article: NewsArticle): string[] {
  const text = (article.title + " " + article.snippet).toLowerCase();
  const found: string[] = [];
  for (const [ticker, keywords] of Object.entries(TICKER_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw.toLowerCase()))) {
      found.push(ticker);
    }
  }
  return found;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

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
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry {
  articles: NewsArticle[];
  expiresAt: number;
}

const newsCache = new Map<string, CacheEntry>();

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const rateLimitResponse = checkRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  const cacheKey = "ngx-dashboard";
  const cached = newsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json({
      articles: cached.articles,
      fetchedAt: new Date(cached.expiresAt - 15 * 60 * 1000).toISOString(),
      cached: true,
    });
  }

  const feedResults = await Promise.all(RSS_FEEDS.map(fetchFeed));
  const allArticles = feedResults.flat();

  // Keep only NGX-relevant articles or those mentioning known companies
  const filtered = allArticles.filter((article) => {
    const mentions = findMentions(article);
    if (mentions.length > 0) {
      article.mentions = mentions;
      return true;
    }
    return isNGXRelevant(article);
  });

  // Populate mentions for articles that passed isNGXRelevant without ticker match
  for (const article of filtered) {
    if (article.mentions.length === 0) {
      article.mentions = findMentions(article);
    }
  }

  // Deduplicate, sort newest first, cap at 40
  const seen = new Set<string>();
  const deduplicated = filtered.filter((a) => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  deduplicated.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
  const articles = deduplicated.slice(0, 40);

  newsCache.set(cacheKey, { articles, expiresAt: Date.now() + 15 * 60 * 1000 });

  for (const [k, v] of newsCache) {
    if (v.expiresAt < Date.now()) newsCache.delete(k);
  }

  return Response.json({ articles, fetchedAt: new Date().toISOString(), cached: false });
}
