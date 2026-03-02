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
  DANGCEM:    { name: "Dangote Cement",         board: "Premium" },
  MTNN:       { name: "MTN Nigeria",            board: "Premium" },
  AIRTELAFRI: { name: "Airtel Africa",          board: "Premium" },
  ZENITHBANK: { name: "Zenith Bank",            board: "Premium" },
  GTCO:       { name: "GTCO Holdings",          board: "Premium" },
  ACCESS:     { name: "Access Corporation",     board: "Premium" },
  FBNH:       { name: "FBN Holdings",           board: "Premium" },
  UBA:        { name: "UBA",                    board: "Premium" },
  BUACEMENT:  { name: "BUA Cement",             board: "Premium" },
  BUAFOODS:   { name: "BUA Foods",              board: "Premium" },
  SEPLAT:     { name: "Seplat Energy",          board: "Premium" },
  STANBIC:    { name: "Stanbic IBTC Holdings",  board: "Premium" },
  WAPCO:      { name: "Lafarge Africa",         board: "Premium" },
  NB:         { name: "Nigerian Breweries",     board: "Premium" },
  NESTLE:     { name: "Nestle Nigeria",         board: "Premium" },
  DANGSUGAR:  { name: "Dangote Sugar",          board: "Premium" },
  FLOURMILL:  { name: "Flour Mills of Nigeria", board: "Premium" },
  PRESCO:     { name: "Presco",                 board: "Premium" },
  OKOMUOIL:   { name: "Okomu Oil Palm",         board: "Premium" },
  TRANSCORP:  { name: "Transcorp",              board: "Main"    },
  TRANSCOHOT: { name: "Transcorp Hotels",       board: "Main"    },
  FIDELITYB:  { name: "Fidelity Bank",          board: "Premium" },
  FCMB:       { name: "FCMB Group",             board: "Main"    },
  OANDO:      { name: "Oando",                  board: "Main"    },
  TOTAL:      { name: "TotalEnergies Nigeria",  board: "Main"    },
  CONOIL:     { name: "Conoil",                 board: "Main"    },
  FIDSON:     { name: "Fidson Healthcare",      board: "Main"    },
  UNILEVER:   { name: "Unilever Nigeria",       board: "Main"    },
  CADBURY:    { name: "Cadbury Nigeria",        board: "Main"    },
  STERLNBANK: { name: "Sterling Financial",     board: "Main"    },
  GEREGU:     { name: "Geregu Power",           board: "Premium" },
  ARADEL:     { name: "Aradel Holdings",        board: "Premium" },
  NGSEINDEX:  { name: "NGX All Share Index",    board: "Premium" },
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

    if (atrs.length < 13) {
      atrs.push(tr);
    } else if (atrs.length === 13) {
      // First ATR14: simple average of first 14 TRs
      const firstATR = (atrs.reduce((a, b) => a + b, 0) + tr) / 14;
      atrs.push(firstATR);
    } else {
      // Wilder smoothing
      const prevATR = atrs[atrs.length - 1];
      atrs.push((prevATR * 13 + tr) / 14);
    }
  }
  return atrs;
}

function computeSeasonality(bars: OHLCVBar[]): { strongMonths: string[]; weakMonths: string[] } {
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthReturns: number[][] = Array.from({ length: 12 }, () => []);

  for (let i = 1; i < bars.length; i++) {
    const month = parseInt(bars[i].date.slice(5, 7), 10) - 1;
    if (bars[i - 1].close > 0) {
      const ret = (bars[i].close - bars[i - 1].close) / bars[i - 1].close;
      monthReturns[month].push(ret);
    }
  }

  const avgReturns = monthReturns.map((returns, idx) => ({
    month: MONTHS[idx],
    avg: returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0,
  }));

  avgReturns.sort((a, b) => b.avg - a.avg);
  return {
    strongMonths: avgReturns.slice(0, 3).map((m) => m.month),
    weakMonths:   avgReturns.slice(-3).map((m) => m.month),
  };
}

function computeProfile(history: TickerHistory): TickerProfile {
  const { ticker, bars, from, to, totalBars } = history;
  const meta = TICKER_META[ticker] ?? { name: ticker, board: "Main" as const };

  // Price range
  const closes = bars.map((b) => b.close);
  const priceRange = {
    min:     round2(Math.min(...closes)),
    max:     round2(Math.max(...closes)),
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

  // Volatility (daily returns std dev)
  const returns: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    if (bars[i - 1].close > 0) {
      returns.push((bars[i].close - bars[i - 1].close) / bars[i - 1].close);
    }
  }
  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance   = returns.reduce((a, b) => a + (b - meanReturn) ** 2, 0) / returns.length;
  const dailyStdDev = Math.sqrt(variance);
  const volatility = {
    dailyPct:  round2(dailyStdDev * 100),
    annualPct: round2(dailyStdDev * Math.sqrt(252) * 100),
  };

  // Volume percentiles
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
    if (bars[i - 1].close > 0) {
      const gapPct = Math.abs(bars[i].open - bars[i - 1].close) / bars[i - 1].close;
      if (gapPct > 0.02) gapCount++;
    }
  }
  const gapFrequency = round2(gapCount / (bars.length - 1));

  return {
    ticker, name: meta.name, board: meta.board, from, to, totalBars,
    priceRange, atr14, volatility, volume, seasonal, gapFrequency,
  };
}

