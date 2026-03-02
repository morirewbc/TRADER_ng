import { checkStructure } from "./rules/structure";
import { checkDeprecated } from "./rules/deprecated";
import { checkV6Specific } from "./rules/v6-specific";
import { checkLimits } from "./rules/limits";

export interface ValidationResult {
  rule: string;
  status: "pass" | "warn" | "error";
  message: string;
  line?: number;
  suggestion?: string;
}

export function validatePineScript(
  code: string,
  version: "v5" | "v6" = "v6",
): ValidationResult[] {
  if (!code.trim()) return [];

  const results: ValidationResult[] = [
    ...checkStructure(code),
    ...checkDeprecated(code, version),
    ...checkV6Specific(code, version),
    ...checkLimits(code),
  ];

  return results;
}
