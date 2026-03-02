import { readFileSync, existsSync } from "fs";
import { join } from "path";

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

interface HistoricalResult {
  ticker: string;
  period: string;
  from: string;
  to: string;
  totalBars: number;
  stats: TickerProfile;
  bars: OHLCVBar[];
  note?: string;
}

type HistoricalResponse = { error: string } | HistoricalResult;

// ─── Cache ────────────────────────────────────────────────────────────────────

let profilesCache: Record<string, TickerProfile> | null = null;

function loadProfiles(): Record<string, TickerProfile> | null {
  if (profilesCache) return profilesCache;
  if (!existsSync(PROFILES_FILE)) return null;
  try {
    profilesCache = JSON.parse(readFileSync(PROFILES_FILE, "utf-8")) as Record<string, TickerProfile>;
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

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getNgxHistorical(
  ticker: string,
  period: "1y" | "3y" | "5y" | "max" = "5y",
): Promise<HistoricalResponse> {
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
    return { ticker: t, period, from: profile.from, to: profile.to, totalBars: 0, stats: profile, bars: [], note: "raw bars not available" };
  }

  try {
    const history = JSON.parse(readFileSync(rawFile, "utf-8")) as { bars: OHLCVBar[] };
    const fromDate = periodToFromDate(period);
    const toDate   = new Date().toISOString().split("T")[0];
    const bars = history.bars.filter((b) => b.date >= fromDate && b.date <= toDate);

    return {
      ticker:    t,
      period,
      from:      bars[0]?.date ?? fromDate,
      to:        bars[bars.length - 1]?.date ?? toDate,
      totalBars: bars.length,
      stats:     profile,
      // Weekly-sampled bars to avoid overwhelming the context window
      bars:      bars.filter((_, i) => i % 5 === 0).slice(-200),
    };
  } catch {
    return { ticker: t, period, from: profile.from, to: profile.to, totalBars: 0, stats: profile, bars: [], note: "failed to load bars" };
  }
}
