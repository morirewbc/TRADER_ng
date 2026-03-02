"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Wrench,
  Sparkles,
  ShieldCheck,
  BrainCircuit,
  FileCode2,
  LoaderCircle,
} from "lucide-react";
import type { ValidationResult, StreamStatus } from "@/lib/types";

interface ValidationPanelProps {
  results: ValidationResult[];
  correctedCode: string | null;
  streamStatus?: StreamStatus;
  onFix?: () => void;
}

type StepState = "pending" | "active" | "done" | "skipped";

interface PipelineStep {
  id: string;
  label: string;
  icon: React.ReactNode;
  state: StepState;
}

function getPipelineSteps(status: StreamStatus): PipelineStep[] {
  const order: StreamStatus[] = ["validating", "transpiling", "reviewing", "correcting"];
  const currentIdx = order.indexOf(status);

  function stepState(stepIdx: number): StepState {
    if (currentIdx < 0) return "pending";
    if (stepIdx < currentIdx) return "done";
    if (stepIdx === currentIdx) return "active";
    return "pending";
  }

  return [
    { id: "validating", label: "Static checks", icon: <ShieldCheck size={14} />, state: stepState(0) },
    { id: "transpiling", label: "Transpiler", icon: <FileCode2 size={14} />, state: stepState(1) },
    { id: "reviewing", label: "AI review", icon: <BrainCircuit size={14} />, state: stepState(2) },
    { id: "correcting", label: "Auto-fix", icon: <Wrench size={14} />, state: stepState(3) },
  ];
}

function PipelineStepper({ status }: { status: StreamStatus }) {
  const steps = getPipelineSteps(status);

  return (
    <div className="px-4 py-3 space-y-1.5">
      {steps.map((step) => (
        <div key={step.id} className="flex items-center gap-2.5">
          {/* Icon */}
          <div
            className={`shrink-0 transition-colors ${
              step.state === "active"
                ? "text-primary"
                : step.state === "done"
                  ? "text-emerald-400"
                  : "text-text-dim/40"
            }`}
          >
            {step.state === "active" ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : step.state === "done" ? (
              <CheckCircle2 size={14} />
            ) : (
              step.icon
            )}
          </div>

          {/* Label */}
          <span
            className={`text-xs transition-colors ${
              step.state === "active"
                ? "text-text font-medium"
                : step.state === "done"
                  ? "text-text-secondary"
                  : "text-text-dim/40"
            }`}
          >
            {step.label}
          </span>

          {/* Active indicator */}
          {step.state === "active" && (
            <span className="ml-auto inline-flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1 h-1 rounded-full bg-primary"
                  style={{ animation: `streaming-dot 1.4s ease-in-out ${i * 0.2}s infinite` }}
                />
              ))}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function ValidationPanel({
  results,
  correctedCode,
  streamStatus,
  onFix,
}: ValidationPanelProps) {
  const [expanded, setExpanded] = useState(true);

  const isValidating =
    streamStatus === "validating" ||
    streamStatus === "transpiling" ||
    streamStatus === "reviewing" ||
    streamStatus === "correcting";

  if (results.length === 0 && !isValidating) return null;

  const passed = results.filter((r) => r.status === "pass").length;
  const warnings = results.filter((r) => r.status === "warn").length;
  const errors = results.filter((r) => r.status === "error").length;
  const nonPassResults = results.filter((r) => r.status !== "pass");
  const hasFixableErrors = errors > 0 || warnings > 0;

  return (
    <div className="border-t border-border bg-surface">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2 text-xs hover:bg-surface-elevated transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="font-medium text-text">Validation</span>

        {isValidating ? (
          <span className="flex items-center gap-2 ml-auto">
            <LoaderCircle size={12} className="animate-spin text-primary" />
            <span className="text-primary font-medium">Running pipeline</span>
          </span>
        ) : (
          <div className="flex items-center gap-2 ml-auto">
            {passed > 0 && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                <CheckCircle2 size={10} />
                {passed} passed
              </span>
            )}
            {warnings > 0 && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
                <AlertTriangle size={10} />
                {warnings} {warnings === 1 ? "warning" : "warnings"}
              </span>
            )}
            {errors > 0 && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400">
                <XCircle size={10} />
                {errors} {errors === 1 ? "error" : "errors"}
              </span>
            )}
            {correctedCode && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
                <Wrench size={10} />
                Auto-corrected
              </span>
            )}
          </div>
        )}
      </button>

      {/* Pipeline stepper — shown while validating */}
      {expanded && isValidating && streamStatus && (
        <PipelineStepper status={streamStatus} />
      )}

      {/* Results */}
      {expanded && !isValidating && nonPassResults.length > 0 && (
        <div className="px-4 pb-2 space-y-1 max-h-40 overflow-y-auto">
          {nonPassResults.map((result, i) => (
            <div
              key={i}
              className="flex items-start gap-2 py-1 text-xs"
            >
              {result.status === "warn" ? (
                <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
              ) : (
                <XCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-text-dim">{result.rule}</span>
                  {result.line && (
                    <span className="text-text-dim">line {result.line}</span>
                  )}
                </div>
                <p className="text-text">{result.message}</p>
                {result.suggestion && (
                  <p className="text-text-secondary mt-0.5">{result.suggestion}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Fix button */}
      {expanded && !isValidating && hasFixableErrors && onFix && (
        <div className="px-4 pb-2.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFix();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-background hover:bg-text-secondary transition-colors"
          >
            <Sparkles size={12} />
            Fix with PineScript AI
          </button>
        </div>
      )}

      {/* All passed message */}
      {expanded && !isValidating && nonPassResults.length === 0 && results.length > 0 && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 py-1 text-xs text-emerald-400">
            <CheckCircle2 size={12} />
            All checks passed
          </div>
        </div>
      )}
    </div>
  );
}
