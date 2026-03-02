import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { searchRAG } from "@/lib/rag";
import { validatePineScript } from "@/lib/validator";
import { reviewCodeWithUsage, fixCodeWithUsage } from "@/lib/ai/reviewer";
import { buildUsageRecord, summarizeUsage } from "@/lib/ai/usage";
import {
  checkRateLimit,
  validateProvider,
  validateModel,
  validateMessages,
  validateOllamaUrl,
  sanitizeCodeForPrompt,
  sanitizeProviderError,
} from "@/lib/security";
import { getNgxNews, getOpecNews } from "@/lib/data/live";
import { getNgxHistorical } from "@/lib/data/historical";

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

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const tools_anthropic: Anthropic.Tool[] = [
  {
    name: "get_ngx_news",
    description:
      "Fetch the latest news and corporate actions from the Nigerian Exchange Group (NGX). Use when the user asks for recent news, market updates, or context about NGX companies.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_opec_news",
    description:
      "Fetch the latest OPEC press releases. Use when the user asks about oil prices, OPEC decisions, or energy sector news relevant to NGX:SEPLAT or NGX:TOTAL.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_ngx_historical",
    description:
      "Fetch historical OHLCV data and statistical profile for a specific NGX stock. Use when generating strategies that require realistic ATR-based stops, volume filters, or backtesting parameters. Returns price range, ATR(14), volatility, volume percentiles, and seasonal patterns.",
    input_schema: {
      type: "object",
      properties: {
        ticker: {
          type: "string",
          description: "NGX ticker symbol e.g. DANGCEM, MTNN, ZENITHBANK",
        },
        period: {
          type: "string",
          enum: ["1y", "3y", "5y", "max"],
          description: "Historical lookback period",
        },
      },
      required: ["ticker"],
    },
  },
];

const tools_openai: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_ngx_news",
      description: "Fetch latest NGX news and corporate actions.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_opec_news",
      description: "Fetch latest OPEC press releases.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ngx_historical",
      description:
        "Fetch historical OHLCV data and stats for an NGX stock. Use for ATR-based stops, volume filters, and realistic strategy parameters.",
      parameters: {
        type: "object",
        properties: {
          ticker: { type: "string" },
          period: { type: "string", enum: ["1y", "3y", "5y", "max"] },
        },
        required: ["ticker"],
      },
    },
  },
];

// ─── Tool Executor ────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  if (name === "get_ngx_news") {
    const result = await getNgxNews();
    return JSON.stringify(result);
  }
  if (name === "get_opec_news") {
    const result = await getOpecNews();
    return JSON.stringify(result);
  }
  if (name === "get_ngx_historical") {
    const ticker = (input.ticker as string | undefined) ?? "";
    const period = (input.period as "1y" | "3y" | "5y" | "max" | undefined) ?? "5y";
    const result = await getNgxHistorical(ticker, period);
    return JSON.stringify(result);
  }
  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

// ─── Anthropic Streaming ──────────────────────────────────────────────────────

