/**
 * discover-ngx-pairs.ts
 * Finds the investing.com pair_id for each NGX ticker via the search API.
 * Executes ALL searches in a single Firecrawl browser session (1 credit total).
 *
 * Usage: npm run discover-ngx-pairs
 * Output: data/raw/historical/pair-ids.json
 */

import { FirecrawlAppV1 as FirecrawlApp } from "@mendable/firecrawl-js";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const FIRECRAWL_API_KEY = "fc-b38e308d921e4b2eaa875b8eb3cc9446";

const OUTPUT_DIR    = join(__dirname, "../data/raw/historical");
const PAIR_IDS_FILE = join(OUTPUT_DIR, "pair-ids.json");

// All NGX tickers to discover (investing.com symbol = NGX ticker)
const NGX_TICKERS = [
  "DANGCEM", "MTNN", "AIRTELAFRI", "ZENITHBANK", "GTCO",
  "ACCESS",  "FBNH", "UBA",        "BUACEMENT",  "BUAFOODS",
  "SEPLAT",  "STANBIC", "WAPCO",   "NB",         "NESTLE",
  "DANGSUGAR","FLOURMILL","PRESCO", "OKOMUOIL",   "TRANSCORP",
  "FIDELITYBK","FCMB",  "OANDO",   "TOTAL",      "CONOIL",
  "UNILEVER", "CADBURY","STERLING","JAIZ",        "ETI",
  "ECOBANK",  "INTBREW","STERLNBANK",
];

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load existing (safe to re-run incrementally)
  const existing: Record<string, number> = existsSync(PAIR_IDS_FILE)
    ? JSON.parse(readFileSync(PAIR_IDS_FILE, "utf-8"))
    : {};

  const toDiscover = NGX_TICKERS.filter((t) => !existing[t]);
  if (toDiscover.length === 0) {
    console.log("All pair IDs already discovered. Nothing to do.");
    return;
  }

  console.log(`\nDiscovering pair IDs for ${toDiscover.length} tickers in a single Firecrawl call...\n`);

  const firecrawl = new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY });

  // Batch all searches in one browser session via executeJavascript
  const result = await firecrawl.scrapeUrl(
    "https://ng.investing.com/equities/dangote-cement", // any valid ng.investing.com page
    {
      formats: [],
      waitFor: 4000,
      proxy: "stealth",
      actions: [
        { type: "wait", milliseconds: 3000 },
        {
          type: "executeJavascript",
          script: `(async () => {
            const tickers = ${JSON.stringify(toDiscover)};
            const results = {};

            for (const ticker of tickers) {
              try {
                const resp = await fetch('/search/service/searchTopBar', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest',
                  },
                  credentials: 'include',
                  body: 'search_text=' + encodeURIComponent(ticker) + '&tab=quotes',
                });
                const data = await resp.json();
                const quotes = data.quotes || [];

                // Prefer exact match on Lagos exchange
                const match =
                  quotes.find(q => q.symbol === ticker && q.exchange === 'Lagos') ||
                  quotes.find(q => q.symbol === ticker && q.flag === 'Nigeria') ||
                  quotes.find(q => q.symbol === ticker) ||
                  quotes[0];

                results[ticker] = match ? { pairId: match.pairId, name: match.name, exchange: match.exchange } : null;
              } catch (e) {
                results[ticker] = { error: e.message };
              }

              // Polite delay between searches
              await new Promise(r => setTimeout(r, 300));
            }

            return results;
          })()`,
        },
      ],
    }
  );

  if (!result.success) {
    console.error("Firecrawl error:", (result as any).error);
    process.exit(1);
  }

  const jsReturns = (result as any).actions?.javascriptReturns;
  const found = jsReturns?.[0]?.value as Record<string, { pairId?: number; name?: string; exchange?: string; error?: string } | null>;

  if (!found) {
    console.error("No JS return value from Firecrawl.");
    process.exit(1);
  }

  let successCount = 0;
  let failCount = 0;

  for (const [ticker, info] of Object.entries(found)) {
    if (info && info.pairId && !info.error) {
      existing[ticker] = info.pairId;
      console.log(`  OK   ${ticker.padEnd(12)} pair_id: ${info.pairId}  (${info.name} | ${info.exchange})`);
      successCount++;
    } else {
      console.log(`  FAIL ${ticker.padEnd(12)} ${info?.error ?? "not found"}`);
      failCount++;
    }
  }

  writeFileSync(PAIR_IDS_FILE, JSON.stringify(existing, null, 2));

  console.log(`\nDone. Found: ${successCount}, Failed: ${failCount}`);
  console.log(`Pair IDs saved: ${PAIR_IDS_FILE}`);
  console.log(`\nNext step: npm run fetch-historical`);
}

main().catch(console.error);
