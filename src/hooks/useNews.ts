"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { NewsArticle } from "@/app/api/news/route";

export type { NewsArticle };

interface NewsState {
  articles: NewsArticle[];
  loading: boolean;
  error: string | null;
  lastFetched: Date | null;
}

// Extract NGX ticker codes from PineScript code
// Matches: "NGX:DANGCEM" or 'NGX:MTNN' patterns
export function extractNGXTickers(code: string): string[] {
  if (!code) return [];
  const matches = code.match(/["']NGX:([A-Z0-9]+)["']/g) ?? [];
  const tickers = matches
    .map((m) => m.replace(/["']NGX:/g, "").replace(/["']/g, ""))
    .filter((t) => t.length > 0);
  return [...new Set(tickers)]; // deduplicate
}

export function useNews(currentCode: string) {
  const [state, setState] = useState<NewsState>({
    articles: [],
    loading: false,
    error: null,
    lastFetched: null,
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTickersRef = useRef<string>("");

  const fetchNews = useCallback(async (tickers: string[]) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const params = tickers.length > 0 ? `?tickers=${tickers.join(",")}` : "";
      const res = await fetch(`/api/news${params}`);
      if (!res.ok) {
        setState((prev) => ({ ...prev, loading: false, error: "Failed to load news" }));
        return;
      }
      const data = await res.json();
      setState({
        articles: data.articles ?? [],
        loading: false,
        error: null,
        lastFetched: new Date(),
      });
    } catch {
      setState((prev) => ({ ...prev, loading: false, error: "Network error fetching news" }));
    }
  }, []);

  // Auto-fetch when tickers in currentCode change (debounced)
  useEffect(() => {
    const tickers = extractNGXTickers(currentCode);
    const tickerKey = tickers.sort().join(",");

    // Skip if tickers haven't changed
    if (tickerKey === lastTickersRef.current) return;
    lastTickersRef.current = tickerKey;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Only auto-fetch if there are NGX tickers in the code
    if (tickers.length === 0) return;

    debounceRef.current = setTimeout(() => {
      fetchNews(tickers);
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [currentCode, fetchNews]);

  const detectedTickers = extractNGXTickers(currentCode);

  return {
    ...state,
    detectedTickers,
    fetchNews: () => fetchNews(detectedTickers),
    fetchNewsByTickers: fetchNews,
  };
}
