export type Provider = "openrouter" | "anthropic" | "openai" | "google" | "ollama";

export type PineVersion = "v5" | "v6";

export interface Settings {
  provider: Provider;
  apiKey: string;
  model: string;
  ollamaUrl: string;
  pineVersion: PineVersion;
  transpilerEnabled?: boolean;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export type StreamStatus =
  | "idle"
  | "connecting"
  | "generating"
  | "streaming"
  | "validating"
  | "transpiling"
  | "reviewing"
  | "correcting"
  | "error";

export interface ValidationResult {
  rule: string;
  status: "pass" | "warn" | "error";
  message: string;
  line?: number;
  suggestion?: string;
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
  tokens: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  cost: UsageCost | null;
}

export interface UsageSummary {
  records: UsageRecord[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    totalCostUsd: number;
  };
  pricedStages: number;
  unpricedStages: Array<UsageRecord["stage"]>;
}

export interface ChatState {
  messages: Message[];
  currentCode: string;
  codeTitle: string;
  isStreaming: boolean;
  streamStatus: StreamStatus;
  error: string | null;
  validationResults: ValidationResult[];
  correctedCode: string | null;
  usageSummary: UsageSummary | null;
}

export const DEFAULT_SETTINGS: Settings = {
  provider: "openrouter",
  apiKey: "",
  model: "anthropic/claude-sonnet-4.5",
  ollamaUrl: "http://localhost:11434",
  pineVersion: "v6",
  transpilerEnabled: false,
};

export const PROVIDER_MODELS: Record<Provider, string[]> = {
  openrouter: [
    "meta-llama/llama-3.2-3b-instruct:free",
    "anthropic/claude-sonnet-4.5",
    "anthropic/claude-3-haiku",
    "google/gemini-2.5-pro",
    "google/gemini-2.5-flash",
  ],
  anthropic: ["claude-sonnet-4-6", "claude-opus-4-6"],
  openai: ["gpt-4.1", "gpt-4.1-mini", "o3"],
  google: ["gemini-2.5-pro", "gemini-2.5-flash"],
  ollama: [],
};

export const STORAGE_KEY = "pinescript-ai-settings";

export interface ReviewIssue {
  severity: "error" | "warning" | "info";
  line?: number;
  description: string;
  fix: string;
}
