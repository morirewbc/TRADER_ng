import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/security";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NGXStock {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  board: "Premium" | "Main" | "Growth";
  isPenny: boolean;
}

export interface NGXIndex {
  name: string;
  value: string;
  change: string;
  direction: "up" | "down" | "flat";
}

export interface NGXMarketData {
  stocks: NGXStock[];
  indices: NGXIndex[];
  fetchedAt: string;
  cached: boolean;
}

// ─── Board Classification ─────────────────────────────────────────────────────

const PREMIUM_BOARD = new Set([
  "DANGCEM", "MTNN", "AIRTELAFRI", "ZENITHBANK", "GTCO", "ACCESS", "FBNH",
  "UBA", "BUACEMENT", "BUAFOODS", "SEPLAT", "STANBIC", "NB", "NESTLE",
  "WAPCO", "FLOURMILL", "OKOMUOIL", "PRESCO", "DANGSUGAR", "TRANSCORP",
  "TRANSCOHOT", "TOTAL", "NASCON", "FIDSON", "UNILEVER", "CADBURY",
  "CONOIL", "OANDO", "STERLNBANK", "FIDELITYB", "FCMB", "STERLING",
  "ACCESSCORP", "ZENITH", "FBNH", "GEREGU", "ARADEL",
]);

const GROWTH_BOARD = new Set([
  "MECURE", "CILEASING", "NMRC", "OMATEK", "CAVERTON", "SKYAVN",
  "JAIZBANK", "CORONATIONINS", "CORNERST", "PRESTIGE", "LASACO",
  "GOLDINS", "NSLTECH", "VERITASKAP", "SUNUASSURE",
]);

function classifyBoard(ticker: string): "Premium" | "Main" | "Growth" {
  const t = ticker.toUpperCase();
  if (PREMIUM_BOARD.has(t)) return "Premium";
  if (GROWTH_BOARD.has(t)) return "Growth";
  return "Main";
}

// ─── HTML Parsing ─────────────────────────────────────────────────────────────

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function parseNumber(s: string): number {
  const cleaned = s.replace(/,/g, "").replace(/[^\d.+-]/g, "").trim();
  return parseFloat(cleaned) || 0;
}

function parseStockRows(html: string): NGXStock[] {
  const stocks: NGXStock[] = [];

  // Extract all <tr> blocks that contain stock data
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];

  for (const row of rows) {
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    if (!cells || cells.length < 5) continue;

    const cols = cells.map((c) => stripTags(c));

    // First two cols are ticker and name (contain <a> links)
    const ticker = cols[0].toUpperCase().trim();
    const name = cols[1].trim();

    if (!ticker || ticker.length > 20 || !/^[A-Z0-9]+$/.test(ticker)) continue;

    const volume = parseNumber(cols[2]);
    const price = parseNumber(cols[3]);
    const change = parseNumber(cols[4]);

    // Skip header rows and rows with no price
    if (price === 0 && change === 0 && volume === 0) continue;

    const changePercent = price > 0 ? (change / (price - change)) * 100 : 0;
    const board = classifyBoard(ticker);

    stocks.push({
      ticker,
      name,
      price,
      change,
      changePercent: Math.round(changePercent * 100) / 100,
      volume,
      board,
      isPenny: price > 0 && price < 5,
    });
  }

  return stocks;
}

function parseIndices(html: string): NGXIndex[] {
  const indices: NGXIndex[] = [];

  // Look for known index label patterns followed by values in the HTML
  const patterns: { label: string; regex: RegExp }[] = [
    {
      label: "ASI Index",
      regex: /ASI\b[^<]*?(\d[\d,]+\.\d+)\s*[\s\S]*?\(([^)]+)\)/i,
    },
    {
      label: "NGX30",
      regex: /NGX\s*30\b[^<]*?(\d[\d,]+\.\d+)\s*[\s\S]*?\(([^)]+)\)/i,
    },
    {
      label: "Market Cap",
      regex: /[Mm]arket\s*[Cc]ap[^<]*?(NGN\s*[\d.,]+[TBM]?)/i,
    },
  ];

  // Also try structured extraction from summary blocks
  // Pattern: number optionally followed by parenthesised change
  const summaryBlock = html.slice(0, 5000); // indices usually appear near the top

  for (const { label, regex } of patterns) {
    const m = summaryBlock.match(regex);
    if (m) {
      const value = m[1]?.trim() ?? "";
      const change = m[2]?.trim() ?? "";
      const direction: NGXIndex["direction"] =
        change.startsWith("-") ? "down" : change.startsWith("+") ? "up" : "flat";
      indices.push({ name: label, value, change, direction });
    }
  }

  // Fallback: try to grab any bold numeric values near "Index" text
  if (indices.length === 0) {
    const nums = summaryBlock.match(/(\d[\d,]+\.\d{2})\s*\(([+-][^)]+)\)/g) ?? [];
    const labels = ["ASI Index", "NGX30", "NGX50"];
    nums.slice(0, 3).forEach((m, i) => {
      const parts = m.match(/^([\d,]+\.\d+)\s*\(([^)]+)\)$/);
      if (!parts) return;
      const direction: NGXIndex["direction"] =
        parts[2].startsWith("-") ? "down" : "up";
      indices.push({ name: labels[i] ?? `Index ${i + 1}`, value: parts[1], change: parts[2], direction });
    });
  }

  return indices;
}

// ─── Fetching ─────────────────────────────────────────────────────────────────

async function fetchPage(page: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const url = `https://afx.kwayisi.org/ngx/${page > 1 ? `?page=${page}` : ""}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PineScriptAI/1.0; Market Data)",
        "Accept": "text/html",
      },
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Cache (5-minute TTL) ─────────────────────────────────────────────────────

interface CacheEntry {
  data: NGXMarketData;
  expiresAt: number;
}

const marketCache = new Map<string, CacheEntry>();
const CACHE_KEY = "ngx-market";
const TTL_MS = 5 * 60 * 1000;

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const rateLimitResponse = checkRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  const cached = marketCache.get(CACHE_KEY);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json({ ...cached.data, cached: true });
  }

  // Fetch both pages in parallel
  const [page1Html, page2Html] = await Promise.all([fetchPage(1), fetchPage(2)]);

  const stocks: NGXStock[] = [];
  const seenTickers = new Set<string>();

  for (const html of [page1Html, page2Html]) {
    if (!html) continue;
    for (const stock of parseStockRows(html)) {
      if (!seenTickers.has(stock.ticker)) {
        seenTickers.add(stock.ticker);
        stocks.push(stock);
      }
    }
  }

  // Parse indices from page 1 (they appear in the page header)
  const indices = page1Html ? parseIndices(page1Html) : [];

  // Sort: Premium first, then alphabetically by ticker
  stocks.sort((a, b) => {
    const boardOrder = { Premium: 0, Main: 1, Growth: 2 };
    if (boardOrder[a.board] !== boardOrder[b.board])
      return boardOrder[a.board] - boardOrder[b.board];
    return a.ticker.localeCompare(b.ticker);
  });

  const data: NGXMarketData = {
    stocks,
    indices,
    fetchedAt: new Date().toISOString(),
    cached: false,
  };

  marketCache.set(CACHE_KEY, { data, expiresAt: Date.now() + TTL_MS });

  // Prune stale entries
  for (const [k, v] of marketCache) {
    if (v.expiresAt < Date.now()) marketCache.delete(k);
  }

  return Response.json(data);
}
