"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, Search, ArrowUpRight } from "lucide-react";
import type { NGXStock } from "@/app/api/ngx/market/route";

type Board = "All" | "Premium" | "Main" | "Growth";
type SortKey = "ticker" | "price" | "changePercent" | "volume";
type SortDir = "asc" | "desc";

const BOARD_TABS: Board[] = ["All", "Premium", "Main", "Growth"];

const BOARD_BADGE: Record<string, string> = {
  Premium: "bg-emerald-500/10 text-emerald-400",
  Main:    "bg-sky-500/10 text-sky-400",
  Growth:  "bg-violet-500/10 text-violet-400",
};

function formatPrice(n: number): string {
  return n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatVolume(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toString();
}

function SkeletonRow() {
  return (
    <tr className="border-b border-border">
      {[1, 2, 3, 4, 5].map((i) => (
        <td key={i} className="px-3 py-2.5">
          <div className="h-3 bg-surface-elevated rounded animate-pulse" style={{ width: `${40 + i * 12}%` }} />
        </td>
      ))}
    </tr>
  );
}

interface StockTableProps {
  stocks: NGXStock[];
  loading: boolean;
}

export default function StockTable({ stocks, loading }: StockTableProps) {
  const router = useRouter();
  const [activeBoard, setActiveBoard] = useState<Board>("All");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("ticker");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "changePercent" ? "desc" : "asc");
    }
  }

  const filtered = useMemo(() => {
    let list = stocks;

    if (activeBoard !== "All") {
      list = list.filter((s) => s.board === activeBoard);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) => s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
      );
    }

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "ticker") cmp = a.ticker.localeCompare(b.ticker);
      else if (sortKey === "price") cmp = a.price - b.price;
      else if (sortKey === "changePercent") cmp = a.changePercent - b.changePercent;
      else if (sortKey === "volume") cmp = a.volume - b.volume;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [stocks, activeBoard, search, sortKey, sortDir]);

  function handleRowClick(stock: NGXStock) {
    const prompt = `Generate a PineScript v6 indicator for NGX:${stock.ticker} (${stock.name}). Include volume analysis and a 20-bar moving average with buy/sell signals.`;
    localStorage.setItem("ngx_preprompt", JSON.stringify({ prompt, ts: Date.now() }));
    router.push("/chat");
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronDown size={10} className="opacity-30" />;
    return sortDir === "asc"
      ? <ChevronUp size={10} className="text-primary" />
      : <ChevronDown size={10} className="text-primary" />;
  }

  return (
    <div className="bg-surface border border-border rounded-lg flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-3 pt-3 pb-2 border-b border-border shrink-0 space-y-2">
        {/* Board tabs */}
        <div className="flex gap-1">
          {BOARD_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveBoard(tab)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                activeBoard === tab
                  ? "bg-surface-elevated text-text"
                  : "text-text-dim hover:text-text-secondary"
              }`}
            >
              {tab}
              {tab !== "All" && (
                <span className="ml-1 text-[10px] text-text-muted">
                  {stocks.filter((s) => s.board === tab).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ticker or name…"
            className="w-full pl-7 pr-3 py-1.5 bg-background border border-border rounded-md text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-border-subtle"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface z-10">
            <tr className="border-b border-border">
              <th
                className="px-3 py-2 text-left text-text-muted font-medium cursor-pointer hover:text-text-secondary select-none"
                onClick={() => handleSort("ticker")}
              >
                <div className="flex items-center gap-1">Ticker <SortIcon k="ticker" /></div>
              </th>
              <th className="px-3 py-2 text-left text-text-muted font-medium">Company</th>
              <th
                className="px-3 py-2 text-right text-text-muted font-medium cursor-pointer hover:text-text-secondary select-none"
                onClick={() => handleSort("price")}
              >
                <div className="flex items-center justify-end gap-1">Price <SortIcon k="price" /></div>
              </th>
              <th
                className="px-3 py-2 text-right text-text-muted font-medium cursor-pointer hover:text-text-secondary select-none"
                onClick={() => handleSort("changePercent")}
              >
                <div className="flex items-center justify-end gap-1">Chg% <SortIcon k="changePercent" /></div>
              </th>
              <th
                className="px-3 py-2 text-right text-text-muted font-medium cursor-pointer hover:text-text-secondary select-none"
                onClick={() => handleSort("volume")}
              >
                <div className="flex items-center justify-end gap-1">Vol <SortIcon k="volume" /></div>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && stocks.length === 0
              ? Array.from({ length: 12 }).map((_, i) => <SkeletonRow key={i} />)
              : filtered.length === 0
                ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-text-muted">
                      {search ? "No stocks match your search" : "No stocks available"}
                    </td>
                  </tr>
                )
                : filtered.map((stock) => {
                  const isUp = stock.change > 0;
                  const isDown = stock.change < 0;
                  const changeColor = isUp
                    ? "text-accent-success"
                    : isDown
                      ? "text-accent-error"
                      : "text-text-muted";

                  return (
                    <tr
                      key={stock.ticker}
                      onClick={() => handleRowClick(stock)}
                      className="border-b border-border hover:bg-surface-elevated cursor-pointer group transition-colors"
                    >
                      {/* Ticker + badges */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-medium text-text">{stock.ticker}</span>
                          {stock.isPenny && (
                            <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-400">
                              P
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Company name + board badge */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-text-secondary truncate max-w-[180px]">{stock.name}</span>
                          <span className={`hidden sm:inline-block shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium ${BOARD_BADGE[stock.board]}`}>
                            {stock.board}
                          </span>
                        </div>
                      </td>

                      {/* Price */}
                      <td className="px-3 py-2.5 text-right tabular-nums text-text">
                        ₦{formatPrice(stock.price)}
                      </td>

                      {/* Change % */}
                      <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${changeColor}`}>
                        {isUp ? "+" : ""}{stock.changePercent.toFixed(2)}%
                      </td>

                      {/* Volume + chat icon on hover */}
                      <td className="px-3 py-2.5 text-right tabular-nums text-text-muted">
                        <div className="flex items-center justify-end gap-1.5">
                          <span>{formatVolume(stock.volume)}</span>
                          <ArrowUpRight
                            size={11}
                            className="opacity-0 group-hover:opacity-60 transition-opacity text-primary shrink-0"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      {!loading && filtered.length > 0 && (
        <div className="px-3 py-2 border-t border-border text-[10px] text-text-muted shrink-0">
          {filtered.length} {filtered.length === 1 ? "stock" : "stocks"}
          {activeBoard !== "All" && ` · ${activeBoard} Board`}
          {search && ` matching "${search}"`}
          {" · Click any row to generate PineScript"}
        </div>
      )}
    </div>
  );
}