// ─── BM25 helpers ─────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9_.]/g, " ").split(/\s+/).filter((t) => t.length > 1);
}

function buildBM25Index(allDocs: DocChunk[]): BM25Index {
  const refsPath     = join(DOCS_DIR, "reference-functions.json");
  const examplesPath = join(DOCS_DIR, "example-scripts.json");
  const refs: any[]     = existsSync(refsPath)     ? JSON.parse(readFileSync(refsPath,     "utf-8")) : [];
  const examples: any[] = existsSync(examplesPath) ? JSON.parse(readFileSync(examplesPath, "utf-8")) : [];

  const documents: { id: string; terms: string[] }[] = [];

  for (const doc of allDocs) {
    documents.push({ id: doc.id, terms: tokenize([doc.title, doc.content, ...doc.keywords].join(" ")) });
  }
  for (const ref of refs) {
    const text = [ref.function, ref.description, ref.returns, ref.example, ...(ref.keywords ?? [])].join(" ");
    documents.push({ id: ref.id, terms: tokenize(text) });
  }
  for (const ex of examples) {
    const text = [ex.title, ex.category, (ex.code ?? "").slice(0, 1000), ...(ex.keywords ?? [])].join(" ");
    documents.push({ id: ex.id, terms: tokenize(text) });
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
  const fmtVol = (n: number): string =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000   ? `${(n / 1_000).toFixed(0)}K`
    : String(n);

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
    id:       `doc-ngx-hist-${p.ticker.toLowerCase()}`,
    type:     "documentation",
    source:   "ngx-historical",
    section:  "ngx-historical",
    title:    `NGX Historical Profile — ${p.ticker}`,
    content,
    keywords: [
      p.ticker.toLowerCase(), p.name.toLowerCase(),
      "ngx", "historical", "atr", "volatility", "volume", "nigeria",
      "trading", "stops", "backtest", p.board.toLowerCase(),
      ...p.seasonal.strongMonths.map((m) => m.toLowerCase()),
    ],
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  mkdirSync(PROFILES_DIR, { recursive: true });

  // Find all raw bar files (exclude pair-ids.json, skipped.json, .gitkeep)
  const rawFiles = existsSync(RAW_DIR)
    ? readdirSync(RAW_DIR).filter((f) => f.endsWith(".json") && f !== "pair-ids.json" && f !== "skipped.json")
    : [];

  if (rawFiles.length === 0) {
    console.error("No raw bar files found. Run: npm run fetch-historical first.");
    process.exit(1);
  }

  console.log(`\nProcessing ${rawFiles.length} ticker files...\n`);

  const profiles: Record<string, TickerProfile> = {};
  const newChunks: DocChunk[] = [];

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
      newChunks.push(profileToChunk(profile));
      console.log(`  OK   ${ticker} — ${history.bars.length} bars, ATR14 mean ₦${profile.atr14.mean}`);
    } catch (err) {
      console.log(`  FAIL ${ticker} — ${(err as Error).message}`);
    }
  }

  // Write profiles.json
  const profilesFile = join(PROFILES_DIR, "profiles.json");
  writeFileSync(profilesFile, JSON.stringify(profiles, null, 2));
  console.log(`\nProfiles written: ${profilesFile}`);

  // Safe-merge into existing docs-chunks.json
  const chunksFile = join(DOCS_DIR, "docs-chunks.json");
  const existingChunks: DocChunk[] = existsSync(chunksFile)
    ? JSON.parse(readFileSync(chunksFile, "utf-8"))
    : [];

  // Strip old ngx-historical entries (idempotent re-runs)
  const stripped = existingChunks.filter((c) => c.source !== "ngx-historical");
  const merged   = [...stripped, ...newChunks];

  writeFileSync(chunksFile, JSON.stringify(merged, null, 2));
  console.log(`Docs-chunks updated: ${stripped.length} existing + ${newChunks.length} new = ${merged.length} total`);

  // Rebuild BM25 index
  const indexFile = join(DOCS_DIR, "bm25-index.json");
  const index = buildBM25Index(merged);
  writeFileSync(indexFile, JSON.stringify(index));
  console.log(`BM25 index rebuilt: ${index.totalDocs} documents`);

  console.log(`\nDone. ${Object.keys(profiles).length} ticker profiles ready.`);
  console.log(`Next: npm run dev and test with "Build a DANGCEM mean-reversion strategy"`);
}

main();
