/**
 * fetch-historical.ts
 * Uses Firecrawl to fetch full OHLCV data from investing.com.
 *
 * Strategy: Firecrawl renders ng.investing.com in a real browser (bypasses Cloudflare).
 * We then execute JavaScript IN THAT BROWSER CONTEXT — it already has valid session cookies —
 * to call the HistoricalDataAjax endpoint, which investing.com serves without extra auth.
 *
 * Usage: npm run fetch-historical
 * Reads:  data/raw/historical/pair-ids.json
 * Output: data/raw/historical/<TICKER>.json
 */

import { FirecrawlAppV1 as FirecrawlApp } from "@mendable/firecrawl-js";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import * as cheerio from "cheerio";

const FIRECRAWL_API_KEY = "fc-b38e308d921e4b2eaa875b8eb3cc9446";

const DATA_DIR      = join(__dirname, "../data/raw/historical");
const PAIR_IDS_FILE = join(DATA_DIR, "pair-ids.json");

// NGX ticker → investing.com URL slug (used as referer page for the JS call)
const NGX_SLUG_MAP: Record<string, string> = {
  DANGCEM:    "dangote-cement",
  MTNN:       "mtn-nigeria",
  AIRTELAFRI: "airtel-africa",
  ZENITHBANK: "zenith-bank",
  GTCO:       "guaranty-trust-holding",
  ACCESS:     "access-holdings",
  FBNH:       "fbn-holdings",
  UBA:        "uba",
  BUACEMENT:  "bua-cement",
  BUAFOODS:   "bua-foods",
  SEPLAT:     "seplat-energy",
  STANBIC:    "stanbic-ibtc-holdings",
  WAPCO:      "lafarge-africa",
  NB:         "nigerian-breweries",
  NESTLE:     "nestle-nigeria",
  DANGSUGAR:  "dangote-sugar-refinery",
  FLOURMILL:  "flour-mills-of-nigeria",
  PRESCO:     "presco",
  OKOMUOIL:   "okomu-oil-palm",
  TRANSCORP:  "transnational-corporation",
  TRANSCOHOT: "transcorp-hotels",
  FIDELITYBK: "fidelity-bank-nigeria",
  FCMB:       "first-city-monument-bank",
  OANDO:      "oando",
  TOTAL:      "total-nigeria",
  CONOIL:     "conoil",
  UNILEVER:   "unilever-nigeria",
  CADBURY:    "cadbury-nigeria",
  STERLING:   "sterling-financial-holdings",
  JAIZ:       "jaiz-bank",
  ETI:        "ecobank-transnational",
  ECOBANK:    "ecobank-nigeria",
};

export interface OHLCVBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TickerHistory {
  ticker: string;
  source: "investing.com";
  pairId: number;
  from: string;
  to: string;
  totalBars: number;
  bars: OHLCVBar[];
}

