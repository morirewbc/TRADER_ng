import { TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import type { NGXIndex } from "@/app/api/ngx/market/route";

interface IndexBarProps {
  indices: NGXIndex[];
  loading: boolean;
  onRefresh: () => void;
}

function SkeletonCard() {
  return (
    <div className="bg-surface border border-border rounded-lg px-4 py-3 flex-1 animate-pulse">
      <div className="h-2.5 w-16 bg-surface-elevated rounded mb-2" />
      <div className="h-5 w-24 bg-surface-elevated rounded mb-1.5" />
      <div className="h-2.5 w-20 bg-surface-elevated rounded" />
    </div>
  );
}

export default function IndexBar({ indices, loading, onRefresh }: IndexBarProps) {
  if (loading && indices.length === 0) {
    return (
      <div className="flex gap-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  // Fallback placeholders if scraping returned nothing
  const displayIndices: NGXIndex[] =
    indices.length > 0
      ? indices
      : [
          { name: "ASI Index", value: "—", change: "—", direction: "flat" },
          { name: "NGX30", value: "—", change: "—", direction: "flat" },
          { name: "Market Cap", value: "—", change: "—", direction: "flat" },
        ];

  return (
    <div className="flex gap-3 items-stretch">
      {displayIndices.map((idx) => {
        const Icon =
          idx.direction === "up"
            ? TrendingUp
            : idx.direction === "down"
              ? TrendingDown
              : Minus;
        const changeColor =
          idx.direction === "up"
            ? "text-accent-success"
            : idx.direction === "down"
              ? "text-accent-error"
              : "text-text-muted";

        return (
          <div
            key={idx.name}
            className="bg-surface border border-border rounded-lg px-4 py-3 flex-1 min-w-0"
          >
            <p className="text-[11px] text-text-muted mb-0.5 truncate">{idx.name}</p>
            <p className="text-lg font-semibold text-text tabular-nums truncate">{idx.value}</p>
            <div className={`flex items-center gap-1 mt-0.5 text-xs ${changeColor}`}>
              <Icon size={12} />
              <span className="truncate">{idx.change}</span>
            </div>
          </div>
        );
      })}

      {/* Refresh button */}
      <button
        onClick={onRefresh}
        disabled={loading}
        className="flex items-center justify-center w-10 h-10 self-center rounded-lg text-text-dim hover:text-text-secondary hover:bg-surface-elevated transition-colors disabled:opacity-40"
        title="Refresh market data"
      >
        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
      </button>
    </div>
  );
}
