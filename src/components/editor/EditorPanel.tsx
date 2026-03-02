"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching, foldGutter } from "@codemirror/language";
import { Copy, Check, Save, Download, Trash2 } from "lucide-react";
import { pineScriptLanguage } from "./pine-language";
import { pineTheme, pineHighlight } from "./codemirror-theme";
import ValidationPanel from "./ValidationPanel";
import type { PineVersion, ValidationResult, StreamStatus } from "@/lib/types";

interface EditorPanelProps {
  code: string;
  title: string;
  pineVersion: PineVersion;
  onCodeChange: (code: string) => void;
  onClear: () => void;
  validationResults?: ValidationResult[];
  correctedCode?: string | null;
  streamStatus?: StreamStatus;
  onFix?: () => void;
}

export default function EditorPanel({
  code,
  title,
  pineVersion,
  onCodeChange,
  onClear,
  validationResults = [],
  correctedCode = null,
  streamStatus,
  onFix,
}: EditorPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const onCodeChangeRef = useRef(onCodeChange);
  onCodeChangeRef.current = onCodeChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onCodeChangeRef.current(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(),
        history(),
        bracketMatching(),
        foldGutter(),
        pineScriptLanguage,
        pineTheme,
        pineHighlight,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        updateListener,
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentDoc = view.state.doc.toString();
    if (currentDoc !== code) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: code },
      });
    }
  }, [code]);

  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const saveScript = useCallback(() => {
    const scripts = JSON.parse(localStorage.getItem("pinescript-ai-scripts") || "[]");
    scripts.unshift({
      id: Date.now().toString(),
      title: title || "Untitled Script",
      code,
      timestamp: Date.now(),
    });
    localStorage.setItem("pinescript-ai-scripts", JSON.stringify(scripts));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [code, title]);

  const downloadScript = useCallback(() => {
    const filename = (title || "script").replace(/[^a-z0-9_-]/gi, "_").toLowerCase() + ".pine";
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [code, title]);

  return (
    <div className="h-full flex flex-col bg-background border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface">
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-elevated text-text-secondary border border-border">
            Pine {pineVersion}
          </span>
          <span className="text-sm text-text font-medium truncate max-w-[200px]">
            {title || "Generated Script"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={copyCode}
            className="w-8 h-8 flex items-center justify-center rounded-md text-text-dim hover:text-text-secondary hover:bg-surface-elevated transition-colors"
            title="Copy code"
          >
            {copied ? (
              <Check size={15} className="text-accent-success" />
            ) : (
              <Copy size={15} />
            )}
          </button>
          <button
            onClick={saveScript}
            className="w-8 h-8 flex items-center justify-center rounded-md text-text-dim hover:text-text-secondary hover:bg-surface-elevated transition-colors"
            title="Save script"
          >
            {saved ? (
              <Check size={15} className="text-accent-success" />
            ) : (
              <Save size={15} />
            )}
          </button>
          <button
            onClick={downloadScript}
            className="w-8 h-8 flex items-center justify-center rounded-md text-text-dim hover:text-text-secondary hover:bg-surface-elevated transition-colors"
            title="Download .pine file"
          >
            <Download size={15} />
          </button>
          <button
            onClick={onClear}
            className="w-8 h-8 flex items-center justify-center rounded-md text-text-dim hover:text-accent-error hover:bg-accent-error/10 transition-colors"
            title="Clear editor"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* CodeMirror container */}
      <div ref={containerRef} className="flex-1 overflow-auto" />

      {/* Validation panel */}
      <ValidationPanel
        results={validationResults}
        correctedCode={correctedCode}
        streamStatus={streamStatus}
        onFix={onFix}
      />
    </div>
  );
}
