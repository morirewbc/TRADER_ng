export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface UsageCost {
  inputPer1M: number;
  outputPer1M: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  source: "openrouter-live" | "ollama-local";
}

export interface UsageRecord {
  stage: "generation" | "review" | "fix";
  provider: string;
  model: string;
  tokens: TokenUsage;
  cost: UsageCost | null;
}

interface PricingRate {
  inputPer1M: number;
  outputPer1M: number;
  source: UsageCost["source"];
}

interface OpenRouterCache {
  expiresAt: number;
  rates: Map<string, PricingRate>;
}

let openRouterCache: OpenRouterCache | null = null;

const CACHE_TTL_MS = 15 * 60 * 1000;

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function normalizeTokenUsage(partial: {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
}): TokenUsage {
  const input = Math.max(0, Number(partial.inputTokens ?? 0));
  const output = Math.max(0, Number(partial.outputTokens ?? 0));
  const total = Math.max(0, Number(partial.totalTokens ?? input + output));
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: total,
  };
}

async function fetchOpenRouterRates(): Promise<Map<string, PricingRate>> {
  if (openRouterCache && openRouterCache.expiresAt > Date.now()) {
    return openRouterCache.rates;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`OpenRouter pricing request failed (${res.status})`);

    const json = await res.json() as {
      data?: Array<{
        id?: string;
        pricing?: { prompt?: string; completion?: string };
      }>;
    };

    const rates = new Map<string, PricingRate>();
    for (const model of json.data ?? []) {
      if (!model.id || !model.pricing) continue;

      const promptRate = Number(model.pricing.prompt ?? "NaN");
      const completionRate = Number(model.pricing.completion ?? "NaN");
      if (!Number.isFinite(promptRate) || !Number.isFinite(completionRate)) continue;

      rates.set(model.id, {
        inputPer1M: promptRate * 1_000_000,
        outputPer1M: completionRate * 1_000_000,
        source: "openrouter-live",
      });
    }

    openRouterCache = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      rates,
    };
    return rates;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolvePricingRate(provider: string, model: string): Promise<PricingRate | null> {
  if (provider === "ollama") {
    return {
      inputPer1M: 0,
      outputPer1M: 0,
      source: "ollama-local",
    };
  }

  if (provider !== "openrouter") return null;

  try {
    const rates = await fetchOpenRouterRates();
    return rates.get(model) ?? null;
  } catch {
    return null;
  }
}

export async function buildUsageRecord(payload: {
  stage: UsageRecord["stage"];
  provider: string;
  model: string;
  usage: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
  };
}): Promise<UsageRecord> {
  const tokens = normalizeTokenUsage(payload.usage);
  const rate = await resolvePricingRate(payload.provider, payload.model);

  if (!rate) {
    return {
      stage: payload.stage,
      provider: payload.provider,
      model: payload.model,
      tokens,
      cost: null,
    };
  }

  const inputCostUsd = (tokens.inputTokens / 1_000_000) * rate.inputPer1M;
  const outputCostUsd = (tokens.outputTokens / 1_000_000) * rate.outputPer1M;
  const totalCostUsd = inputCostUsd + outputCostUsd;

  return {
    stage: payload.stage,
    provider: payload.provider,
    model: payload.model,
    tokens,
    cost: {
      inputPer1M: rate.inputPer1M,
      outputPer1M: rate.outputPer1M,
      inputCostUsd: roundUsd(inputCostUsd),
      outputCostUsd: roundUsd(outputCostUsd),
      totalCostUsd: roundUsd(totalCostUsd),
      source: rate.source,
    },
  };
}

export function summarizeUsage(records: UsageRecord[]) {
  const totals = records.reduce(
    (acc, rec) => {
      acc.inputTokens += rec.tokens.inputTokens;
      acc.outputTokens += rec.tokens.outputTokens;
      acc.totalTokens += rec.tokens.totalTokens;
      if (rec.cost) acc.totalCostUsd += rec.cost.totalCostUsd;
      return acc;
    },
    { inputTokens: 0, outputTokens: 0, totalTokens: 0, totalCostUsd: 0 },
  );

  return {
    records,
    totals: {
      ...totals,
      totalCostUsd: roundUsd(totals.totalCostUsd),
    },
    pricedStages: records.filter((r) => r.cost !== null).length,
    unpricedStages: records.filter((r) => r.cost === null).map((r) => r.stage),
  };
}

