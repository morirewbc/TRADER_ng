import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { searchRAG } from "@/lib/rag";
import { validatePineScript } from "@/lib/validator";
import { reviewCode, fixCode } from "@/lib/ai/reviewer";
import {
  checkRateLimit,
  validateProvider,
  validateModel,
  validateMessages,
  validateOllamaUrl,
  sanitizeCodeForPrompt,
  sanitizeProviderError,
} from "@/lib/security";

interface ChatRequestBody {
  messages: { role: "user" | "assistant"; content: string }[];
  settings: {
    provider: "openrouter" | "anthropic" | "openai" | "google" | "ollama";
    apiKey: string;
    model: string;
    ollamaUrl?: string;
    transpilerEnabled?: boolean;
  };
  pineVersion?: "v5" | "v6";
  currentCode?: string;
  test?: boolean;
}

function buildSystemPrompt(pineVersion: string, currentCode?: string, ragContext?: string): string {
  const version = pineVersion === "v5" ? "5" : "6";

  let prompt = `You are PineScript AI, an expert TradingView Pine Script developer. You generate production-ready Pine Script v${version} code.

## Response Format
Always put the complete code block FIRST, then explanation after. Use \`\`\`pinescript fenced code blocks.

## Pine Script v${version} Rules
- Use //@version=${version} as the first line
${version === "6" ? `- Use indicator() NOT study() — study() is deprecated
- Use color.new() NOT transp parameter — transp is deprecated
- Use ternary operator (condition ? a : b) NOT iff() — iff() is deprecated
- plot.style_dashed DOES NOT EXIST — use plot.style_line with linewidth
- fill() cannot mix hline and plot references — both must be the same type
- input.int() and input.float() use defval, NOT def
- method keyword for defining methods on types
- Type system: int, float, bool, string, color with series/simple/const qualifiers` : `- Use study() or indicator() for indicators
- Use strategy() for strategies
- transp parameter is available but color.new() is preferred`}

## Best Practices
- Always include descriptive indicator/strategy titles
- Use input() functions for configurable parameters
- Add proper default values for all inputs
- Include meaningful plot colors and styles
- Handle edge cases (na values, first bars)
- Add comments for complex logic sections
- Use var for variables that persist across bars
- Prefer built-in ta.* functions over manual calculations

## NGX Market Data (Nigerian Exchange Group)
When generating code for Nigerian Exchange Group stocks, always use the NGX: prefix:
- Individual stocks: "NGX:DANGCEM", "NGX:MTNN", "NGX:AIRTELAFRI", "NGX:ZENITHBANK", "NGX:GTCO"
- All Share Index: "NGX:NGSEINDEX" | NGX 30: "NGX:NGX30" | Banking: "NGX:NGXBNK10"
- Market hours: 10:00–14:30 WAT (UTC+1), Monday–Friday
- Currency: NGN — format with str.tostring(value, "#,###.##")
- Volume spikes (>2× 20-bar avg) and gap opens (>2%) are common NGX news-driven signals
- Always use barmerge.lookahead_off (default) with request.security() to avoid repainting`;

  if (ragContext) {
    prompt += `\n\n${ragContext}`;
  }

  if (currentCode) {
    // Sanitize user-controlled code before embedding in the system prompt.
    // XML tags are used as delimiters — more robust against injection than markdown fences.
    const sanitized = sanitizeCodeForPrompt(currentCode);
    prompt += `

## Current Code Context
The user has the following code in their editor. When they ask for modifications, update THIS code rather than creating from scratch:

<current_code>
${sanitized}
</current_code>`;
  }

  return prompt;
}

function buildRAGContext(query: string): string {
  const results = searchRAG(query);
  if (results.length === 0) return "";

  const refs = results.filter((r) => r.type === "reference");
  const docs = results.filter((r) => r.type === "documentation");
  const examples = results.filter((r) => r.type === "example");

  let context = `## PINESCRIPT v6 REFERENCE CONTEXT
(Use these exact signatures — do NOT invent functions or parameters.)`;

  if (refs.length > 0) {
    context += `\n\n--- FUNCTION SIGNATURES ---\n${refs.map((r) => r.content).join("\n\n")}`;
  }

  if (docs.length > 0) {
    context += `\n\n--- DOCUMENTATION ---\n${docs.map((r) => r.content).join("\n\n")}`;
  }

  if (examples.length > 0) {
    context += `\n\n--- EXAMPLE CODE ---\n${examples.map((r) => r.content).join("\n\n")}`;
  }

  return context;
}

