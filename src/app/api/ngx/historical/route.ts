import { NextRequest } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { checkRateLimit } from "@/lib/security";
import { loadProfiles, OHLCVBar } from "@/lib/data/historical";

const RAW_DIR = join(process.cwd(), "data/raw/historical");

// ─── Period → from-date ────────────────────────────────────────────────────────

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
      { status: 503 },
    );
  }

  const { searchParams } = new URL(req.url);
  const ticker    = searchParams.get("ticker")?.toUpperCase();
  const period    = searchParams.get("period") ?? "5y";
  const fromParam = searchParams.get("from");
  const toParam   = searchParams.get("to");

  if (!ticker) {
    return Response.json({ error: "ticker parameter required" }, { status: 400 });
  }

  const profile = profiles[ticker];
  if (!profile) {
    return Response.json({ error: `No historical data for ${ticker}` }, { status: 404 });
  }

  // Stats-only shortcut
  if (!fromParam && !toParam && period === "stats") {
    return Response.json({ ticker, stats: profile });
  }

  // Load raw bars on demand
  const rawFile = join(RAW_DIR, `${ticker}.json`);
  if (!existsSync(rawFile)) {
    return Response.json({ ticker, bars: [], stats: profile, note: "raw bars not available" });
  }

  let bars: OHLCVBar[];
  try {
    const history = JSON.parse(readFileSync(rawFile, "utf-8"));
    bars = history.bars as OHLCVBar[];
  } catch {
    return Response.json({ ticker, bars: [], stats: profile, note: "failed to load raw bars" });
  }

  const fromDate = fromParam ?? periodToFromDate(period);
  const toDate   = toParam   ?? new Date().toISOString().split("T")[0];

  const filtered = bars.filter((b) => b.date >= fromDate && b.date <= toDate);

  return Response.json({
    ticker,
    name:      profile.name,
    board:     profile.board,
    from:      filtered[0]?.date ?? fromDate,
    to:        filtered[filtered.length - 1]?.date ?? toDate,
    totalBars: filtered.length,
    bars:      filtered,
    stats:     profile,
  });
}
