import { NextRequest } from "next/server";
import { fixCodeWithUsage } from "@/lib/ai/reviewer";
import { buildUsageRecord, summarizeUsage } from "@/lib/ai/usage";
import { validatePineScript } from "@/lib/validator";
import type { ValidationResult } from "@/lib/types";
import {
  checkRateLimit,
  validateProvider,
  validateModel,
  validateOllamaUrl,
  sanitizeProviderError,
} from "@/lib/security";

interface FixRequestBody {
  code: string;
  errors: ValidationResult[];
  settings: {
    provider: string;
    apiKey: string;
    model: string;
    ollamaUrl?: string;
    transpilerEnabled?: boolean;
  };
  pineVersion: "v5" | "v6";
}

const MAX_CODE_LENGTH = 200_000; // chars
const MAX_ERRORS = 50;

export async function POST(req: NextRequest) {
  // Rate limiting
  const rateLimitResponse = checkRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  let body: FixRequestBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { code, errors, settings, pineVersion = "v6" } = body;

  if (!code || !errors?.length || !settings) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Runtime validation of provider and model
  if (!validateProvider(settings.provider)) {
    return Response.json({ error: "Invalid provider" }, { status: 400 });
  }
  if (!validateModel(settings.model)) {
    return Response.json({ error: "Invalid model" }, { status: 400 });
  }

  // Size limits
  if (code.length > MAX_CODE_LENGTH) {
    return Response.json({ error: "Code exceeds maximum allowed size" }, { status: 400 });
  }
  if (errors.length > MAX_ERRORS) {
    return Response.json({ error: "Too many errors submitted" }, { status: 400 });
  }

  const { provider, apiKey, model } = settings;

  // SSRF protection
  let safeOllamaUrl: string;
  try {
    safeOllamaUrl = validateOllamaUrl(settings.ollamaUrl);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }

  if (provider !== "ollama" && !apiKey) {
    return Response.json({ error: "API key is required" }, { status: 401 });
  }

  // Convert ValidationResult[] to ReviewIssue[] for fixCode
  const issues = errors.map((e) => ({
    severity: (e.status === "error" ? "error" : "warning") as "error" | "warning" | "info",
    line: e.line,
    description: e.message,
    fix: e.suggestion || "",
  }));

  try {
    const { fixedCode, usage: fixUsage } = await fixCodeWithUsage(
      code,
      issues,
      provider,
      apiKey,
      model,
      safeOllamaUrl,
    );

    if (!fixedCode) {
      return Response.json({ error: "Failed to generate fix" }, { status: 500 });
    }

    // Re-validate the fixed code statically
    const version = pineVersion === "v5" ? "v5" : "v6";
    const staticValidation = validatePineScript(fixedCode, version);

    // Transpiler re-validation (if enabled)
    let transpilerResults: ValidationResult[] = [];
    if (settings.transpilerEnabled) {
      const { transpileValidate } = await import("@/lib/transpiler");
      transpilerResults = transpileValidate(fixedCode);
    }

    const validation = [...staticValidation, ...transpilerResults];

    let usage = null;
    if (fixUsage) {
      const record = await buildUsageRecord({
        stage: "fix",
        provider,
        model,
        usage: fixUsage,
      });
      usage = summarizeUsage([record]);
      console.info("[api/fix] usage", JSON.stringify(usage));
    }

    return Response.json({ fixedCode, validation, usage });
  } catch (err) {
    return Response.json(
      { error: sanitizeProviderError(err) },
      { status: 500 },
    );
  }
}
