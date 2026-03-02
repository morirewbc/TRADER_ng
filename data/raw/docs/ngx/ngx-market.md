# NGX Market Reference for PineScript

## Overview
The Nigerian Exchange Group (NGX) is the primary securities exchange in Nigeria.
TradingView provides real-time and historical data for NGX-listed stocks.

## Ticker Prefix Convention
All NGX symbols in TradingView use the `NGX:` prefix:
- `NGX:DANGCEM` — Dangote Cement
- `NGX:MTNN` — MTN Nigeria
- `NGX:NGSEINDEX` — All Share Index
- `NGX:NGX30` — NGX 30 Index

Always use the full string `"NGX:TICKER"` in `request.security()` calls.

## Market Hours and Session
NGX trading session: **10:00 – 14:30 WAT (UTC+1)**, Monday to Friday.
Public holidays follow the Nigerian Federal Government calendar.

```pine
// Check if bar is within NGX session
isNGXSession = session.ismarket

// Filter calculations to market hours only
validBar = isNGXSession and not na(close)
```

## Currency
NGX stocks are denominated in **Nigerian Naira (NGN)**.

```pine
// Format NGN values with comma separators
formatNGN(val) =>
    str.tostring(val, "#,###.##") + " NGN"
```

## Cross-Symbol Data with request.security()
Use `request.security()` to pull data from NGX tickers onto any chart.

```pine
// Pull close price of Zenith Bank onto current chart
zenith = request.security("NGX:ZENITHBANK", timeframe.period, close)

// Pull daily high of MTN Nigeria regardless of current timeframe
mtnDailyHigh = request.security("NGX:MTNN", "D", high)

// Pull All Share Index for market breadth context
allShare = request.security("NGX:NGSEINDEX", timeframe.period, close)
```

**Important:** Always use `barmerge.lookahead_off` (the default) with `request.security()` to avoid look-ahead bias / repainting.

## Volume Notes
NGX volume is reported in **units of shares** (not lots). Typical liquid stocks trade
1–10 million shares per day. Thinly traded small-caps may show zero volume on many bars.

```pine
// Volume spike: current bar volume vs 20-bar average
avgVol = ta.sma(volume, 20)
isVolumeSpike = volume > avgVol * 2.0
```

## News-Driven Price Action Patterns

### Volume Spikes
Major corporate announcements (earnings, dividends, M&A, regulatory news) on NGX
almost always produce volume spikes before or at the time of price movement.
A bar with volume > 2× the 20-day average is a reliable signal of information-driven trading.

### Gap Opens
NGX opens at a single price set by the pre-market matching engine. After significant
overnight news (OPEC decisions, CBN policy, company releases), the opening price can
gap sharply from the prior close. A gap > 2% is noteworthy; > 5% is a major event.

```pine
// Detect gap opens
gapUpOpen  = open > close[1] * 1.02   // Gap up > 2%
gapDnOpen  = open < close[1] * 0.98   // Gap down > 2%
bigGap     = math.abs(open - close[1]) / close[1] > 0.05  // > 5% gap
```

### Intraday Momentum
Because NGX sessions are only 4.5 hours long, significant intraday moves (> 3%)
in the first hour often signal directional commitment tied to news events.

### Price Limits
NGX enforces daily price change limits. Individual stocks are typically capped at
**±10%** from the prior close. The All Share Index itself has no limit.

## Comparing Current Price to Historical Levels

```pine
// Key reference levels for NGX stocks
weekHigh  = ta.highest(high, 5)    // 1-week high
weekLow   = ta.lowest(low, 5)      // 1-week low
monthHigh = ta.highest(high, 22)   // ~1-month high
monthLow  = ta.lowest(low, 22)     // ~1-month low
yearHigh  = ta.highest(high, 252)  // 52-week high
yearLow   = ta.lowest(low, 252)    // 52-week low
yearSMA   = ta.sma(close, 252)     // 1-year moving average

// Deviation from 1-year average (positive = above average)
deviation = (close - yearSMA) / yearSMA * 100
```

## Sector Rotation Context

NGX sectors behave differently around key macro events:
- **CBN monetary policy meetings** → banking stocks react to interest rate decisions
- **NNPC/OPEC announcements** → oil & gas stocks (SEPLAT, OANDO, TOTAL) react
- **Rainy season** → agricultural stocks (PRESCO, OKOMUOIL, FLOURMILL) seasonal patterns
- **Earnings season** → Q1 (April), Q2 (July), Q3 (October), Q4 (February) announcements

## Multi-Ticker Watchlist Pattern

```pine
//@version=6
indicator("NGX Sector Watch", overlay=false)

// Normalise multiple NGX stocks to compare relative performance
base   = request.security("NGX:NGSEINDEX", timeframe.period, close)
stock1 = request.security("NGX:DANGCEM",   timeframe.period, close)
stock2 = request.security("NGX:MTNN",      timeframe.period, close)

// Index-relative performance (1.0 = matching index)
rel1 = stock1 / stock1[252] / (base / base[252])
rel2 = stock2 / stock2[252] / (base / base[252])

plot(rel1, "DANGCEM vs Index", color=color.new(color.blue, 0))
plot(rel2, "MTNN vs Index",    color=color.new(color.orange, 0))
hline(1.0, "Index Baseline",  color=color.gray, linestyle=hline.style_dashed)
```
