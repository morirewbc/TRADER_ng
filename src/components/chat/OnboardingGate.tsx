"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  DEFAULT_SETTINGS,
  STORAGE_KEY,
} from "@/lib/types";

interface OnboardingGateProps {
  onComplete: () => void;
}

export default function OnboardingGate({ onComplete }: OnboardingGateProps) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  function save() {
    const settings = {
      ...DEFAULT_SETTINGS,
      provider: "openrouter" as const,
      apiKey,
      model: DEFAULT_SETTINGS.model,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    onComplete();
  }

  const canSave = apiKey.trim().length > 0;

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        <h1 className="text-xl font-semibold text-text mb-1">Get started</h1>
        <p className="text-text-dim text-sm mb-8">
          Connect OpenRouter to start generating PineScript.
        </p>

        {/* OpenRouter key */}
        <div className="mb-8">
          <label className="block text-xs font-medium text-text-secondary mb-2">
            OpenRouter API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-v1-..."
              className="w-full px-3 py-2.5 pr-10 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-border-subtle transition-colors font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button
          onClick={save}
          disabled={!canSave}
          className="w-full py-2.5 rounded-lg text-sm font-medium bg-white text-background hover:bg-text-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Save &amp; Start
        </button>

        <p className="text-[11px] text-text-muted text-center mt-4">
          Your key is stored locally and never sent to our servers.
        </p>
      </div>
    </div>
  );
}
