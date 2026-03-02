"use client";

import Sidebar from "@/components/layout/Sidebar";
import IndexBar from "@/components/ngx/IndexBar";
import StockTable from "@/components/ngx/StockTable";
import NGXNewsFeed from "@/components/ngx/NGXNewsFeed";
import { useNGXMarket } from "@/hooks/useNGXMarket";

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export default function NGXPage() {
  const market = useNGXMarket();

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="ml-[56px] flex-1 flex flex-col p-5 gap-4 min-h-screen">
        {/* Page header */}
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-base font-semibold text-text">NGX Market Dashboard</h1>
            <p className="text-[11px] text-text-muted mt-0.5">
              Nigerian Exchange Group · Live market data
            </p>
          </div>
          <div className="text-[11px] text-text-muted">
            {market.loading && market.lastFetched === null
              ? "Loading…"
              : market.lastFetched
                ? `Updated ${timeAgo(market.lastFetched)}`
                : market.error
                  ? "Data unavailable"
                  : null}
          </div>
        </div>

        {/* Index summary */}
        <IndexBar
          indices={market.indices}
          loading={market.loading}
          onRefresh={market.fetchMarket}
        />

        {/* Error banner */}
        {market.error && (
          <div className="px-4 py-2.5 bg-accent-error/10 border border-accent-error/20 rounded-lg text-xs text-accent-error shrink-0">
            {market.error} —{" "}
            <button
              onClick={market.fetchMarket}
              className="underline underline-offset-2 hover:opacity-80"
            >
              retry
            </button>
          </div>
        )}

        {/* Main content: stock table + news feed */}
        <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
          {/* Stock table — fills remaining width */}
          <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
            <StockTable stocks={market.stocks} loading={market.loading} />
          </div>

          {/* News feed — fixed width sidebar */}
          <div className="w-72 shrink-0 flex flex-col overflow-hidden">
            <NGXNewsFeed />
          </div>
        </div>
      </main>
    </div>
  );
}
