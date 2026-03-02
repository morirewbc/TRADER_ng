import type { ValidationResult } from "./types";

export function transpileValidate(code: string): ValidationResult[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { transpile } = require("@opusaether/pine-transpiler");
    const result = transpile(code);

    if (typeof result === "string" && result.length > 0) {
      return [{
        rule: "transpiler",
        status: "pass",
        message: "Code parses successfully",
      }];
    }

    return [{
      rule: "transpiler",
      status: "error",
      message: "Code contains syntax errors that prevent transpilation",
    }];
  } catch {
    // Package not installed or threw — fail open
    return [];
  }
}
