"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Code2, TrendingUp, Lightbulb } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import MessageList from "@/components/chat/MessageList";
import ChatInput from "@/components/chat/ChatInput";
import OnboardingGate from "@/components/chat/OnboardingGate";
import { useChat } from "@/hooks/useChat";
import { STORAGE_KEY, type PineVersion } from "@/lib/types";
import dynamic from "next/dynamic";

const EditorPanel = dynamic(() => import("@/components/editor/EditorPanel"), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-background border-l border-border">
      <div className="text-text-muted text-sm">Loading editor...</div>
    </div>
  ),
});

const ACTION_BUTTONS = [
  {
    icon: TrendingUp,
    label: "Browse Examples",
    prompt: "What are the most popular and effective TradingView indicators right now? Give me a brief overview and let me pick one to generate.",
  },
  {
    icon: Lightbulb,
    label: "Brainstorm",
    prompt: "Help me brainstorm PineScript indicator ideas. I'm interested in combining multiple signals for better entry/exit detection. What creative approaches can we take?",
  },
];

export default function ChatPage() {
  const [hasSettings, setHasSettings] = useState<boolean | null>(null);
  const [pineVersion, setPineVersion] = useState<PineVersion>("v6");

  const {
    messages,
    currentCode,
    codeTitle,
    isStreaming,
    streamStatus,
    error,
    validationResults,
    correctedCode,
    usageSummary,
    sendMessage,
    fixCode,
    clearCode,
    updateCode,
  } = useChat();

  const hasCode = currentCode.length > 0;

  // Fire pre-loaded NGX prompt when navigating from the dashboard
  const prepromptFired = useRef(false);
  useEffect(() => {
    if (!hasSettings || prepromptFired.current) return;
    const raw = localStorage.getItem("ngx_preprompt");
    if (!raw) return;
    try {
      const { prompt, ts } = JSON.parse(raw);
      localStorage.removeItem("ngx_preprompt");
      if (Date.now() - ts < 30_000) {
        prepromptFired.current = true;
        sendMessage(prompt);
      }
    } catch {
      localStorage.removeItem("ngx_preprompt");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSettings]); // sendMessage intentionally excluded — only run once on mount

  const checkSettings = useCallback(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setHasSettings(false);
      return;
    }
    try {
      const settings = JSON.parse(stored);
      if (!settings.apiKey && settings.provider !== "ollama") {
        setHasSettings(false);
        return;
      }
      setPineVersion(settings.pineVersion || "v6");
      setHasSettings(true);
    } catch {
      setHasSettings(false);
    }
  }, []);

  useEffect(() => {
    checkSettings();
  }, [checkSettings]);

  // Loading
  if (hasSettings === null) return null;

  const hasMessages = messages.length > 0;

  return (
    <div className="flex min-h-screen">
      <Sidebar currentCode={currentCode} />
      <main className="ml-[56px] flex-1 flex">
        {/* Chat panel */}
        <div
          className={`flex flex-col transition-all duration-500 ease-in-out ${
            hasCode ? "w-[55%]" : "w-full"
          }`}
        >
          {/* Onboarding gate — no settings yet */}
          {!hasSettings ? (
            <OnboardingGate onComplete={checkSettings} />
          ) : !hasMessages ? (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center px-6">
              <div className="max-w-lg w-full text-center">
                <Code2 size={48} className="text-text-dim mx-auto mb-5" />
                <h1 className="text-xl font-semibold text-text mb-2">
                  PineScript AI
                </h1>
                <p className="text-text-secondary text-[13px] mb-8">
                  Describe an indicator or strategy to generate PineScript code
                </p>

                {/* Action buttons */}
                <div className="flex gap-2 justify-center mb-8">
                  {ACTION_BUTTONS.map((btn) => (
                    <button
                      key={btn.label}
                      disabled={isStreaming}
                      onClick={() => sendMessage(btn.prompt)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-surface text-text-dim hover:border-border-subtle hover:text-text-secondary text-sm transition-colors"
                    >
                      <btn.icon size={16} />
                      {btn.label}
                    </button>
                  ))}
                </div>

                <ChatInput onSend={sendMessage} disabled={isStreaming} />
              </div>
            </div>
          ) : (
            <>
              {/* Messages */}
              <MessageList messages={messages} streamStatus={streamStatus} />

              {/* Error */}
              {error && (
                <div className="px-4 pb-2">
                  <div className="bg-accent-error/10 border border-accent-error/20 rounded-lg px-4 py-2.5 text-sm text-accent-error">
                    {error}
                  </div>
                </div>
              )}

              {/* Input */}
              <ChatInput
                onSend={sendMessage}
                disabled={isStreaming}
                placeholder={hasCode ? "Ask for modifications..." : undefined}
              />
            </>
          )}
        </div>

        {/* Editor panel */}
        {hasCode && (
          <div className="w-[45%] h-screen sticky top-0">
            <EditorPanel
              code={currentCode}
              title={codeTitle}
              pineVersion={pineVersion}
              onCodeChange={updateCode}
              onClear={clearCode}
              validationResults={validationResults}
              correctedCode={correctedCode}
              usageSummary={usageSummary}
              streamStatus={streamStatus}
              onFix={fixCode}
            />
          </div>
        )}
      </main>
    </div>
  );
}