function extractCodeFromContent(content: string): string | null {
  const match = content.match(/```(?:pinescript|pine)\s*\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

async function streamAnthropic(
  messages: ChatRequestBody["messages"],
  systemPrompt: string,
  apiKey: string,
  model: string,
  signal: AbortSignal,
) {
  const client = new Anthropic({ apiKey });

  const stream = client.messages.stream(
    {
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    },
    { signal },
  );

  return stream;
}

async function streamOpenAI(
  messages: ChatRequestBody["messages"],
  systemPrompt: string,
  apiKey: string,
  model: string,
  baseURL: string | undefined,
  signal: AbortSignal,
) {
  const client = new OpenAI({
    apiKey: apiKey || "ollama",
    ...(baseURL && { baseURL }),
  });

  const stream = await client.chat.completions.create(
    {
      model,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    },
    { signal },
  );

  return stream;
}

export async function POST(req: NextRequest) {
  // Rate limiting
  const rateLimitResponse = checkRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  let body: ChatRequestBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { messages, settings, pineVersion = "v6", currentCode, test } = body;

  if (!settings) {
    return Response.json({ error: "Missing settings" }, { status: 400 });
  }

  // Runtime validation of provider and model (not just TypeScript types)
  if (!validateProvider(settings.provider)) {
    return Response.json({ error: "Invalid provider" }, { status: 400 });
  }
  if (!validateModel(settings.model)) {
    return Response.json({ error: "Invalid model" }, { status: 400 });
  }

  const { provider, apiKey, model } = settings;

  // SSRF protection: validate the Ollama URL before any network call
  let safeOllamaUrl: string;
  try {
    safeOllamaUrl = validateOllamaUrl(settings.ollamaUrl);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }

  if (provider !== "ollama" && !apiKey) {
    return Response.json({ error: "API key is required" }, { status: 401 });
  }

  // Test mode — validate messages separately since test doesn't need them
  if (test) {
    try {
      if (provider === "anthropic") {
        const client = new Anthropic({ apiKey });
        await client.messages.create({
          model,
          max_tokens: 10,
          messages: [{ role: "user", content: "Hi" }],
        });
      } else if (provider === "openai") {
        const client = new OpenAI({ apiKey });
        await client.chat.completions.create({
          model,
          max_tokens: 10,
          messages: [{ role: "user", content: "Hi" }],
        });
      } else if (provider === "openrouter") {
        const client = new OpenAI({
          apiKey,
          baseURL: "https://openrouter.ai/api/v1",
        });
        await client.chat.completions.create({
          model,
          max_tokens: 10,
          messages: [{ role: "user", content: "Hi" }],
        });
      } else if (provider === "google") {
        const client = new OpenAI({
          apiKey,
          baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
        });
        await client.chat.completions.create({
          model,
          max_tokens: 10,
          messages: [{ role: "user", content: "Hi" }],
        });
      } else if (provider === "ollama") {
        const client = new OpenAI({
          apiKey: "ollama",
          baseURL: `${safeOllamaUrl}/v1`,
        });
        await client.chat.completions.create({
          model,
          max_tokens: 10,
          messages: [{ role: "user", content: "Hi" }],
        });
      }
      return Response.json({ ok: true });
    } catch (err) {
      // In test mode, return a more useful error to help users configure correctly
      const msg = sanitizeProviderError(err);
      const raw = (err as Error)?.message ?? "";
      const status = /401|unauthorized/i.test(raw) ? 401 : /404|not.?found/i.test(raw) ? 404 : 500;
      return Response.json({ error: msg }, { status });
    }
  }

  // Validate messages for normal (non-test) requests
  try {
    validateMessages(messages);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }

  // Build RAG context from the last user message
  const lastUserMessage = messages[messages.length - 1]?.content || "";
  const ragContext = buildRAGContext(lastUserMessage);
  const systemPrompt = buildSystemPrompt(pineVersion, currentCode, ragContext);

  const encoder = new TextEncoder();
  const signal = req.signal;

  const stream = new ReadableStream({
    async start(controller) {
      let fullContent = "";

      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Phase 1: Stream the generation
        if (provider === "anthropic") {
          const anthropicStream = await streamAnthropic(messages, systemPrompt, apiKey, model, signal);

          for await (const event of anthropicStream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              fullContent += event.delta.text;
              send({ text: event.delta.text });
            }
          }
        } else {
          const baseURL =
            provider === "openrouter"
              ? "https://openrouter.ai/api/v1"
              : provider === "google"
              ? "https://generativelanguage.googleapis.com/v1beta/openai/"
              : provider === "ollama"
                ? `${safeOllamaUrl}/v1`
                : undefined;
          const openaiStream = await streamOpenAI(messages, systemPrompt, apiKey, model, baseURL, signal);

          for await (const chunk of openaiStream) {
            const text = chunk.choices[0]?.delta?.content;
            if (text) {
              fullContent += text;
              send({ text });
            }
          }
        }

        // Phase 2: Post-generation validation pipeline
        const generatedCode = extractCodeFromContent(fullContent);
        if (generatedCode) {
          const version = pineVersion === "v5" ? "v5" : "v6";

          // Step 1: Static validation
          send({ status: "validating" });
          const staticResults = validatePineScript(generatedCode, version);

          // Step 1.5: Transpiler validation (if enabled)
          let transpilerResults: typeof staticResults = [];
          if (settings.transpilerEnabled) {
            send({ status: "transpiling" });
            const { transpileValidate } = await import("@/lib/transpiler");
            transpilerResults = transpileValidate(generatedCode);
          }

          const allStaticResults = [...staticResults, ...transpilerResults];
          const hasStaticErrors = allStaticResults.some((r) => r.status === "error");

          if (!hasStaticErrors) {
            // Step 2: AI review (only if static passes)
            send({ status: "reviewing" });
            try {
              const reviewResult = await reviewCode(
                generatedCode,
                provider,
                apiKey,
                model,
                safeOllamaUrl,
              );

              if (reviewResult.verdict === "needs_fix" && reviewResult.issues.length > 0) {
                // Step 3: Auto-fix
                send({ status: "correcting" });
                const fixedCode = await fixCode(
                  generatedCode,
                  reviewResult.issues,
                  provider,
                  apiKey,
                  model,
                  safeOllamaUrl,
                );

                if (fixedCode) {
                  // Re-validate fixed code (static only, no more LLM calls)
                  const fixedResults = validatePineScript(fixedCode, version);

                  // Merge review issues as validation results
                  const allResults = [
                    ...fixedResults,
                    ...reviewResult.issues.map((issue) => ({
                      rule: "ai-review",
                      status: "warn" as const,
                      message: `${issue.description} (auto-corrected)`,
                      line: issue.line,
                      suggestion: issue.fix,
                    })),
                  ];

                  send({ validation: allResults, correctedCode: fixedCode });
                } else {
                  // Fix failed — report issues without correction
                  const allResults = [
                    ...allStaticResults,
                    ...reviewResult.issues.map((issue) => ({
                      rule: "ai-review",
                      status: (issue.severity === "error" ? "error" : "warn") as "error" | "warn",
                      message: issue.description,
                      line: issue.line,
                      suggestion: issue.fix,
                    })),
                  ];
                  send({ validation: allResults });
                }
              } else {
                // Review passed
                send({ validation: allStaticResults });
              }
            } catch {
              // AI review failed — just send static results (fail open)
              send({ validation: allStaticResults });
            }
          } else {
            // Static validation found errors — skip AI review, report immediately
            send({ validation: allStaticResults });
          }
        }

        send({ text: "" }); // flush
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          controller.close();
          return;
        }
        // Sanitize error before sending to client
        send({ error: sanitizeProviderError(err) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
