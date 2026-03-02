"use client";

import type { StreamStatus } from "@/lib/types";

const STATUS_TEXT: Record<StreamStatus, string> = {
  idle: "",
  connecting: "Connecting",
  generating: "Generating",
  streaming: "Writing code",
  validating: "Running validation checks",
  transpiling: "Parsing with transpiler",
  reviewing: "AI reviewing code",
  correcting: "Auto-correcting issues",
  error: "Error occurred",
};

function StreamingDots() {
  return (
    <span className="inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1 h-1 rounded-full bg-text-secondary"
          style={{ animation: `streaming-dot 1.4s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </span>
  );
}

export default function StreamingIndicator({ status }: { status: StreamStatus }) {
  if (status === "idle") return null;

  return (
    <div className="flex items-center gap-2.5 px-4 py-2">
      {status !== "error" && <StreamingDots />}
      <span
        className={`text-xs ${status === "error" ? "text-accent-error" : "text-text-secondary"}`}
      >
        {STATUS_TEXT[status]}
      </span>
    </div>
  );
}
