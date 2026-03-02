"use client";

import { useReducer, useCallback, useRef } from "react";
import type {
  ChatState,
  Message,
  StreamStatus,
  Settings,
  ValidationResult,
  UsageSummary,
} from "@/lib/types";

// Actions
type Action =
  | { type: "ADD_MESSAGE"; message: Message }
  | { type: "UPDATE_ASSISTANT"; content: string }
  | { type: "SET_CODE"; code: string; title: string }
  | { type: "SET_STREAM_STATUS"; status: StreamStatus }
  | { type: "SET_ERROR"; error: string }
  | { type: "SET_VALIDATION"; results: ValidationResult[]; correctedCode: string | null }
  | { type: "SET_USAGE"; usage: UsageSummary | null }
  | { type: "CLEAR_ERROR" }
  | { type: "RESET" };

const initialState: ChatState = {
  messages: [],
  currentCode: "",
  codeTitle: "",
  isStreaming: false,
  streamStatus: "idle",
  error: null,
  validationResults: [],
  correctedCode: null,
  usageSummary: null,
};

function reducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message], error: null };
    case "UPDATE_ASSISTANT": {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, content: action.content };
      }
      return { ...state, messages: msgs };
    }
    case "SET_CODE":
      return { ...state, currentCode: action.code, codeTitle: action.title };
    case "SET_STREAM_STATUS":
      return {
        ...state,
        streamStatus: action.status,
        isStreaming: action.status !== "idle" && action.status !== "error",
      };
    case "SET_ERROR":
      return { ...state, error: action.error, isStreaming: false, streamStatus: "error" };
    case "SET_VALIDATION":
      return {
        ...state,
        validationResults: action.results,
        correctedCode: action.correctedCode,
      };
    case "SET_USAGE":
      return { ...state, usageSummary: action.usage };
    case "CLEAR_ERROR":
      return { ...state, error: null, streamStatus: "idle" };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Extract code from streaming content incrementally
function extractPineCode(content: string): { code: string; title: string } | null {
  // Look for ```pinescript or ```pine blocks
  const match = content.match(/```(?:pinescript|pine)\s*\n([\s\S]*?)(?:```|$)/);
  if (!match) return null;

  const code = match[1].trimEnd();
  if (!code) return null;

  // Try to extract title from indicator/strategy declaration
  const titleMatch = code.match(/(?:indicator|strategy)\s*\(\s*["']([^"']+)["']/);
  const title = titleMatch ? titleMatch[1] : "Generated Script";

  return { code, title };
}

