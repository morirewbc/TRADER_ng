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

const HEADERS: Record<string, string> = {
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
