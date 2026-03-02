"use client";

import { RefreshCw, Newspaper, ExternalLink, Clock } from "lucide-react";
import type { NewsArticle } from "@/hooks/useNews";

interface NewsPanelProps {
  articles: NewsArticle[];
  loading: boolean;
  error: string | null;
  lastFetched: Date | null;
  detectedTickers: string[];
  onRefresh: () => void;
}

function timeAgo(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function TickerBadge({ ticker }: { ticker: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
      {ticker}
    </span>
  );
}

function ArticleItem({ article }: { article: NewsArticle }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block px-4 py-3 hover:bg-surface-elevated transition-colors border-b border-border last:border-b-0 group"
    >
      <p className="text-xs text-text leading-snug mb-1.5 group-hover:text-white transition-colors line-clamp-2">
        {article.title}
      </p>

      {article.mentions.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {article.mentions.map((t) => (
            <TickerBadge key={t} ticker={t} />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-1">
        <span className="text-[10px] text-text-muted font-medium">{article.source}</span>
        <span className="text-[10px] text-text-muted">·</span>
        <span className="text-[10px] text-text-muted flex items-center gap-0.5">
          <Clock size={9} />
          {timeAgo(article.publishedAt)}
        </span>
        <ExternalLink size={9} className="ml-auto text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </a>
  );
}

export default function NewsPanel({
  articles,
  loading,
  error,
  lastFetched,
  detectedTickers,
  onRefresh,
}: NewsPanelProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Newspaper size={14} className="text-primary shrink-0" />
        <span className="text-xs font-medium text-text flex-1">Market News</span>

        {detectedTickers.length > 0 && (
          <div className="flex flex-wrap gap-1 mr-1">
            {detectedTickers.slice(0, 3).map((t) => (
              <TickerBadge key={t} ticker={t} />
            ))}
            {detectedTickers.length > 3 && (
              <span className="text-[10px] text-text-muted">+{detectedTickers.length - 3}</span>
            )}
          </div>
        )}

        <button
          onClick={onRefresh}
          disabled={loading}
          title="Refresh news"
          className="p-1 rounded hover:bg-surface-elevated text-text-muted hover:text-text transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Ticker context */}
      {detectedTickers.length > 0 && (
        <div className="px-4 py-2 border-b border-border bg-surface shrink-0">
          <p className="text-[10px] text-text-muted">
            Showing news for{" "}
            <span className="text-text-secondary">
              {detectedTickers.join(", ")}
            </span>
            {" "}detected in editor
          </p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Loading */}
        {loading && articles.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-8">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-primary"
                  style={{ animation: `streaming-dot 1.2s ${i * 0.2}s ease-in-out infinite` }}
                />
              ))}
            </div>
            <span className="text-xs text-text-muted">Fetching news…</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-accent-error mb-2">{error}</p>
            <button
              onClick={onRefresh}
              className="text-xs text-primary hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state — not yet fetched */}
        {!loading && !error && articles.length === 0 && !lastFetched && (
          <div className="px-4 py-8 text-center">
            <Newspaper size={24} className="text-text-muted mx-auto mb-3" />
            <p className="text-xs text-text-dim mb-1">No news loaded yet</p>
            <p className="text-[11px] text-text-muted mb-4">
              {detectedTickers.length > 0
                ? "Click refresh to fetch latest NGX headlines"
                : "Generate a script with NGX tickers to auto-load relevant news"}
            </p>
            <button
              onClick={onRefresh}
              className="px-3 py-1.5 text-xs rounded-lg bg-surface-elevated border border-border text-text-secondary hover:text-text hover:border-border-subtle transition-colors"
            >
              Fetch news
            </button>
          </div>
        )}

        {/* Empty after fetch */}
        {!loading && !error && articles.length === 0 && lastFetched && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-text-dim">No recent NGX articles found</p>
            <p className="text-[11px] text-text-muted mt-1">
              Updated {timeAgo(lastFetched.toISOString())}
            </p>
          </div>
        )}

        {/* Articles */}
        {articles.length > 0 && (
          <>
            {loading && (
              <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border bg-surface text-[10px] text-text-muted">
                <RefreshCw size={9} className="animate-spin" />
                Refreshing…
              </div>
            )}
            {articles.map((article, i) => (
              <ArticleItem key={`${article.url}-${i}`} article={article} />
            ))}
            {lastFetched && (
              <div className="px-4 py-2 text-[10px] text-text-muted text-center border-t border-border">
                Updated {timeAgo(lastFetched.toISOString())} · {articles.length} articles
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
