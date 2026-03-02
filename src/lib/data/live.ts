/**
 * live.ts — Server-side helpers for fetching live market data.
 * Used by the chat tool-calling loop to inject real-time context.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface NewsArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  snippet: string;
  mentions: string[];
}

// ─── RSS Helpers ──────────────────────────────────────────────────────────────

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
    const link = extractTag(item, "link").trim();
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

async function fetchFeed(feed: { name: string; url: string }): Promise<NewsArticle[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
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

// ─── NGX News ─────────────────────────────────────────────────────────────────

const NGX_RSS_FEEDS = [
  { name: "NGX Group",      url: "https://ngxgroup.com/feed/" },
  { name: "BusinessDay",    url: "https://businessday.ng/feed/" },
  { name: "Punch Business", url: "https://punchng.com/category/business/feed/" },
  { name: "The Nation",     url: "https://thenationonlineng.net/category/business/feed/" },
];

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

// 15-minute TTL cache
let ngxNewsCache: { articles: NewsArticle[]; expiresAt: number } | null = null;

export async function getNgxNews(): Promise<{ articles: NewsArticle[]; fetchedAt: string; cached: boolean }> {
  if (ngxNewsCache && ngxNewsCache.expiresAt > Date.now()) {
    return {
      articles: ngxNewsCache.articles,
      fetchedAt: new Date(ngxNewsCache.expiresAt - 15 * 60 * 1000).toISOString(),
      cached: true,
    };
  }

  const feedResults = await Promise.all(NGX_RSS_FEEDS.map(fetchFeed));
  const allArticles = feedResults.flat();

  const filtered = allArticles.filter((article) => {
    const mentions = findMentions(article);
    if (mentions.length > 0) {
      article.mentions = mentions;
      return true;
    }
    return isNGXRelevant(article);
  });

  for (const article of filtered) {
    if (article.mentions.length === 0) {
      article.mentions = findMentions(article);
    }
  }

  const seen = new Set<string>();
  const deduplicated = filtered.filter((a) => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  deduplicated.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const articles = deduplicated.slice(0, 30);

  ngxNewsCache = { articles, expiresAt: Date.now() + 15 * 60 * 1000 };

  return { articles, fetchedAt: new Date().toISOString(), cached: false };
}

// ─── OPEC News ────────────────────────────────────────────────────────────────

const OPEC_RSS_FEEDS = [
  { name: "OPEC", url: "https://www.opec.org/opec_web/en/press_room/rss/opec_rss.xml" },
];

let opecNewsCache: { articles: NewsArticle[]; expiresAt: number } | null = null;

export async function getOpecNews(): Promise<{ articles: NewsArticle[]; fetchedAt: string; cached: boolean }> {
  if (opecNewsCache && opecNewsCache.expiresAt > Date.now()) {
    return {
      articles: opecNewsCache.articles,
      fetchedAt: new Date(opecNewsCache.expiresAt - 15 * 60 * 1000).toISOString(),
      cached: true,
    };
  }

  const feedResults = await Promise.all(OPEC_RSS_FEEDS.map(fetchFeed));
  const allArticles = feedResults.flat();

  const seen = new Set<string>();
  const deduplicated = allArticles.filter((a) => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  deduplicated.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const articles = deduplicated.slice(0, 20);

  opecNewsCache = { articles, expiresAt: Date.now() + 15 * 60 * 1000 };

  return { articles, fetchedAt: new Date().toISOString(), cached: false };
}
