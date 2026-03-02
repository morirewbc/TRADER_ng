"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { NGXStock, NGXIndex } from "@/app/api/ngx/market/route";

export type { NGXStock, NGXIndex };

interface NGXMarketState {
  stocks: NGXStock[];
  indices: NGXIndex[];
  loading: boolean;
  error: string | null;
  lastFetched: Date | null;
}

export function useNGXMarket() {
  const [state, setState] = useState<NGXMarketState>({
    stocks: [],
    indices: [],
    loading: false,
    error: null,
    lastFetched: null,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMarket = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch("/api/ngx/market");
      if (!res.ok) {
        setState((prev) => ({ ...prev, loading: false, error: "Failed to load market data" }));
        return;
      }
      const data = await res.json();
      setState({
        stocks: data.stocks ?? [],
        indices: data.indices ?? [],
        loading: false,
        error: null,
        lastFetched: new Date(),
      });
    } catch {
      setState((prev) => ({ ...prev, loading: false, error: "Network error" }));
    }
  }, []);

  // Auto-fetch on mount, refresh every 5 minutes
  useEffect(() => {
    fetchMarket();
    intervalRef.current = setInterval(fetchMarket, 5 * 60 * 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchMarket]);

  return {
    ...state,
    fetchMarket,
  };
}