// JavaScript that runs inside the investing.com browser context.
// It calls HistoricalDataAjax with the given pair_id and returns the raw HTML response.
function buildFetchScript(pairId: number): string {
  const today = new Date();
  const endDate = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${today.getFullYear()}`;

  return `
    (async function() {
      try {
        const body = new URLSearchParams({
          action: 'historical_data',
          curr_id: '${pairId}',
          st_date: '01/01/1996',
          end_date: '${endDate}',
          interval_sec: 'Daily',
        });

        const resp = await fetch('/instruments/HistoricalDataAjax', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
          },
          credentials: 'include',
          body: body.toString(),
        });

        if (!resp.ok) return { error: 'HTTP ' + resp.status };
        const html = await resp.text();
        return { html };
      } catch (e) {
        return { error: e.message || String(e) };
      }
    })()
  `;
}

function parseInvestingDate(s: string): string | null {
  // investing.com returns e.g. "Jan 02, 1996"
  try {
    const d = new Date(s.trim());
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split("T")[0];
  } catch {
    return null;
  }
}

function parseVolume(s: string): number {
  const clean = s.replace(/,/g, "").trim();
  if (clean.endsWith("M")) return parseFloat(clean) * 1_000_000;
  if (clean.endsWith("B")) return parseFloat(clean) * 1_000_000_000;
  if (clean.endsWith("K")) return parseFloat(clean) * 1_000;
  return parseFloat(clean) || 0;
}

function parsePrice(s: string): number {
  return parseFloat(s.replace(/,/g, "").trim()) || 0;
}

function parseOhlcvHtml(html: string): OHLCVBar[] {
  const $ = cheerio.load(html);
  const bars: OHLCVBar[] = [];

  // investing.com table columns: Date | Price(close) | Open | High | Low | Volume | Change%
  $("table tbody tr").each((_, row) => {
    const cells = $(row).find("td").map((_, td) => $(td).text().trim()).get();
    if (cells.length < 6) return;

    const date   = parseInvestingDate(cells[0]);
    if (!date) return;

    const close  = parsePrice(cells[1]);
    const open   = parsePrice(cells[2]);
    const high   = parsePrice(cells[3]);
    const low    = parsePrice(cells[4]);
    const volume = parseVolume(cells[5]);

    if (close === 0) return;
    bars.push({ date, open, high, low, close, volume });
  });

  bars.sort((a, b) => a.date.localeCompare(b.date));
  return bars;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!existsSync(PAIR_IDS_FILE)) {
    console.error("pair-ids.json not found. Run: npm run discover-ngx-pairs first.");
    process.exit(1);
  }

  mkdirSync(DATA_DIR, { recursive: true });

  const firecrawl  = new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY });
  const pairIds: Record<string, number> = JSON.parse(readFileSync(PAIR_IDS_FILE, "utf-8"));
  const tickers = Object.keys(pairIds);

  console.log(`\nFetching OHLCV data for ${tickers.length} NGX tickers via Firecrawl...\n`);

  let success = 0;
  let skipped = 0;

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    const pairId = pairIds[ticker];
    const slug   = NGX_SLUG_MAP[ticker] ?? ticker.toLowerCase();

    process.stdout.write(`[${i + 1}/${tickers.length}] ${ticker} (pair_id: ${pairId})... `);

    const pageUrl = `https://ng.investing.com/equities/${slug}-historical-data`;

    try {
      const result = await firecrawl.scrapeUrl(pageUrl, {
        formats: [],
        waitFor: 3000,
        proxy: "stealth",
        actions: [
          { type: "wait", milliseconds: 2000 },
          {
            type: "executeJavascript",
            script: buildFetchScript(pairId),
          },
        ],
      });

      if (!result.success) {
        throw new Error(`Firecrawl error: ${(result as any).error ?? "unknown"}`);
      }

      // The JS return value is in result.actions.javascriptReturns[0].value
      const jsReturns = (result as any).actions?.javascriptReturns;
      if (!jsReturns || jsReturns.length === 0) {
        throw new Error("no JS return value");
      }

      const jsVal = jsReturns[0].value as { html?: string; error?: string };
      if (jsVal.error) {
        throw new Error(`JS execution error: ${jsVal.error}`);
      }
      if (!jsVal.html) {
        throw new Error("JS returned no HTML");
      }

      const bars = parseOhlcvHtml(jsVal.html);

      if (bars.length === 0) {
        throw new Error("HTML parsed but no bars found (table may be empty)");
      }

      if (bars.length < 30) {
        console.log(`SKIP (only ${bars.length} bars — insufficient)`);
        skipped++;
        await sleep(500);
        continue;
      }

      const from = bars[0].date;
      const to   = bars[bars.length - 1].date;

      const history: TickerHistory = {
        ticker,
        source: "investing.com",
        pairId,
        from,
        to,
        totalBars: bars.length,
        bars,
      };

      const outFile = join(DATA_DIR, `${ticker}.json`);
      writeFileSync(outFile, JSON.stringify(history));
      console.log(`OK — ${bars.length} bars (${from} → ${to})`);
      success++;

    } catch (err) {
      console.log(`FAIL (${(err as Error).message})`);
      skipped++;
    }

    await sleep(800); // polite delay between requests
  }

  console.log(`\nDone. Success: ${success}, Skipped: ${skipped}`);
  console.log(`Raw data saved to: ${DATA_DIR}/`);
  console.log(`\nNext step: npm run build-historical`);
}

main().catch(console.error);
