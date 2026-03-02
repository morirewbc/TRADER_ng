"use client";

import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, Code2, ChevronDown, ChevronUp } from "lucide-react";
import type { Message } from "@/lib/types";

const PINE_LANGUAGES = new Set(["pine", "pinescript"]);

function CodeBlock({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const text = String(children).replace(/\n$/, "");
  const lang = className?.replace("language-", "") || "";

  const copy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  // Inline code
  if (!className) {
    return (
      <code className="px-1.5 py-0.5 bg-surface rounded text-xs font-mono text-text-secondary">
        {children}
      </code>
    );
  }

  // Pine code: collapsed by default since it's already in the editor
  if (PINE_LANGUAGES.has(lang)) {
    const lineCount = text.split("\n").length;

    return (
      <div className="my-3 rounded-lg overflow-hidden border border-border">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-2 px-3 py-2 bg-surface hover:bg-surface-elevated transition-colors"
        >
          <Code2 size={14} className="text-primary shrink-0" />
          <span className="text-xs text-text-secondary">
            PineScript code in editor
          </span>
          <span className="text-xs text-text-muted">
            · {lineCount} lines
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); copy(); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); copy(); } }}
              className="text-text-muted hover:text-text transition-colors"
            >
              {copied ? <Check size={13} className="text-accent-success" /> : <Copy size={13} />}
            </span>
            {expanded ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
          </div>
        </button>
        {expanded && (
          <pre className="p-3 overflow-x-auto bg-code-background border-t border-border">
            <code className="text-xs font-mono text-text leading-relaxed">
              {text}
            </code>
          </pre>
        )}
      </div>
    );
  }

  return (
    <div className="relative group my-3 rounded-lg overflow-hidden border border-border">
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface border-b border-border">
        <span className="text-xs text-text-muted font-mono">{lang}</span>
        <button
          onClick={copy}
          className="text-text-muted hover:text-text transition-colors"
        >
          {copied ? <Check size={14} className="text-accent-success" /> : <Copy size={14} />}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto bg-code-background">
        <code className="text-xs font-mono text-text leading-relaxed">
          {text}
        </code>
      </pre>
    </div>
  );
}

export default function AssistantMessage({ message }: { message: Message }) {
  return (
    <div className="flex justify-start px-4 py-2">
      <div className="max-w-[90%] prose-invert text-sm text-text">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ children, className }) {
              return <CodeBlock className={className}>{children}</CodeBlock>;
            },
            p({ children }) {
              return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>;
            },
            ul({ children }) {
              return <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>;
            },
            ol({ children }) {
              return <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>;
            },
            strong({ children }) {
              return <strong className="font-semibold text-text">{children}</strong>;
            },
            h3({ children }) {
              return <h3 className="text-base font-semibold text-text mt-3 mb-1">{children}</h3>;
            },
          }}
        >
          {message.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
