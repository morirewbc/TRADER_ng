import { readFileSync, existsSync } from "fs";
import { join } from "path";

const PROFILES_FILE = join(process.cwd(), "data/ngx-historical/profiles.json");
const RAW_DIR       = join(process.cwd(), "data/raw/historical");

let profilesCache: Record<string, unknown> | null = null;

function loadProfiles(): Record<string, unknown> | null {
  if (profilesCache) return profilesCache;
  if (!existsSync(PROFILES_FILE)) return null;
  try {
    profilesCache = JSON.parse(readFileSync(PROFILES_FILE, "utf-8")) as Record<string, unknown>;
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
  period: "1y" | "3y" | "5y" | "max" = "5y",
): Promise<Record<string, unknown>> {
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
    const history = JSON.parse(readFileSync(rawFile, "utf-8")) as {
      bars: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>;
    };
    const fromDate = periodToFromDate(period);
    const toDate   = new Date().toISOString().split("T")[0];
    const bars = history.bars.filter((b) => b.date >= fromDate && b.date <= toDate);

    return {
      ticker: t,
      period,
      from:      bars[0]?.date ?? fromDate,
      to:        bars[bars.length - 1]?.date ?? toDate,
      totalBars: bars.length,
      stats:     profile,
      // Weekly-sampled bars to avoid overwhelming context window
      bars:      bars.filter((_, i) => i % 5 === 0).slice(-200),
    };
  } catch {
    return { ticker: t, stats: profile, bars: [], note: "failed to load bars" };
  }
}
