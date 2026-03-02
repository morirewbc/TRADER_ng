"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ArrowUp } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, []);

  useEffect(() => {
    resize();
  }, [value, resize]);

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="px-4 pb-4">
      <div className="bg-surface border border-border rounded-2xl p-2 flex items-end gap-2 focus-within:border-border-subtle transition-colors">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Describe the PineScript indicator you want..."}
          disabled={disabled}
          rows={1}
          className="flex-1 bg-transparent text-sm text-text placeholder:text-text-muted resize-none focus:outline-none min-h-[36px] py-2 pl-2 leading-snug"
        />

        <button
          onClick={handleSubmit}
          disabled={!value.trim() || disabled}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white text-background hover:bg-text-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
        >
          <ArrowUp size={18} />
        </button>
      </div>
      <p className="text-[11px] text-text-muted text-center mt-2">
        AI-generated code may contain errors. Always backtest.
      </p>
    </div>
  );
}
