# NGX Historical Data & Training Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Batch-fetch all NGX stock OHLCV history from investing.com (back to 1996), compute per-ticker statistical profiles, inject them into the BM25 RAG index, and expose them via a `get_ngx_historical` tool in the chat API.

**Architecture:** Three new build scripts handle data discovery → fetch → processing. A new `/api/ngx/historical` route serves bar data on demand. The existing `src/app/api/chat/route.ts` is upgraded to the TRADER/TRADER tool-calling pattern and extended with the new `get_ngx_historical` tool. The active project (`~/TRADER/`) is the target — the `~/TRADER/TRADER/` directory is a read-only reference.

**Tech Stack:** Next.js 16 App Router, TypeScript, cheerio (HTML parsing), existing BM25 RAG infrastructure, Anthropic + OpenAI SDK tool calling.

---

## Reference Files (read-only, do not modify)
- `~/TRADER/TRADER/src/app/api/chat/route.ts` — complete tool calling implementation to port
- `~/TRADER/TRADER/src/lib/data/live.ts` — getNgxNews/getOpecNews pattern to follow
- `~/TRADER/scripts/process-ngx.ts` — safe BM25 merge pattern to follow
- `~/TRADER/src/app/api/ngx/news/route.ts` — existing API route pattern

---

### Task 1: Add cheerio dependency and npm scripts

**Files:**
- Modify: `~/TRADER/package.json`
- Create: `~/TRADER/data/raw/historical/.gitkeep`
- Modify: `~/TRADER/.gitignore` (if it exists, otherwise check next.config.ts)

**Step 1: Install cheerio**

```bash
cd ~/TRADER && npm install cheerio
```

Expected: `cheerio` added to `dependencies` in package.json.

**Step 2: Add npm scripts to package.json**

In `~/TRADER/package.json`, add to the `"scripts"` block:

```json
"discover-ngx-pairs": "npx tsx scripts/discover-ngx-pairs.ts",
"fetch-historical": "npx tsx scripts/fetch-historical.ts",
"build-historical": "npx tsx scripts/process-historical.ts"
```

**Step 3: Create raw/historical directory and gitignore raw data**

```bash
mkdir -p ~/TRADER/data/raw/historical
touch ~/TRADER/data/raw/historical/.gitkeep
```

Check if `~/TRADER/.gitignore` exists. If yes, add:
```
data/raw/historical/*.json
```
If the file doesn't exist, create it with that line.

Also create the output directory:
```bash
mkdir -p ~/TRADER/data/ngx-historical
```

**Step 4: Verify**

```bash
cd ~/TRADER && cat package.json | grep -A5 "discover-ngx"
```
Expected: the three new scripts appear.

**Step 5: Commit**

```bash
cd ~/TRADER
git add package.json package-lock.json data/raw/historical/.gitkeep data/ngx-historical
git commit -m "chore: add cheerio dependency and historical data npm scripts"
```

---

### Task 2: Create `scripts/discover-ngx-pairs.ts`

**Files:**
- Create: `~/TRADER/scripts/discover-ngx-pairs.ts`

**What it does:** Fetches each NGX ticker's investing.com historical-data page and extracts the `pair_id` embedded in the HTML. Saves a `ticker → pair_id` map to `data/raw/historical/pair-ids.json`. Safe to re-run — existing entries are preserved.

**Step 1: Create the script**

```typescript
/**
 * discover-ngx-pairs.ts
 * Scrapes ng.investing.com to find the investing.com pair_id for each NGX ticker.
 * Usage: npm run discover-ngx-pairs
 * Output: data/raw/historical/pair-ids.json
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const OUTPUT_DIR = join(__dirname, "../data/raw/historical");
const PAIR_IDS_FILE = join(OUTPUT_DIR, "pair-ids.json");
const SKIPPED_FILE = join(OUTPUT_DIR, "skipped.json");

// Map of NGX ticker → investing.com URL slug
// Slug is the part of the URL: ng.investing.com/equities/<slug>-historical-data
const NGX_SLUG_MAP: Record<string, string> = {
  DANGCEM:    "dangote-cement",
  MTNN:       "mtn-nigeria",
  AIRTELAFRI: "airtel-africa",
  ZENITHBANK: "zenith-bank",
  GTCO:       "guaranty-trust-holding",
  ACCESS:     "access-corporation",
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
  FIDELITYB:  "fidelity-bank-nigeria",
  FCMB:       "first-city-monument-bank",
  OANDO:      "oando",
  TOTAL:      "total-nigeria",
  CONOIL:     "conoil",
  FIDSON:     "fidson-healthcare",
  UNILEVER:   "unilever-nigeria",
  CADBURY:    "cadbury-nigeria",
  STERLNBANK: "sterling-financial-holdings",
  GEREGU:     "geregu-power",
  ARADEL:     "aradel-holdings",
  NGSEINDEX:  "nigeria-stock-exchange",
};

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Referer": "https://ng.investing.com/",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(slug: string): Promise<string> {
  const url = `https://ng.investing.com/equities/${slug}-historical-data`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function extractPairId(html: string): string | null {
  // Pattern 1: data-pair-id attribute
  const m1 = html.match(/data-pair-id="(\d+)"/);
  if (m1) return m1[1];

  // Pattern 2: pair_id in JSON data
  const m2 = html.match(/"pair_id"\s*:\s*"?(\d+)"?/);
  if (m2) return m2[1];

  // Pattern 3: curr_id in form
  const m3 = html.match(/name="curr_id"\s+value="(\d+)"/);
  if (m3) return m3[1];

  // Pattern 4: pairId in __NEXT_DATA__ or window data
  const m4 = html.match(/"pairId"\s*:\s*(\d+)/);
  if (m4) return m4[1];

  // Pattern 5: pid= in URL patterns within the page
  const m5 = html.match(/[?&]pid=(\d+)/);
  if (m5) return m5[1];

  return null;
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load existing pair IDs (safe to re-run)
  const existing: Record<string, number> = existsSync(PAIR_IDS_FILE)
    ? JSON.parse(readFileSync(PAIR_IDS_FILE, "utf-8"))
    : {};

  const skipped: Record<string, string> = existsSync(SKIPPED_FILE)
    ? JSON.parse(readFileSync(SKIPPED_FILE, "utf-8"))
    : {};

  const tickers = Object.keys(NGX_SLUG_MAP);
  let found = 0;
  let skippedCount = 0;

  console.log(`\nDiscovering pair IDs for ${tickers.length} NGX tickers...\n`);

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    const slug = NGX_SLUG_MAP[ticker];

    // Skip if already discovered
    if (existing[ticker]) {
      console.log(`[${i + 1}/${tickers.length}] ${ticker} — already known (pair_id: ${existing[ticker]})`);
      found++;
      continue;
    }

    process.stdout.write(`[${i + 1}/${tickers.length}] ${ticker} (${slug})... `);

    const html = await fetchPage(slug);
    if (!html) {
      console.log(`FAIL (no response)`);
      skipped[ticker] = "no response";
      skippedCount++;
      await sleep(500);
      continue;
    }

    const pairId = extractPairId(html);
    if (!pairId) {
      console.log(`FAIL (pair_id not found in HTML)`);
      skipped[ticker] = "pair_id not found";
      skippedCount++;
      await sleep(500);
      continue;
    }

    existing[ticker] = parseInt(pairId, 10);
    console.log(`OK (pair_id: ${pairId})`);
    found++;

    // Save after each success (incremental)
    writeFileSync(PAIR_IDS_FILE, JSON.stringify(existing, null, 2));
    await sleep(300); // polite delay
  }

  writeFileSync(PAIR_IDS_FILE, JSON.stringify(existing, null, 2));
  writeFileSync(SKIPPED_FILE, JSON.stringify(skipped, null, 2));

  console.log(`\nDone. Found: ${found}, Skipped: ${skippedCount}`);
  console.log(`Pair IDs: ${PAIR_IDS_FILE}`);
  if (skippedCount > 0) {
    console.log(`Skipped log: ${SKIPPED_FILE}`);
    console.log(`For skipped tickers, manually find the pair_id on ng.investing.com and add to pair-ids.json`);
  }
}

