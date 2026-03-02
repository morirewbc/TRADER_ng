"use client";

import { useState, useEffect, useCallback } from "react";
import { Newspaper, RefreshCw, ExternalLink } from "lucide-react";
import type { NewsArticle } from "@/app/api/news/route";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function SourceBadge({ source }: { source: string }) {
  const colors: Record<string, string> = {
    "NGX Group":      "bg-emerald-500/10 text-emerald-400",
    "BusinessDay":    "bg-sky-500/10 text-sky-400",
    "Punch Business": "bg-orange-500/10 text-orange-400",
    "The Nation":     "bg-violet-500/10 text-violet-400",
  };
  const cls = colors[source] ?? "bg-surface-elevated text-text-dim";
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${cls}`}>
      {source}
    </span>
  );
}

export default function NGXNewsFeed() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ngx/news");
      if (!res.ok) {
        setError("Failed to load news");
        return;
      }
      const data = await res.json();
      setArticles(data.articles ?? []);
      setLastFetched(new Date());
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  return (
    <div className="bg-surface border border-border rounded-lg flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <Newspaper size={13} className="text-primary shrink-0" />
        <span className="text-xs font-medium text-text flex-1">Market News</span>
        {lastFetched && (
          <span className="text-[10px] text-text-muted">
            {timeAgo(lastFetched.toISOString())}
          </span>
        )}
        <button
          onClick={fetchNews}
          disabled={loading}
          className="text-text-dim hover:text-text-secondary transition-colors disabled:opacity-40"
          title="Refresh news"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && articles.length === 0 ? (
          <div className="flex flex-col gap-px p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-2 py-3 space-y-1.5 animate-pulse">
                <div className="h-2.5 bg-surface-elevated rounded w-full" />
                <div className="h-2.5 bg-surface-elevated rounded w-3/4" />
                <div className="h-2 bg-surface-elevated rounded w-1/3 mt-1" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 px-4 text-center">
            <p className="text-xs text-accent-error">{error}</p>
            <button
              onClick={fetchNews}
              className="text-[11px] text-text-dim hover:text-text-secondary underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-1 text-center px-4">
            <Newspaper size={24} className="text-text-muted opacity-40 mb-1" />
            <p className="text-xs text-text-muted">No articles found</p>
          </div>
        ) : (
          articles.map((article, i) => (
            <a
              key={`${article.url}-${i}`}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3 py-2.5 hover:bg-surface-elevated border-b border-border last:border-b-0 group transition-colors"
            >
              <p className="text-[11px] text-text-secondary group-hover:text-text line-clamp-2 leading-relaxed">
                {article.title}
              </p>

              {/* Ticker mentions */}
              {article.mentions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {article.mentions.slice(0, 3).map((m) => (
                    <span
                      key={m}
                      className="px-1 py-0.5 rounded text-[9px] font-mono bg-primary/10 text-primary"
                    >
                      {m}
                    </span>
                  ))}
                  {article.mentions.length > 3 && (
                    <span className="text-[9px] text-text-muted">+{article.mentions.length - 3}</span>
                  )}
                </div>
              )}

              {/* Meta row */}
              <div className="flex items-center gap-1.5 mt-1.5">
                <SourceBadge source={article.source} />
                <span className="text-[10px] text-text-muted">{timeAgo(article.publishedAt)}</span>
                <ExternalLink
                  size={9}
                  className="ml-auto opacity-0 group-hover:opacity-40 transition-opacity text-text-muted"
                />
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