export function useChat() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (content: string) => {
    // Load settings from localStorage
    const stored = localStorage.getItem("pinescript-ai-settings");
    if (!stored) return;

    let settings: Settings;
    try {
      settings = JSON.parse(stored);
    } catch {
      dispatch({ type: "SET_ERROR", error: "Invalid settings. Please reconfigure." });
      return;
    }

    // Abort any existing stream
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Add user message
    const userMsg: Message = {
      id: generateId(),
      role: "user",
      content,
      timestamp: Date.now(),
    };
    dispatch({ type: "ADD_MESSAGE", message: userMsg });

    // Add empty assistant message
    const assistantMsg: Message = {
      id: generateId(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };
    dispatch({ type: "ADD_MESSAGE", message: assistantMsg });
    dispatch({ type: "SET_STREAM_STATUS", status: "connecting" });
    // Clear previous validation when starting new generation
    dispatch({ type: "SET_VALIDATION", results: [], correctedCode: null });
    dispatch({ type: "SET_USAGE", usage: null });

    try {
      const allMessages = [...state.messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages,
          settings: {
            provider: settings.provider,
            apiKey: settings.apiKey,
            model: settings.model,
            ollamaUrl: settings.ollamaUrl,
            transpilerEnabled: settings.transpilerEnabled,
          },
          pineVersion: settings.pineVersion,
          currentCode: state.currentCode || undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `Error ${res.status}` }));
        dispatch({ type: "SET_ERROR", error: data.error || `Request failed: ${res.status}` });
        return;
      }

      if (!res.body) {
        dispatch({ type: "SET_ERROR", error: "No response stream received." });
        return;
      }

      dispatch({ type: "SET_STREAM_STATUS", status: "generating" });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let codeDetected = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              dispatch({ type: "SET_ERROR", error: parsed.error });
              return;
            }

            // Handle status events from post-generation pipeline.
            // Validate against the known set to prevent arbitrary state injection
            // from a malicious or tampered SSE stream.
            if (parsed.status) {
              const VALID_STATUSES: ReadonlySet<StreamStatus> = new Set([
                "idle", "connecting", "generating", "streaming",
                "validating", "transpiling", "reviewing", "correcting", "error",
              ]);
              if (VALID_STATUSES.has(parsed.status as StreamStatus)) {
                dispatch({ type: "SET_STREAM_STATUS", status: parsed.status as StreamStatus });
              }
              continue;
            }

            // Handle validation results
            if (parsed.validation) {
              dispatch({
                type: "SET_VALIDATION",
                results: parsed.validation,
                correctedCode: parsed.correctedCode || null,
              });
              // If there's corrected code, update the editor
              if (parsed.correctedCode) {
                const titleMatch = parsed.correctedCode.match(
                  /(?:indicator|strategy)\s*\(\s*["']([^"']+)["']/,
                );
                dispatch({
                  type: "SET_CODE",
                  code: parsed.correctedCode,
                  title: titleMatch ? titleMatch[1] : state.codeTitle,
                });
              }
              continue;
            }

            if (parsed.usage) {
              // Expose precise token/cost data from API for debugging and cost tracking.
              console.info("[chat usage]", parsed.usage);
              dispatch({ type: "SET_USAGE", usage: parsed.usage as UsageSummary });
              continue;
            }

            if (parsed.text) {
              fullContent += parsed.text;
              dispatch({ type: "UPDATE_ASSISTANT", content: fullContent });

              // Incremental code extraction
              if (!codeDetected && fullContent.includes("```pine")) {
                dispatch({ type: "SET_STREAM_STATUS", status: "streaming" });
                codeDetected = true;
              }

              if (codeDetected) {
                const extracted = extractPineCode(fullContent);
                if (extracted) {
                  dispatch({
                    type: "SET_CODE",
                    code: extracted.code,
                    title: extracted.title,
                  });
                }
              }
            }
          } catch {
            // Skip malformed SSE data
          }
        }
      }

      dispatch({ type: "SET_STREAM_STATUS", status: "idle" });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      dispatch({
        type: "SET_ERROR",
        error: "Connection lost. Please try again.",
      });
    }
  }, [state.messages, state.currentCode, state.codeTitle]);

  const fixCode = useCallback(async () => {
    const stored = localStorage.getItem("pinescript-ai-settings");
    if (!stored || !state.currentCode) return;

    let settings: Settings;
    try {
      settings = JSON.parse(stored);
    } catch {
      return;
    }

    const errors = state.validationResults.filter(
      (r) => r.status === "error" || r.status === "warn",
    );
    if (errors.length === 0) return;

    dispatch({ type: "SET_STREAM_STATUS", status: "correcting" });

    try {
      const res = await fetch("/api/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: state.currentCode,
          errors,
          settings: {
            provider: settings.provider,
            apiKey: settings.apiKey,
            model: settings.model,
            ollamaUrl: settings.ollamaUrl,
            transpilerEnabled: settings.transpilerEnabled,
          },
          pineVersion: settings.pineVersion,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Fix failed" }));
        dispatch({ type: "SET_ERROR", error: data.error });
        return;
      }

      const { fixedCode: fixed, validation, usage } = await res.json();

      if (usage) {
        console.info("[fix usage]", usage);
        dispatch({ type: "SET_USAGE", usage: usage as UsageSummary });
      }

      if (fixed) {
        const titleMatch = fixed.match(
          /(?:indicator|strategy)\s*\(\s*["']([^"']+)["']/,
        );
        dispatch({
          type: "SET_CODE",
          code: fixed,
          title: titleMatch ? titleMatch[1] : state.codeTitle,
        });
      }

      dispatch({
        type: "SET_VALIDATION",
        results: validation || [],
        correctedCode: fixed || null,
      });
      dispatch({ type: "SET_STREAM_STATUS", status: "idle" });
    } catch {
      dispatch({
        type: "SET_ERROR",
        error: "Fix request failed. Please try again.",
      });
    }
  }, [state.currentCode, state.validationResults, state.codeTitle]);

  const clearChat = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "RESET" });
  }, []);

  const clearCode = useCallback(() => {
    dispatch({ type: "SET_CODE", code: "", title: "" });
    dispatch({ type: "SET_VALIDATION", results: [], correctedCode: null });
    dispatch({ type: "SET_USAGE", usage: null });
  }, []);

  const updateCode = useCallback((code: string) => {
    dispatch({ type: "SET_CODE", code, title: state.codeTitle });
  }, [state.codeTitle]);

  return {
    ...state,
    sendMessage,
    fixCode,
    clearChat,
    clearCode,
    updateCode,
  };
}