main().catch(console.error);
```

**Step 2: Run the script**

```bash
cd ~/TRADER && npm run discover-ngx-pairs
```

Expected output:
```
Discovering pair IDs for 33 NGX tickers...

[1/33] DANGCEM (dangote-cement)... OK (pair_id: 947547)
[2/33] MTNN (mtn-nigeria)... OK (pair_id: 1052426)
...
Done. Found: 28, Skipped: 5
```

> **Note:** Some tickers may not be found if their investing.com slug differs from what's in the map. Check `data/raw/historical/skipped.json` and manually update the slugs in the script for any that fail, then re-run. The script is idempotent — already-found tickers are skipped.

**Step 3: Verify output**

```bash
cat ~/TRADER/data/raw/historical/pair-ids.json | head -20
```

Expected: JSON object with ticker → number entries.

**Step 4: Commit**

```bash
cd ~/TRADER
git add scripts/discover-ngx-pairs.ts
git commit -m "feat: add discover-ngx-pairs script for investing.com pair ID mapping"
```

---

### Task 3: Create `scripts/fetch-historical.ts`

**Files:**
- Create: `~/TRADER/scripts/fetch-historical.ts`

**What it does:** For each ticker in `pair-ids.json`, POSTs to investing.com's `HistoricalDataAjax` endpoint, parses the HTML table response with cheerio, and saves raw OHLCV bars to `data/raw/historical/<TICKER>.json`. Handles rate limiting and skips failures gracefully.

**Step 1: Create the script**

```typescript
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

