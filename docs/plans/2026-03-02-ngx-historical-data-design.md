# NGX Historical Data & Training — Design Doc
**Date:** 2026-03-02
**Status:** Approved

---

## Overview

Add NGX historical OHLCV data (sourced from investing.com, back to 1996) to the TRADER app via two integration paths:

1. **RAG enrichment** — per-ticker statistical profiles injected into the BM25 index so the AI generates realistic NGX strategies
2. **Runtime tool calling** — a new `get_ngx_historical` tool that lets the AI fetch granular bar-level data during generation for precise parameter suggestions

Data is fetched programmatically in a single batch using the `HistoricalDataAjax` endpoint reverse-engineered from [derlin/investing-historical-data](https://github.com/derlin/investing-historical-data).

---

## Architecture

```
investing.com (HistoricalDataAjax endpoint)
        │
        ▼
scripts/discover-ngx-pairs.ts     (npm run discover-ngx-pairs)
  └── scrapes ng.investing.com/equities/ to build ticker → pair_id map
       writes data/raw/historical/pair-ids.json

scripts/fetch-historical.ts        (npm run fetch-historical)
  └── POSTs HistoricalDataAjax for each pair_id
       st_date=01/01/1996, end_date=today, interval_sec=Daily
       200ms delay between requests, 10s backoff on 429
       writes data/raw/historical/<TICKER>.json

scripts/process-historical.ts      (npm run build-historical)
  ├── computes per-ticker stats (ATR, volatility, volume, seasonal, gap freq)
  ├── writes data/ngx-historical/profiles.json
  └── appends NGX historical chunks to BM25 index + rebuilds

src/app/api/ngx/historical/route.ts
  └── GET /api/ngx/historical?ticker=DANGCEM&period=5y
       GET /api/ngx/historical?ticker=DANGCEM&from=2020-01-01&to=2024-12-31

src/app/api/chat/route.ts  (extend existing tool calling)
  └── new tool: get_ngx_historical(ticker, period)
       wired into Anthropic + OpenAI tool definitions
       same fail-open pattern as get_ngx_news / get_opec_news
```

---

## Data Model

### `data/raw/historical/pair-ids.json`
```json
{
  "DANGCEM": 947547,
  "MTNN": 1052426
}
```

### `data/raw/historical/<TICKER>.json`
```json
{
  "ticker": "DANGCEM",
  "source": "investing.com",
  "from": "1996-01-02",
  "to": "2025-12-31",
  "bars": [
    { "date": "1996-01-02", "open": 99.00, "high": 101.00, "low": 98.50, "close": 100.50, "volume": 1200000 }
  ]
}
```

### `data/ngx-historical/profiles.json`
```json
{
  "DANGCEM": {
    "ticker": "DANGCEM",
    "name": "Dangote Cement",
    "board": "Premium",
    "from": "1996-01-02",
    "to": "2025-12-31",
    "totalBars": 7200,
    "priceRange": { "min": 12.50, "max": 1140.00, "current": 650.00 },
    "atr14": { "mean": 18.40, "p25": 8.20, "p75": 24.60 },
    "volatility": { "dailyPct": 1.82, "annualPct": 28.90 },
    "volume": { "mean": 2400000, "p25": 800000, "p75": 4100000 },
    "seasonal": { "strongMonths": ["Jan", "Apr", "Oct"], "weakMonths": ["Aug", "Dec"] },
    "gapFrequency": 0.12
  }
}
```

### BM25 chunk (per ticker, appended to docs-chunks.json)
```
NGX Historical — DANGCEM | 1996–2025 | 7,200 bars
Price: ₦12.50–₦1,140 | ATR(14) mean ₦18.40 | Vol mean 2.4M
Volatility: 1.82%/day | Strong: Jan Apr Oct | Gaps >2%: 12%
```

---

## Runtime API

**Endpoint:** `GET /api/ngx/historical`

**Query params:**
- `ticker` (required) — NGX ticker symbol e.g. `DANGCEM`
- `period` — `1y | 3y | 5y | max` (default: `5y`)
- `from` / `to` — ISO date strings for exact range (overrides period)

**Response:**
```json
{
  "ticker": "DANGCEM",
  "bars": [...],
  "stats": { "atr14": ..., "volatility": ..., "volume": ..., "priceRange": ..., "seasonal": ..., "gapFrequency": ... }
}
```

**Behaviour:**
- Profiles always loaded from memory (profiles.json)
- Raw bars loaded on-demand for date-range queries only
- profiles.json missing → 503 with `npm run build-historical` hint
- Unknown ticker → 404
- Rate limited via existing `checkRateLimit()` from `src/lib/security.ts`

---

## Tool Calling

New tool added alongside `get_ngx_news` / `get_opec_news`:

```
get_ngx_historical(ticker: string, period: "1y" | "3y" | "5y" | "max")
```

- Wired into both Anthropic and OpenAI tool definitions in `src/app/api/chat/route.ts`
- Fail-open: if the tool call errors, AI continues with RAG-only context

---

## Error Handling

| Stage | Error | Behaviour |
|-------|-------|-----------|
| discover-ngx-pairs | Ticker not on investing.com | Log to `skipped.json`, continue |
| fetch-historical | HTTP 429 | Back off 10s, retry once |
| fetch-historical | Per-ticker failure | Log, skip, continue others |
| fetch-historical | < 30 bars returned | Flag as insufficient, exclude from RAG |
| build-historical | Safe merge | Never wipes existing BM25 chunks |
| /api/ngx/historical | profiles.json missing | 503 + hint |
| /api/ngx/historical | Unknown ticker | 404 |
| Tool calling | Tool call fails | Fail-open, AI uses RAG context only |

---

## New npm Scripts

| Script | Purpose |
|--------|---------|
| `npm run discover-ngx-pairs` | Scrape investing.com to build pair_id map |
| `npm run fetch-historical` | Batch-fetch all NGX OHLCV data |
| `npm run build-historical` | Compute stats + rebuild BM25 index |

---

## Files Added / Modified

| Path | Change |
|------|--------|
| `scripts/discover-ngx-pairs.ts` | New |
| `scripts/fetch-historical.ts` | New |
| `scripts/process-historical.ts` | New |
| `data/raw/historical/` | New directory (gitignored raw bars) |
| `data/ngx-historical/profiles.json` | New (committed) |
| `src/app/api/ngx/historical/route.ts` | New |
| `src/app/api/chat/route.ts` | Extend — add `get_ngx_historical` tool |
| `package.json` | Add 3 new scripts + `cheerio` dependency |
| `data/pinescript-docs/docs-chunks.json` | Extended (NGX historical chunks) |
| `data/pinescript-docs/bm25-index.json` | Rebuilt |
