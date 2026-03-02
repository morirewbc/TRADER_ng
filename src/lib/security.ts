import { NextRequest } from "next/server";

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_CODE_LENGTH = 50_000;     // chars — prevents prompt-stuffing via currentCode
const MAX_MESSAGE_LENGTH = 32_000;  // chars per message
const MAX_MESSAGES = 100;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30;           // requests per window per IP
const MAX_MODEL_LENGTH = 200;

const ALLOWED_PROVIDERS = new Set(["openrouter", "anthropic", "openai", "google", "ollama"]);

// Cloud metadata services — the primary SSRF targets
const SSRF_BLOCKED_HOSTS = [
  "169.254.169.254",           // AWS / Azure / GCP instance metadata
  "100.100.100.200",           // Alibaba Cloud metadata
  "metadata.google.internal",
  "metadata.goog",
  "metadata.internal",
];

// ─── Rate Limiter ─────────────────────────────────────────────────────────────

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// Prune expired entries every 2 minutes to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetAt < now) rateLimitStore.delete(key);
  }
}, RATE_LIMIT_WINDOW_MS * 2);

export function checkRateLimit(req: NextRequest): Response | null {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return new Response(
      JSON.stringify({ error: "Too many requests. Please slow down." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
        },
      },
    );
  }

  entry.count++;
  return null;
}

// ─── Input Validation ─────────────────────────────────────────────────────────

export function validateProvider(
  provider: unknown,
): provider is "openrouter" | "anthropic" | "openai" | "google" | "ollama" {
  return typeof provider === "string" && ALLOWED_PROVIDERS.has(provider);
}

export function validateModel(model: unknown): model is string {
  return (
    typeof model === "string" &&
    model.trim().length > 0 &&
    model.length <= MAX_MODEL_LENGTH &&
    // No control characters or null bytes
    !/[\x00-\x1f\x7f]/.test(model)
  );
}

export function validateMessages(
  messages: unknown,
): asserts messages is { role: "user" | "assistant"; content: string }[] {
  if (!Array.isArray(messages) || messages.length === 0)
    throw new Error("messages must be a non-empty array");
  if (messages.length > MAX_MESSAGES)
    throw new Error(`Too many messages (max ${MAX_MESSAGES})`);

  for (const msg of messages) {
    if (!msg || typeof msg !== "object") throw new Error("Invalid message format");
    if (msg.role !== "user" && msg.role !== "assistant")
      throw new Error(`Invalid message role: ${String(msg.role)}`);
    if (typeof msg.content !== "string") throw new Error("Message content must be a string");
    if (msg.content.length > MAX_MESSAGE_LENGTH)
      throw new Error(`Message exceeds maximum length (${MAX_MESSAGE_LENGTH} chars)`);
  }
}

// ─── SSRF Protection ──────────────────────────────────────────────────────────

/**
 * Validates a user-supplied Ollama URL.
 * Blocks cloud metadata endpoints (SSRF targets) while allowing
 * legitimate local and LAN Ollama instances.
 */
export function validateOllamaUrl(url: unknown): string {
  if (typeof url !== "string" || url.trim() === "") return "http://localhost:11434";

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid Ollama URL format");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Ollama URL must use http or https protocol");
  }

  // Block credentials in URL (user:pass@host)
  if (parsed.username || parsed.password) {
    throw new Error("Ollama URL must not contain credentials");
  }

  const hostname = parsed.hostname.toLowerCase();

  for (const blocked of SSRF_BLOCKED_HOSTS) {
    if (hostname === blocked || hostname.endsWith("." + blocked)) {
      throw new Error("Ollama URL points to a restricted address");
    }
  }

  return url;
}

// ─── Prompt Injection Protection ──────────────────────────────────────────────

/**
 * Sanitizes user-controlled code before embedding it in an LLM system prompt.
 * Truncates to prevent prompt stuffing. Uses XML tag delimiters in the caller
 * (more robust for LLMs than markdown fences).
 */
export function sanitizeCodeForPrompt(code: string): string {
  return code.slice(0, MAX_CODE_LENGTH);
}

// ─── Error Sanitization ───────────────────────────────────────────────────────

/**
 * Converts a raw provider SDK error into a safe, user-facing message.
 * Prevents leaking stack traces, internal URLs, API keys, or account details.
 */
export function sanitizeProviderError(err: unknown): string {
  const raw = (err as Error)?.message ?? String(err);

  if (/401|unauthorized|invalid.?api.?key|authentication/i.test(raw))
    return "Authentication failed. Check your API key.";
  if (/403|forbidden/i.test(raw))
    return "Access denied. Check your API key permissions.";
  if (/404|not.?found|no such model/i.test(raw))
    return "Model not found. Check your model name in settings.";
  if (/429|rate.?limit|too.?many/i.test(raw))
    return "Rate limit exceeded. Please wait and try again.";
  if (/quota|billing|insufficient.?credits/i.test(raw))
    return "API quota exceeded. Check your billing or usage limits.";
  if (/econnrefused|enotfound|network|timeout|connect/i.test(raw))
    return "Could not connect to provider. Check your network or Ollama URL.";

  return "Provider request failed. Check your settings and try again.";
}