const HEADERS = {
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
    const outFile = join(DATA_DIR, `${ticker}.json`);

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
```

**Step 2: Run the script**

```bash
cd ~/TRADER && npm run fetch-historical
```

Expected output:
```
Fetching historical data for 28 NGX tickers...

[1/28] DANGCEM (pair_id: 947547)... OK — 7204 bars (1996-01-02 → 2025-12-31)
[2/28] MTNN (pair_id: 1052426)... OK — 5890 bars (2001-08-01 → 2025-12-31)
...
Done. Success: 26, Skipped: 2
```

> **Note:** Some stocks listed after 1996 will have fewer bars — that's expected. If investing.com returns 0 bars for a valid ticker, the slug in Task 2 may be wrong. Cross-check on ng.investing.com manually.

**Step 3: Verify**

```bash
ls -lh ~/TRADER/data/raw/historical/*.json | head -10
node -e "const d = require('./data/raw/historical/DANGCEM.json'); console.log(d.ticker, d.totalBars, d.from, d.to, d.bars[0])"
```

Expected: ticker name, bar count, date range, and first bar OHLCV.

**Step 4: Commit**

```bash
cd ~/TRADER
git add scripts/fetch-historical.ts
git commit -m "feat: add fetch-historical script for batch NGX OHLCV download from investing.com"
```

---

### Task 4: Create `scripts/process-historical.ts`

**Files:**
- Create: `~/TRADER/scripts/process-historical.ts`

**What it does:** Reads all raw bar files, computes per-ticker stats (ATR14, volatility, volume percentiles, seasonality, gap frequency), writes `data/ngx-historical/profiles.json`, and appends BM25 documentation chunks to the existing RAG index. Follows the safe-merge pattern from `scripts/process-ngx.ts`.

**Step 1: Create the script**

```typescript
/**
 * process-historical.ts
 * Computes NGX per-ticker statistical profiles and rebuilds the BM25 index.
 * Usage: npm run build-historical
 * Reads:  data/raw/historical/<TICKER>.json
 * Writes: data/ngx-historical/profiles.json
 *         data/pinescript-docs/docs-chunks.json (appended)
 *         data/pinescript-docs/bm25-index.json  (rebuilt)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { join } from "path";
import type { OHLCVBar, TickerHistory } from "./fetch-historical";

const RAW_DIR      = join(__dirname, "../data/raw/historical");
const PROFILES_DIR = join(__dirname, "../data/ngx-historical");
const DOCS_DIR     = join(__dirname, "../data/pinescript-docs");

// ─── Types ────────────────────────────────────────────────────────────────────

interface TickerProfile {
  ticker: string;
  name: string;
  board: "Premium" | "Main" | "Growth";
  from: string;
  to: string;
  totalBars: number;
  priceRange: { min: number; max: number; current: number };
  atr14: { mean: number; p25: number; p75: number };
  volatility: { dailyPct: number; annualPct: number };
  volume: { mean: number; p25: number; p75: number };
  seasonal: { strongMonths: string[]; weakMonths: string[] };
  gapFrequency: number;
}

interface DocChunk {
  id: string;
  type: "documentation";
  source: string;
  section: string;
  title: string;
  content: string;
  keywords: string[];
}

interface BM25Index {
  documents: { id: string; terms: string[] }[];
  idf: Record<string, number>;
  avgDl: number;
  totalDocs: number;
}

// ─── Ticker metadata ──────────────────────────────────────────────────────────

const TICKER_META: Record<string, { name: string; board: "Premium" | "Main" | "Growth" }> = {
  DANGCEM:    { name: "Dangote Cement", board: "Premium" },
  MTNN:       { name: "MTN Nigeria", board: "Premium" },
  AIRTELAFRI: { name: "Airtel Africa", board: "Premium" },
  ZENITHBANK: { name: "Zenith Bank", board: "Premium" },
  GTCO:       { name: "GTCO Holdings", board: "Premium" },
  ACCESS:     { name: "Access Corporation", board: "Premium" },
  FBNH:       { name: "FBN Holdings", board: "Premium" },
  UBA:        { name: "UBA", board: "Premium" },
  BUACEMENT:  { name: "BUA Cement", board: "Premium" },
  BUAFOODS:   { name: "BUA Foods", board: "Premium" },
  SEPLAT:     { name: "Seplat Energy", board: "Premium" },
  STANBIC:    { name: "Stanbic IBTC Holdings", board: "Premium" },
  WAPCO:      { name: "Lafarge Africa", board: "Premium" },
  NB:         { name: "Nigerian Breweries", board: "Premium" },
  NESTLE:     { name: "Nestle Nigeria", board: "Premium" },
  DANGSUGAR:  { name: "Dangote Sugar", board: "Premium" },
  FLOURMILL:  { name: "Flour Mills of Nigeria", board: "Premium" },
  PRESCO:     { name: "Presco", board: "Premium" },
  OKOMUOIL:   { name: "Okomu Oil Palm", board: "Premium" },
  TRANSCORP:  { name: "Transcorp", board: "Main" },
  TRANSCOHOT: { name: "Transcorp Hotels", board: "Main" },
  FIDELITYB:  { name: "Fidelity Bank", board: "Premium" },
  FCMB:       { name: "FCMB Group", board: "Main" },
  OANDO:      { name: "Oando", board: "Main" },
  TOTAL:      { name: "TotalEnergies Nigeria", board: "Main" },
  CONOIL:     { name: "Conoil", board: "Main" },
  FIDSON:     { name: "Fidson Healthcare", board: "Main" },
  UNILEVER:   { name: "Unilever Nigeria", board: "Main" },
  CADBURY:    { name: "Cadbury Nigeria", board: "Main" },
  STERLNBANK: { name: "Sterling Financial", board: "Main" },
  GEREGU:     { name: "Geregu Power", board: "Premium" },
  ARADEL:     { name: "Aradel Holdings", board: "Premium" },
  NGSEINDEX:  { name: "NGX All Share Index", board: "Premium" },
};

// ─── Stats computation ────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeATR14(bars: OHLCVBar[]): number[] {
  const atrs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low  - bars[i - 1].close),
    );

    if (i < 14) {
      // Simple average for first 14 bars
      const window = bars.slice(Math.max(0, i - 13), i + 1);
      const avg = window.reduce((s, b, j) => {
        if (j === 0) return s;
        return s + Math.max(b.high - b.low, Math.abs(b.high - bars[i - 13 + j - 1].close), Math.abs(b.low - bars[i - 13 + j - 1].close));
      }, 0) / (window.length - 1);
      atrs.push(avg);
    } else {
      // Wilder smoothing: ATR = (prev_ATR * 13 + TR) / 14
      const prevATR = atrs[atrs.length - 1] ?? tr;
      atrs.push((prevATR * 13 + tr) / 14);
    }
  }
  return atrs;
}

function computeSeasonality(bars: OHLCVBar[]): { strongMonths: string[]; weakMonths: string[] } {
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthReturns: number[][] = Array.from({ length: 12 }, () => []);

  for (let i = 1; i < bars.length; i++) {
    const month = new Date(bars[i].date).getMonth();
    const ret = (bars[i].close - bars[i - 1].close) / bars[i - 1].close;
    monthReturns[month].push(ret);
  }

  const avgReturns = monthReturns.map((returns, idx) => ({
    month: MONTHS[idx],
    avg: returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0,
  }));

  avgReturns.sort((a, b) => b.avg - a.avg);
  return {
    strongMonths: avgReturns.slice(0, 3).map((m) => m.month),
    weakMonths: avgReturns.slice(-3).map((m) => m.month),
  };
}

function computeProfile(history: TickerHistory): TickerProfile {
  const { ticker, bars, from, to, totalBars } = history;
  const meta = TICKER_META[ticker] ?? { name: ticker, board: "Main" as const };

  // Price range
  const closes = bars.map((b) => b.close);
  const priceRange = {
    min: round2(Math.min(...closes)),
    max: round2(Math.max(...closes)),
    current: round2(closes[closes.length - 1]),
  };

  // ATR14
  const atrs = computeATR14(bars);
  const atrSorted = [...atrs].sort((a, b) => a - b);
  const atr14 = {
    mean: round2(atrs.reduce((a, b) => a + b, 0) / atrs.length),
    p25:  round2(percentile(atrSorted, 25)),
    p75:  round2(percentile(atrSorted, 75)),
  };

  // Volatility (daily returns)
  const returns: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    returns.push((bars[i].close - bars[i - 1].close) / bars[i - 1].close);
  }
  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - meanReturn) ** 2, 0) / returns.length;
  const dailyStdDev = Math.sqrt(variance);
  const volatility = {
    dailyPct:  round2(dailyStdDev * 100),
    annualPct: round2(dailyStdDev * Math.sqrt(252) * 100),
  };

  // Volume
  const volumes = bars.map((b) => b.volume).filter((v) => v > 0).sort((a, b) => a - b);
  const volume = {
    mean: Math.round(volumes.reduce((a, b) => a + b, 0) / volumes.length),
    p25:  Math.round(percentile(volumes, 25)),
    p75:  Math.round(percentile(volumes, 75)),
  };

  // Seasonality
  const seasonal = computeSeasonality(bars);

  // Gap frequency (|open - prevClose| / prevClose > 2%)
  let gapCount = 0;
  for (let i = 1; i < bars.length; i++) {
    const gapPct = Math.abs(bars[i].open - bars[i - 1].close) / bars[i - 1].close;
    if (gapPct > 0.02) gapCount++;
  }
  const gapFrequency = round2(gapCount / (bars.length - 1));

  return {
    ticker,
    name: meta.name,
    board: meta.board,
    from,
    to,
    totalBars,
    priceRange,
    atr14,
    volatility,
    volume,
    seasonal,
    gapFrequency,
  };
}

// ─── BM25 helpers (same as process-ngx.ts) ───────────────────────────────────

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9_.]/g, " ").split(/\s+/).filter((t) => t.length > 1);
}

function buildBM25Index(docs: DocChunk[], existingDocs: DocChunk[]): BM25Index {
  // Load refs and examples from disk (we only rebuild the index over all docs)
  const refsPath     = join(DOCS_DIR, "reference-functions.json");
  const examplesPath = join(DOCS_DIR, "example-scripts.json");
  const refs: any[]     = existsSync(refsPath)     ? JSON.parse(readFileSync(refsPath, "utf-8"))     : [];
  const examples: any[] = existsSync(examplesPath) ? JSON.parse(readFileSync(examplesPath, "utf-8")) : [];

  const documents: { id: string; terms: string[] }[] = [];

  for (const doc of docs) {
    documents.push({ id: doc.id, terms: tokenize([doc.title, doc.content, ...doc.keywords].join(" ")) });
  }
  for (const ref of refs) {
    documents.push({ id: ref.id, terms: tokenize([ref.function, ref.description, ref.returns, ref.example, ...(ref.keywords ?? [])].join(" ")) });
  }
  for (const ex of examples) {
    documents.push({ id: ex.id, terms: tokenize([ex.title, ex.category, ex.code?.slice(0, 1000) ?? "", ...(ex.keywords ?? [])].join(" ")) });
  }

  const totalDocs = documents.length;
  const df: Record<string, number> = {};
  for (const doc of documents) {
    const unique = new Set(doc.terms);
    for (const term of unique) df[term] = (df[term] || 0) + 1;
  }

  const idf: Record<string, number> = {};
  for (const [term, count] of Object.entries(df)) {
    idf[term] = Math.log((totalDocs - count + 0.5) / (count + 0.5) + 1);
  }

  const avgDl = documents.reduce((s, d) => s + d.terms.length, 0) / totalDocs;
  return { documents, idf, avgDl, totalDocs };
}

// ─── BM25 chunk builder ───────────────────────────────────────────────────────

function profileToChunk(p: TickerProfile): DocChunk {
  const fmtVol = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : String(n);

  const content = [
    `NGX Historical Profile — ${p.ticker} (${p.name}, ${p.board} Board)`,
    `Data: ${p.from.slice(0, 4)}–${p.to.slice(0, 4)} | ${p.totalBars} trading days`,
    `Price range: ₦${p.priceRange.min.toLocaleString()}–₦${p.priceRange.max.toLocaleString()} | Current: ₦${p.priceRange.current.toLocaleString()}`,
    `ATR(14): mean ₦${p.atr14.mean} | typical ₦${p.atr14.p25}–₦${p.atr14.p75}`,
    `Daily volatility: ${p.volatility.dailyPct}% | Annual: ${p.volatility.annualPct}%`,
    `Avg daily volume: ${fmtVol(p.volume.mean)} shares | IQR: ${fmtVol(p.volume.p25)}–${fmtVol(p.volume.p75)}`,
    `Strong months: ${p.seasonal.strongMonths.join(", ")} | Weak: ${p.seasonal.weakMonths.join(", ")}`,
    `Gap opens >2%: ${(p.gapFrequency * 100).toFixed(1)}% of sessions`,
    `Recommended ATR stop multiplier: ${p.volatility.dailyPct > 2.5 ? "1.5–2.0×" : "2.0–2.5×"} ATR(14)`,
  ].join("\n");

  return {
    id: `doc-ngx-hist-${p.ticker.toLowerCase()}`,
    type: "documentation",
    source: "ngx-historical",
    section: "ngx-historical",
    title: `NGX Historical Profile — ${p.ticker}`,
    content,
    keywords: [
      p.ticker.toLowerCase(),
      p.name.toLowerCase(),
      "ngx", "historical", "atr", "volatility", "volume", "nigeria",
      "trading", "stops", "backtest", p.board.toLowerCase(),
      ...p.seasonal.strongMonths.map((m) => m.toLowerCase()),
    ],
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  mkdirSync(PROFILES_DIR, { recursive: true });

  // Find all raw bar files
  const rawFiles = readdirSync(RAW_DIR)
    .filter((f) => f.endsWith(".json") && f !== "pair-ids.json" && f !== "skipped.json");

  if (rawFiles.length === 0) {
    console.error("No raw bar files found. Run: npm run fetch-historical first.");
    process.exit(1);
  }

  console.log(`\nProcessing ${rawFiles.length} ticker files...\n`);

  // Compute profiles
  const profiles: Record<string, TickerProfile> = {};
  const chunks: DocChunk[] = [];

  for (const file of rawFiles) {
    const ticker = file.replace(".json", "");
    try {
      const history: TickerHistory = JSON.parse(readFileSync(join(RAW_DIR, file), "utf-8"));
      if (history.bars.length < 30) {
        console.log(`  SKIP ${ticker} — insufficient bars (${history.bars.length})`);
        continue;
      }
      const profile = computeProfile(history);
      profiles[ticker] = profile;
      chunks.push(profileToChunk(profile));
      console.log(`  OK   ${ticker} — ${history.bars.length} bars, ATR14 mean ₦${profile.atr14.mean}`);
    } catch (err) {
      console.log(`  FAIL ${ticker} — ${(err as Error).message}`);
    }
  }

  // Write profiles.json
  const profilesFile = join(PROFILES_DIR, "profiles.json");
  writeFileSync(profilesFile, JSON.stringify(profiles, null, 2));
  console.log(`\nProfiles written: ${profilesFile}`);

  // Safe-merge into existing docs-chunks.json (strip old ngx-historical, append new)
  const chunksFile = join(DOCS_DIR, "docs-chunks.json");
  const existingChunks: DocChunk[] = existsSync(chunksFile)
    ? JSON.parse(readFileSync(chunksFile, "utf-8"))
    : [];

  const stripped = existingChunks.filter((c) => c.source !== "ngx-historical");
  const merged = [...stripped, ...chunks];

  writeFileSync(chunksFile, JSON.stringify(merged, null, 2));
  console.log(`Docs-chunks updated: ${stripped.length} existing + ${chunks.length} new = ${merged.length} total`);

  // Rebuild BM25 index
  const indexFile = join(DOCS_DIR, "bm25-index.json");
  const index = buildBM25Index(merged, existingChunks);
  writeFileSync(indexFile, JSON.stringify(index));
  console.log(`BM25 index rebuilt: ${index.totalDocs} documents`);

  console.log(`\nDone. ${Object.keys(profiles).length} ticker profiles ready.`);
  console.log(`Next: start the dev server and test with: "Build a DANGCEM mean-reversion strategy"`);
}

main();
```

**Step 2: Run the script**

```bash
cd ~/TRADER && npm run build-historical
```

Expected output:
```
Processing 26 ticker files...

  OK   DANGCEM — 7204 bars, ATR14 mean ₦18.40
  OK   MTNN — 5890 bars, ATR14 mean ₦12.30
  ...
Profiles written: data/ngx-historical/profiles.json
Docs-chunks updated: 438 existing + 26 new = 464 total
BM25 index rebuilt: 1190 documents

Done. 26 ticker profiles ready.
```

**Step 3: Verify the BM25 index includes historical chunks**

```bash
node -e "
const chunks = require('./data/pinescript-docs/docs-chunks.json');
const hist = chunks.filter(c => c.source === 'ngx-historical');
console.log('Historical chunks:', hist.length);
console.log('Sample:', hist[0]?.content?.slice(0, 200));
"
```

Expected: `Historical chunks: 26` and a sample profile.

**Step 4: Commit**

```bash
cd ~/TRADER
git add scripts/process-historical.ts data/ngx-historical/ data/pinescript-docs/
git commit -m "feat: add process-historical script and rebuild BM25 index with NGX profiles"
```

---

### Task 5: Create `src/app/api/ngx/historical/route.ts`

**Files:**
- Create: `~/TRADER/src/app/api/ngx/historical/route.ts`

**What it does:** Serves OHLCV bar data and stats on demand. Profiles always in memory. Raw bars loaded on demand for date-range queries.

**Step 1: Create the route**

```typescript
import { NextRequest } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { checkRateLimit } from "@/lib/security";

const PROFILES_FILE = join(process.cwd(), "data/ngx-historical/profiles.json");
const RAW_DIR       = join(process.cwd(), "data/raw/historical");

// ─── Types ────────────────────────────────────────────────────────────────────

interface TickerProfile {
  ticker: string; name: string; board: string; from: string; to: string;
  totalBars: number;
  priceRange: { min: number; max: number; current: number };
  atr14: { mean: number; p25: number; p75: number };
  volatility: { dailyPct: number; annualPct: number };
  volume: { mean: number; p25: number; p75: number };
  seasonal: { strongMonths: string[]; weakMonths: string[] };
  gapFrequency: number;
}

interface OHLCVBar {
  date: string; open: number; high: number; low: number; close: number; volume: number;
}

// ─── In-memory profiles cache ──────────────────────────────────────────────────

let profilesCache: Record<string, TickerProfile> | null = null;

function loadProfiles(): Record<string, TickerProfile> | null {
  if (profilesCache) return profilesCache;
  if (!existsSync(PROFILES_FILE)) return null;
  try {
    profilesCache = JSON.parse(readFileSync(PROFILES_FILE, "utf-8"));
    return profilesCache;
  } catch {
    return null;
  }
}

// ─── Period → date range ───────────────────────────────────────────────────────

function periodToFromDate(period: string): string {
  const now = new Date();
  const years = period === "1y" ? 1 : period === "3y" ? 3 : period === "5y" ? 5 : 999;
  const from = new Date(now);
  from.setFullYear(from.getFullYear() - years);
  return from.toISOString().split("T")[0];
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const rateLimitResponse = checkRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  const profiles = loadProfiles();
  if (!profiles) {
    return Response.json(
      { error: "Historical data not available. Run: npm run build-historical" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker")?.toUpperCase();
  const period = searchParams.get("period") ?? "5y";
  const fromParam = searchParams.get("from");
  const toParam   = searchParams.get("to");

  if (!ticker) {
    return Response.json({ error: "ticker parameter required" }, { status: 400 });
  }

  const profile = profiles[ticker];
  if (!profile) {
    return Response.json({ error: `No historical data for ${ticker}` }, { status: 404 });
  }

  // Stats-only response (no date range requested)
  if (!fromParam && !toParam && period === "stats") {
    return Response.json({ ticker, stats: profile });
  }

  // Date-range: load raw bars on demand
  const rawFile = join(RAW_DIR, `${ticker}.json`);
  if (!existsSync(rawFile)) {
    // Fallback: stats only
    return Response.json({ ticker, bars: [], stats: profile, note: "raw bars not available" });
  }

  let bars: OHLCVBar[];
  try {
    const history = JSON.parse(readFileSync(rawFile, "utf-8"));
    bars = history.bars as OHLCVBar[];
  } catch {
    return Response.json({ ticker, bars: [], stats: profile, note: "failed to load raw bars" });
  }

  // Filter by date range
  const fromDate = fromParam ?? periodToFromDate(period);
  const toDate   = toParam   ?? new Date().toISOString().split("T")[0];

  const filtered = bars.filter((b) => b.date >= fromDate && b.date <= toDate);

  return Response.json({
    ticker,
    name: profile.name,
    board: profile.board,
    from: filtered[0]?.date ?? fromDate,
    to:   filtered[filtered.length - 1]?.date ?? toDate,
    totalBars: filtered.length,
    bars: filtered,
    stats: profile,
  });
}
```

**Step 2: Test the route**

```bash
cd ~/TRADER && npm run dev
```

In another terminal:

```bash
# Stats only
curl "http://localhost:3000/api/ngx/historical?ticker=DANGCEM&period=stats" | head -c 500

# Last 5 years of bars
curl "http://localhost:3000/api/ngx/historical?ticker=DANGCEM&period=5y" | head -c 500

# 404 for unknown ticker
curl "http://localhost:3000/api/ngx/historical?ticker=FAKEXYZ"
```

Expected: JSON with stats, filtered bars, and `{"error":"No historical data for FAKEXYZ"}` respectively.

**Step 3: Commit**

```bash
cd ~/TRADER
git add src/app/api/ngx/historical/route.ts
git commit -m "feat: add /api/ngx/historical route for OHLCV bar and stats queries"
```

---

### Task 6: Create `src/lib/data/historical.ts`

**Files:**
- Create: `~/TRADER/src/lib/data/historical.ts`

**What it does:** Exposes `getNgxHistorical(ticker, period)` for use by the tool calling handler. Reads from profiles.json + raw bars (same logic as the route, but callable server-side without HTTP).

**Step 1: Create the file**

```typescript
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const PROFILES_FILE = join(process.cwd(), "data/ngx-historical/profiles.json");
const RAW_DIR       = join(process.cwd(), "data/raw/historical");

let profilesCache: Record<string, any> | null = null;

function loadProfiles(): Record<string, any> | null {
  if (profilesCache) return profilesCache;
  if (!existsSync(PROFILES_FILE)) return null;
  try {
    profilesCache = JSON.parse(readFileSync(PROFILES_FILE, "utf-8"));
    return profilesCache;
  } catch {
    return null;
  }
}

function periodToFromDate(period: string): string {
  const now = new Date();
  const years = period === "1y" ? 1 : period === "3y" ? 3 : period === "5y" ? 5 : 999;
  const from = new Date(now);
  from.setFullYear(from.getFullYear() - years);
  return from.toISOString().split("T")[0];
}

export async function getNgxHistorical(
  ticker: string,
  period: "1y" | "3y" | "5y" | "max" = "5y"
): Promise<Record<string, any>> {
  const profiles = loadProfiles();
  if (!profiles) {
    return { error: "Historical data not available. Run: npm run build-historical" };
  }

  const t = ticker.toUpperCase();
  const profile = profiles[t];
  if (!profile) {
    return { error: `No historical data for ${t}` };
  }

  const rawFile = join(RAW_DIR, `${t}.json`);
  if (!existsSync(rawFile)) {
    return { ticker: t, stats: profile, bars: [], note: "raw bars not available" };
  }

  try {
    const history = JSON.parse(readFileSync(rawFile, "utf-8"));
    const fromDate = periodToFromDate(period);
    const toDate = new Date().toISOString().split("T")[0];
    const bars = (history.bars as any[]).filter(
      (b: any) => b.date >= fromDate && b.date <= toDate
    );

    return {
      ticker: t,
      name: profile.name,
      board: profile.board,
      period,
      from: bars[0]?.date ?? fromDate,
      to: bars[bars.length - 1]?.date ?? toDate,
      totalBars: bars.length,
      stats: profile,
      // Send summary bars (weekly sampled) to avoid overwhelming context
      bars: bars.filter((_: any, i: number) => i % 5 === 0).slice(-200),
    };
  } catch {
    return { ticker: t, stats: profile, bars: [], note: "failed to load bars" };
  }
}
```

**Step 2: Verify TypeScript compilation**

```bash
cd ~/TRADER && npx tsc --noEmit 2>&1 | grep historical
```

Expected: no errors related to `historical.ts`.

**Step 3: Commit**

```bash
cd ~/TRADER
git add src/lib/data/historical.ts
git commit -m "feat: add getNgxHistorical helper for server-side tool calling"
```

---

### Task 7: Upgrade `src/app/api/chat/route.ts` with tool calling + `get_ngx_historical`

**Files:**
- Modify: `~/TRADER/src/app/api/chat/route.ts`

**What it does:** Ports the tool calling loop from `~/TRADER/TRADER/src/app/api/chat/route.ts` into the active project and adds the `get_ngx_historical` tool alongside the existing `get_ngx_news` and `get_opec_news` tools.

> **Read first:** `~/TRADER/TRADER/src/app/api/chat/route.ts` lines 124–468 — this is the exact pattern to follow.
> Also read: `~/TRADER/TRADER/src/lib/data/live.ts` — this exports `getNgxNews` and `getOpecNews`.

**Step 1: Add `src/lib/data/live.ts` to the active project**

The active project's news/market logic is in `src/app/api/ngx/news/route.ts` but doesn't expose it as a callable function. Copy the live.ts pattern from the TRADER/TRADER reference:

```bash
cp ~/TRADER/TRADER/src/lib/data/live.ts ~/TRADER/src/lib/data/live.ts
```

Verify it compiles:

```bash
cd ~/TRADER && npx tsc --noEmit 2>&1 | grep live
```

If there are import errors (e.g. `@/app/api/news/route`), check what `NewsArticle` type is defined as in `~/TRADER/src/app/api/news/route.ts` (or the equivalent). Fix any import paths.

**Step 2: Modify `src/app/api/chat/route.ts`**

Make the following changes to `~/TRADER/src/app/api/chat/route.ts`:

**2a. Add imports at the top (after existing imports):**
```typescript
import { getNgxNews, getOpecNews } from "@/lib/data/live";
import { getNgxHistorical } from "@/lib/data/historical";
```

**2b. Add `tools_anthropic` array before `streamAnthropic` function:**
```typescript
const tools_anthropic: Anthropic.Tool[] = [
  {
    name: "get_ngx_news",
    description: "Fetch the latest news and corporate actions from the Nigerian Exchange Group (NGX). Use when the user asks for recent news, market updates, or context about NGX companies.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_opec_news",
    description: "Fetch the latest OPEC press releases. Use when the user asks about oil prices, OPEC decisions, or energy sector news relevant to NGX:SEPLAT or NGX:TOTAL.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_ngx_historical",
    description: "Fetch historical OHLCV data and statistical profile for a specific NGX stock. Use when generating strategies that require realistic ATR-based stops, volume filters, or backtesting parameters. Returns price range, ATR(14), volatility, volume percentiles, and seasonal patterns.",
    input_schema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "NGX ticker symbol e.g. DANGCEM, MTNN, ZENITHBANK" },
        period: { type: "string", enum: ["1y", "3y", "5y", "max"], description: "Historical lookback period" },
      },
      required: ["ticker"],
    },
  },
];
```

**2c. Add `tools_openai` array before `streamOpenAI` function:**
```typescript
const tools_openai: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_ngx_news",
      description: "Fetch latest NGX news and corporate actions.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_opec_news",
      description: "Fetch latest OPEC press releases.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ngx_historical",
      description: "Fetch historical OHLCV data and stats for an NGX stock. Use for ATR-based stops, volume filters, and realistic strategy parameters.",
      parameters: {
        type: "object",
        properties: {
          ticker: { type: "string" },
          period: { type: "string", enum: ["1y", "3y", "5y", "max"] },
        },
        required: ["ticker"],
      },
    },
  },
];
```

**2d. Update `streamAnthropic` to pass `tools`:**

Change the `client.messages.stream(...)` call to include `tools: tools_anthropic`:
```typescript
const stream = client.messages.stream(
  {
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages,
    tools: tools_anthropic,   // ← add this line
  },
  { signal },
);
```

**2e. Update `streamOpenAI` to pass `tools`:**

Change the `client.chat.completions.create(...)` call to include `tools: tools_openai`:
```typescript
const stream = await client.chat.completions.create(
  {
    model,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
    tools: tools_openai,   // ← add this line
  },
  { signal },
);
```

**2f. Replace the single-pass streaming block with the tool-calling loop**

Find this block in the `ReadableStream` start handler (around line 287–325):
```typescript
let fullContent = "";
const send = (data: Record<string, unknown>) => { ... };

try {
  // Phase 1: Stream the generation
  if (provider === "anthropic") {
    const anthropicStream = await streamAnthropic(...);
    for await (const event of anthropicStream) { ... }
  } else {
    ...
    for await (const chunk of openaiStream) { ... }
  }
  // Phase 2: validation pipeline
  ...
```

Replace the Phase 1 section (everything before Phase 2) with the recursive tool loop from `~/TRADER/TRADER/src/app/api/chat/route.ts` lines 340–467, **adding** the `get_ngx_historical` tool execution alongside `get_ngx_news` and `get_opec_news`:

```typescript
let currentMessages: any[] = messages.map((m) => ({ role: m.role, content: m.content }));
let isToolCall = false;

do {
  isToolCall = false;

  if (provider === "anthropic") {
    const anthropicStream = await streamAnthropic(currentMessages, systemPrompt, apiKey, model, signal);
    let currentToolCall: any = null;
    let assistantContent: Anthropic.ContentBlock[] = [];

    for await (const event of anthropicStream) {
      if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
        isToolCall = true;
        currentToolCall = event.content_block;
        assistantContent.push(event.content_block);
        send({ status: `fetching_data: ${currentToolCall.name}` });
      }
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullContent += event.delta.text;
        send({ text: event.delta.text });
      }
    }

    if (isToolCall && currentToolCall) {
      const textContent = (await anthropicStream.finalMessage()).content;
      let toolResult: any;

      if (currentToolCall.name === "get_ngx_news") {
        toolResult = await getNgxNews();
      } else if (currentToolCall.name === "get_opec_news") {
        toolResult = await getOpecNews();
      } else if (currentToolCall.name === "get_ngx_historical") {
        const { ticker, period } = (currentToolCall.input ?? {}) as { ticker?: string; period?: string };
        toolResult = ticker ? await getNgxHistorical(ticker, (period as any) ?? "5y") : { error: "ticker required" };
      }

      currentMessages.push({ role: "assistant", content: textContent });
      currentMessages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: currentToolCall.id, content: JSON.stringify(toolResult) }],
      });
      send({ status: "processing_data" });
    }

  } else {
    const baseURL =
      provider === "openrouter" ? "https://openrouter.ai/api/v1"
      : provider === "google"   ? "https://generativelanguage.googleapis.com/v1beta/openai/"
      : provider === "ollama"   ? `${safeOllamaUrl}/v1`
      : undefined;

    const openaiStream = await streamOpenAI(currentMessages, systemPrompt, apiKey, model, baseURL, signal);

    let fnName = "";
    let fnArgs = "";
    let fnId = "";

    for await (const chunk of openaiStream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.tool_calls) {
        isToolCall = true;
        if (delta.tool_calls[0].id) fnId = delta.tool_calls[0].id;
        if (delta.tool_calls[0].function?.name) fnName = delta.tool_calls[0].function.name;
        if (delta.tool_calls[0].function?.arguments) fnArgs += delta.tool_calls[0].function.arguments;
      }
      if (delta?.content) {
        fullContent += delta.content;
        send({ text: delta.content });
      }
    }

    if (isToolCall && fnName) {
      send({ status: `fetching_data: ${fnName}` });
      let toolResult: any;

      if (fnName === "get_ngx_news") {
        toolResult = await getNgxNews();
      } else if (fnName === "get_opec_news") {
        toolResult = await getOpecNews();
      } else if (fnName === "get_ngx_historical") {
        const args = fnArgs ? JSON.parse(fnArgs) : {};
        toolResult = args.ticker ? await getNgxHistorical(args.ticker, args.period ?? "5y") : { error: "ticker required" };
      }

      currentMessages.push({
        role: "assistant",
        content: "",
        tool_calls: [{ id: fnId, type: "function", function: { name: fnName, arguments: fnArgs || "{}" } }],
      });
      currentMessages.push({ role: "tool", tool_call_id: fnId, name: fnName, content: JSON.stringify(toolResult) });
      send({ status: "processing_data" });
    }
  }
} while (isToolCall);
```

**Step 3: Verify TypeScript compilation**

```bash
cd ~/TRADER && npx tsc --noEmit 2>&1
```

Expected: no errors. Fix any type errors that arise (usually `any[]` type on `currentMessages`).

**Step 4: Manual end-to-end test**

```bash
cd ~/TRADER && npm run dev
```

Open the app at `http://localhost:3000/chat`. Configure a valid API key. Send:
```
Build me a mean-reversion strategy for NGX:DANGCEM
```

Expected behaviour:
- Status indicator shows `fetching_data: get_ngx_historical` briefly
- Then `processing_data`
- Then the AI generates PineScript with ATR-based stops referencing real DANGCEM values (e.g. ATR ≈ ₦18)

**Step 5: Commit**

```bash
cd ~/TRADER
git add src/app/api/chat/route.ts src/lib/data/live.ts
git commit -m "feat: add get_ngx_historical tool calling + port tool loop from TRADER/TRADER reference"
```

---

### Task 8: Update CLAUDE.md and log.txt

**Files:**
- Modify: `~/TRADER/CLAUDE.md`
- Modify: `~/TRADER/log.txt`

**Step 1: Add to CLAUDE.md**

Append to the `## File Structure` section:

```
scripts/
  discover-ngx-pairs.ts   — Scrapes investing.com to build NGX ticker → pair_id map
  fetch-historical.ts     — Batch-fetches OHLCV bars from HistoricalDataAjax endpoint
  process-historical.ts   — Computes stats + appends historical chunks to BM25 index
data/
  raw/historical/         — Raw OHLCV JSON per ticker (gitignored)
    pair-ids.json         — NGX ticker → investing.com pair_id map
  ngx-historical/
    profiles.json         — Per-ticker statistical profiles (committed)
src/
  lib/
    data/
      live.ts             — getNgxNews() + getOpecNews() for tool calling
      historical.ts       — getNgxHistorical() for tool calling
  app/
    api/
      ngx/historical/route.ts — GET /api/ngx/historical?ticker=&period=
```

Also add to `## Key Decisions`:
```
- investing.com HistoricalDataAjax endpoint for NGX OHLCV data (back to 1996)
- Per-ticker ATR14/volatility/volume profiles as BM25 RAG chunks for realistic strategy generation
- get_ngx_historical tool gives AI precise bar data during generation for backtesting-aware suggestions
```

**Step 2: Append to log.txt**

```
2026-03-02: Added NGX historical data pipeline. discover-ngx-pairs.ts maps NGX tickers to investing.com pair IDs. fetch-historical.ts batch-fetches OHLCV from HistoricalDataAjax (1996–present). process-historical.ts computes ATR14/volatility/volume profiles and injects into BM25 index. New /api/ngx/historical route + get_ngx_historical tool enable AI to reference real price levels and suggest ATR-calibrated stops.
```

**Step 3: Commit**

```bash
cd ~/TRADER
git add CLAUDE.md log.txt
git commit -m "docs: update CLAUDE.md and log.txt for NGX historical data feature"
```

---

## Summary of New Files

| File | Purpose |
|------|---------|
| `scripts/discover-ngx-pairs.ts` | Discover investing.com pair IDs per NGX ticker |
| `scripts/fetch-historical.ts` | Batch-fetch OHLCV from HistoricalDataAjax |
| `scripts/process-historical.ts` | Compute stats + update BM25 index |
| `src/app/api/ngx/historical/route.ts` | Runtime API for OHLCV + stats queries |
| `src/lib/data/live.ts` | Ported from TRADER/TRADER — getNgxNews/getOpecNews |
| `src/lib/data/historical.ts` | getNgxHistorical for tool calling |

## Modified Files

| File | Change |
|------|--------|
| `package.json` | +3 npm scripts + cheerio dependency |
| `src/app/api/chat/route.ts` | Tool calling loop + 3 tools |
| `data/pinescript-docs/docs-chunks.json` | +NGX historical profile chunks |
| `data/pinescript-docs/bm25-index.json` | Rebuilt with historical data |
| `CLAUDE.md` | Updated architecture docs |
| `log.txt` | New entry |

## Run Order (first-time setup)

```bash
npm run discover-ngx-pairs   # build pair-ids.json
npm run fetch-historical      # download all OHLCV bars
npm run build-historical      # compute stats + update BM25 index
npm run dev                   # start server and test
```
