import type { ValidationResult } from "../index";

interface DeprecatedPattern {
  pattern: RegExp;
  rule: string;
  message: string;
  suggestion: string;
}

const DEPRECATED_V6: DeprecatedPattern[] = [
  {
    // Match security( but NOT request.security(
    pattern: /(?<!\w\.)security\s*\(/,
    rule: "deprecated-security",
    message: "security() is deprecated in v6",
    suggestion: "Use request.security() instead",
  },
  {
    pattern: /\bstudy\s*\(/,
    rule: "deprecated-study",
    message: "study() is deprecated in v6",
    suggestion: "Use indicator() instead",
  },
  {
    pattern: /\btransp\s*=/,
    rule: "deprecated-transp",
    message: "transp parameter is deprecated in v6",
    suggestion: "Use color.new(color, transparency) instead",
  },
  {
    pattern: /\biff\s*\(/,
    rule: "deprecated-iff",
    message: "iff() is deprecated in v6",
    suggestion: "Use ternary operator: condition ? valueIfTrue : valueIfFalse",
  },
  {
    pattern: /plot\.style_dashed/,
    rule: "nonexistent-style-dashed",
    message: "plot.style_dashed does not exist in PineScript",
    suggestion: "Use plot.style_line with linewidth parameter for visual distinction",
  },
  {
    pattern: /\binput\.(?:integer|resolution|symbol)\s*\(/,
    rule: "deprecated-input-type",
    message: "Deprecated input function",
    suggestion: "Use input.int(), input.timeframe(), input.symbol() instead",
  },
  {
    // Match tostring( but NOT str.tostring(
    pattern: /(?<!\w\.)tostring\s*\(/,
    rule: "deprecated-tostring",
    message: "tostring() is deprecated in v6",
    suggestion: "Use str.tostring() instead",
  },
  {
    // Match tonumber( but NOT str.tonumber(
    pattern: /(?<!\w\.)tonumber\s*\(/,
    rule: "deprecated-tonumber",
    message: "tonumber() is deprecated in v6",
    suggestion: "Use str.tonumber() instead",
  },
];

const ACTIVE_PATTERNS = DEPRECATED_V6;

export function checkDeprecated(
  code: string,
  version: "v5" | "v6",
): ValidationResult[] {
  if (version !== "v6") return [];

  const results: ValidationResult[] = [];
  const lines = code.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments
    if (line.trim().startsWith("//")) continue;

    for (const dp of ACTIVE_PATTERNS) {
      if (dp.pattern.test(line)) {
        results.push({
          rule: dp.rule,
          status: "error",
          message: dp.message,
          line: i + 1,
          suggestion: dp.suggestion,
        });
      }
    }
  }

  return results;
}