async function streamAnthropic(
  messages: Anthropic.MessageParam[],
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
      messages,
      tools: tools_anthropic,
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
      const usageRecords: Awaited<ReturnType<typeof buildUsageRecord>>[] = [];
      let generationUsage: {
        inputTokens?: number | null;
        outputTokens?: number | null;
        totalTokens?: number | null;
      } | null = null;

      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Phase 1: Tool-calling loop then streaming generation
        if (provider === "anthropic") {
          // Build initial message list as Anthropic.MessageParam[]
          const currentMessages: Anthropic.MessageParam[] = messages.map((m) => ({
            role: m.role,
            content: m.content,
          }));

          // Tool-calling loop — runs until the model stops requesting tools
          let continueLoop = true;
          while (continueLoop) {
            const anthropicStream = await streamAnthropic(
              currentMessages,
              systemPrompt,
              apiKey,
              model,
              signal,
            );

            // Accumulate the full response so we can inspect stop_reason
            let stopReason: string | null = null;
            const assistantContentBlocks: Anthropic.ContentBlockParam[] = [];
            let currentTextBlock = "";
            const pendingToolUses: Array<{
              id: string;
              name: string;
              input: Record<string, unknown>;
            }> = [];
            let currentToolCall: { id: string; name: string; inputJson: string } | null = null;

            for await (const event of anthropicStream) {
              const anyEvent = event as {
                type: string;
                message?: { usage?: { input_tokens?: number; output_tokens?: number }; stop_reason?: string };
                usage?: { output_tokens?: number };
                delta?: { type?: string; text?: string; stop_reason?: string; partial_json?: string };
                content_block?: { type?: string; id?: string; name?: string };
                index?: number;
              };

              if (anyEvent.type === "message_start") {
                generationUsage = {
                  inputTokens: anyEvent.message?.usage?.input_tokens ?? 0,
                  outputTokens: anyEvent.message?.usage?.output_tokens ?? 0,
                };
              } else if (anyEvent.type === "message_delta") {
                const prevUsage: { inputTokens: number; outputTokens: number } = {
                  inputTokens: Number(generationUsage?.inputTokens ?? 0),
                  outputTokens: Number(generationUsage?.outputTokens ?? 0),
                };
                generationUsage = {
                  inputTokens: prevUsage.inputTokens,
                  outputTokens: anyEvent.usage?.output_tokens ?? prevUsage.outputTokens ?? 0,
                };
                if (anyEvent.delta?.stop_reason) {
                  stopReason = anyEvent.delta.stop_reason;
                }
              } else if (anyEvent.type === "message_stop") {
                // final stop
              } else if (anyEvent.type === "content_block_start") {
                const block = anyEvent.content_block;
                if (block?.type === "text") {
                  currentTextBlock = "";
                } else if (block?.type === "tool_use") {
                  currentToolCall = {
                    id: block.id ?? "",
                    name: block.name ?? "",
                    inputJson: "",
                  };
                }
              } else if (anyEvent.type === "content_block_delta") {
                if (anyEvent.delta?.type === "text_delta" && anyEvent.delta.text) {
                  currentTextBlock += anyEvent.delta.text;
                  fullContent += anyEvent.delta.text;
                  send({ text: anyEvent.delta.text });
                } else if (anyEvent.delta?.type === "input_json_delta" && currentToolCall) {
                  currentToolCall.inputJson += anyEvent.delta.partial_json ?? "";
                }
              } else if (anyEvent.type === "content_block_stop") {
                if (currentTextBlock) {
                  assistantContentBlocks.push({ type: "text", text: currentTextBlock });
                  currentTextBlock = "";
                }
                if (currentToolCall) {
                  let parsedInput: Record<string, unknown> = {};
                  try {
                    parsedInput = JSON.parse(currentToolCall.inputJson || "{}");
                  } catch {
                    parsedInput = {};
                  }
                  pendingToolUses.push({
                    id: currentToolCall.id,
                    name: currentToolCall.name,
                    input: parsedInput,
                  });
                  assistantContentBlocks.push({
                    type: "tool_use",
                    id: currentToolCall.id,
                    name: currentToolCall.name,
                    input: parsedInput,
                  });
                  currentToolCall = null;
                }
              }
            }

            // Check if we need to run tools
            if (stopReason === "tool_use" && pendingToolUses.length > 0) {
              // Add assistant message with tool use blocks
              currentMessages.push({
                role: "assistant",
                content: assistantContentBlocks,
              });

              // Execute all tools and collect results
              const toolResults: Anthropic.ToolResultBlockParam[] = [];
              for (const toolUse of pendingToolUses) {
                send({ status: `tool:${toolUse.name}` });
                try {
                  const result = await executeTool(toolUse.name, toolUse.input);
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: toolUse.id,
                    content: result,
                  });
                } catch (toolErr) {
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: toolUse.id,
                    content: JSON.stringify({ error: (toolErr as Error).message }),
                  });
                }
              }

              // Add tool results as a user message and continue the loop
              currentMessages.push({
                role: "user",
                content: toolResults,
              });
              // continueLoop stays true — we'll call the model again
            } else {
              // No more tools requested — exit the loop
              continueLoop = false;
            }
          }
        } else {
          // OpenAI-compatible providers (openai, openrouter, google, ollama)
          const baseURL =
            provider === "openrouter"
              ? "https://openrouter.ai/api/v1"
              : provider === "google"
              ? "https://generativelanguage.googleapis.com/v1beta/openai/"
              : provider === "ollama"
                ? `${safeOllamaUrl}/v1`
                : undefined;

          // Build mutable message list for tool-calling loop
          const currentMessages: OpenAI.ChatCompletionMessageParam[] = [
            { role: "system", content: systemPrompt },
            ...messages,
          ];

          let continueLoop = true;
          while (continueLoop) {
            const client = new OpenAI({
              apiKey: apiKey || "ollama",
              ...(baseURL && { baseURL }),
            });

            const includeUsage = provider !== "ollama";
            const request: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
              model,
              stream: true,
              messages: currentMessages,
              tools: tools_openai,
            };

            if (includeUsage) {
              request.stream_options = { include_usage: true };
            }

            let openaiStream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
            try {
              openaiStream = await client.chat.completions.create(request, { signal });
            } catch (err) {
              if (!includeUsage) throw err;
              delete request.stream_options;
              openaiStream = await client.chat.completions.create(request, { signal });
            }

            // Accumulate streamed response
            let assistantText = "";
            const toolCallsMap = new Map<
              number,
              { id: string; name: string; arguments: string }
            >();
            let finishReason: string | null = null;

            for await (const chunk of openaiStream) {
              if (chunk.usage) {
                generationUsage = {
                  inputTokens: chunk.usage.prompt_tokens ?? 0,
                  outputTokens: chunk.usage.completion_tokens ?? 0,
                  totalTokens: chunk.usage.total_tokens ?? 0,
                };
              }

              const choice = chunk.choices[0];
              if (!choice) continue;

              if (choice.finish_reason) {
                finishReason = choice.finish_reason;
              }

              const delta = choice.delta;

              if (delta.content) {
                assistantText += delta.content;
                fullContent += delta.content;
                send({ text: delta.content });
              }

              // Accumulate tool call deltas
              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index;
                  if (!toolCallsMap.has(idx)) {
                    toolCallsMap.set(idx, {
                      id: tc.id ?? "",
                      name: tc.function?.name ?? "",
                      arguments: "",
                    });
                  }
                  const existing = toolCallsMap.get(idx)!;
                  if (tc.id) existing.id = tc.id;
                  if (tc.function?.name) existing.name = tc.function.name;
                  if (tc.function?.arguments) existing.arguments += tc.function.arguments;
                }
              }
            }

            if (finishReason === "tool_calls" && toolCallsMap.size > 0) {
              // Build the assistant message with tool calls
              const toolCallsList = Array.from(toolCallsMap.entries())
                .sort(([a], [b]) => a - b)
                .map(([, tc]) => tc);

              const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
                role: "assistant",
                content: assistantText || null,
                tool_calls: toolCallsList.map((tc) => ({
                  id: tc.id,
                  type: "function" as const,
                  function: { name: tc.name, arguments: tc.arguments },
                })),
              };
              currentMessages.push(assistantMsg);

              // Execute each tool
              for (const tc of toolCallsList) {
                send({ status: `tool:${tc.name}` });
                let fnArgs: Record<string, unknown> = {};
                try {
                  fnArgs = JSON.parse(tc.arguments || "{}");
                } catch {
                  fnArgs = {};
                }

                let toolResult: string;
                try {
                  toolResult = await executeTool(tc.name, fnArgs);
                } catch (toolErr) {
                  toolResult = JSON.stringify({ error: (toolErr as Error).message });
                }

                currentMessages.push({
                  role: "tool",
                  tool_call_id: tc.id,
                  content: toolResult,
                });
              }
              // continueLoop stays true — call the model again with tool results
            } else {
              // No more tools — exit loop
              continueLoop = false;
            }
          }
        }

        if (generationUsage) {
          usageRecords.push(
            await buildUsageRecord({
              stage: "generation",
              provider,
              model,
              usage: generationUsage,
            }),
          );
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
              const { result: reviewResult, usage: reviewUsage } = await reviewCodeWithUsage(
                generatedCode,
                provider,
                apiKey,
                model,
                safeOllamaUrl,
              );
              if (reviewUsage) {
                usageRecords.push(
                  await buildUsageRecord({
                    stage: "review",
                    provider,
                    model,
                    usage: reviewUsage,
                  }),
                );
              }

              if (reviewResult.verdict === "needs_fix" && reviewResult.issues.length > 0) {
                // Step 3: Auto-fix
                send({ status: "correcting" });
                const { fixedCode, usage: fixUsage } = await fixCodeWithUsage(
                  generatedCode,
                  reviewResult.issues,
                  provider,
                  apiKey,
                  model,
                  safeOllamaUrl,
                );
                if (fixUsage) {
                  usageRecords.push(
                    await buildUsageRecord({
                      stage: "fix",
                      provider,
                      model,
                      usage: fixUsage,
                    }),
                  );
                }

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

        if (usageRecords.length > 0) {
          const usageSummary = summarizeUsage(usageRecords);
          send({ usage: usageSummary });
          console.info("[api/chat] usage", JSON.stringify(usageSummary));
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
