/**
 * fetch-historical.ts
 * Batch-fetches NGX OHLCV historical data from investing.com.
 * Uses the HistoricalDataAjax endpoint reverse-engineered from:
 *   https://github.com/derlin/investing-historical-data
 *
 * Usage: npm run fetch-historical
 * Reads:  data/raw/historical/pair-ids.json
 * Output: data/raw/historical/<TICKER>.json
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import * as cheerio from "cheerio";

const DATA_DIR = join(__dirname, "../data/raw/historical");
const PAIR_IDS_FILE = join(DATA_DIR, "pair-ids.json");

const ENDPOINT = "https://uk.investing.com/instruments/HistoricalDataAjax";

const HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/plain, */*; q=0.01",
  "Accept-Language": "en-US,en;q=0.5",
  "Content-Type": "application/x-www-form-urlencoded",
  "X-Requested-With": "XMLHttpRequest",
  "Origin": "https://uk.investing.com",
  "Referer": "https://uk.investing.com/",
};

export interface OHLCVBar {
  date: string;   // ISO: YYYY-MM-DD
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
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

function parseInvestingDate(s: string): string | null {
  // investing.com returns dates like "Jan 02, 1996" or "Feb 28, 2025"
  try {
    const d = new Date(s.trim());
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split("T")[0];
  } catch {
    return null;
  }
}

async function fetchBars(pairId: number): Promise<OHLCVBar[] | null> {
  const today = new Date();
  const start = new Date("1996-01-01");

  const body = new URLSearchParams({
    action: "historical_data",
    curr_id: String(pairId),
    st_date: formatDate(start),
    end_date: formatDate(today),
    interval_sec: "Daily",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: HEADERS,
      body: body.toString(),
      signal: controller.signal,
    });

    if (!res.ok) {
      if (res.status === 429) return null; // signal rate limit
      return [];
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const bars: OHLCVBar[] = [];

    // investing.com returns a table with rows: Date, Price(close), Open, High, Low, Volume, Change%
    $("table tbody tr").each((_, row) => {
      const cells = $(row).find("td").map((_, td) => $(td).text().trim()).get();
      if (cells.length < 6) return;

      const date = parseInvestingDate(cells[0]);
      if (!date) return;

      const close  = parsePrice(cells[1]);
      const open   = parsePrice(cells[2]);
      const high   = parsePrice(cells[3]);
      const low    = parsePrice(cells[4]);
      const volume = parseVolume(cells[5]);

      if (close === 0) return; // skip empty rows

      bars.push({ date, open, high, low, close, volume });
    });

    // Sort ascending by date
    bars.sort((a, b) => a.date.localeCompare(b.date));
    return bars;

  } catch (err) {
    if ((err as Error).name === "AbortError") return null;
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  if (!existsSync(PAIR_IDS_FILE)) {
    console.error("pair-ids.json not found. Run: npm run discover-ngx-pairs first.");
    process.exit(1);
  }

  const pairIds: Record<string, number> = JSON.parse(readFileSync(PAIR_IDS_FILE, "utf-8"));
  const tickers = Object.keys(pairIds);

  console.log(`\nFetching historical data for ${tickers.length} NGX tickers...\n`);

  let success = 0;
  let skipped = 0;

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    const pairId = pairIds[ticker];

    process.stdout.write(`[${i + 1}/${tickers.length}] ${ticker} (pair_id: ${pairId})... `);

    let bars = await fetchBars(pairId);

    // Retry once on rate limit (429)
    if (bars === null) {
      console.log(`rate limited, backing off 10s...`);
      await sleep(10000);
      bars = await fetchBars(pairId);
    }

    if (bars === null || bars.length === 0) {
      console.log(`SKIP (${bars === null ? "fetch failed" : "no bars returned"})`);
      skipped++;
      await sleep(500);
      continue;
    }

    if (bars.length < 30) {
      console.log(`SKIP (only ${bars.length} bars — insufficient for analysis)`);
      skipped++;
      await sleep(200);
      continue;
    }

    const from = bars[0].date;
    const to = bars[bars.length - 1].date;

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

    await sleep(200); // polite delay between requests
  }

  console.log(`\nDone. Success: ${success}, Skipped: ${skipped}`);
  console.log(`Raw data saved to: ${DATA_DIR}/`);
  console.log(`\nNext step: npm run build-historical`);
}

main().catch(console.error);
