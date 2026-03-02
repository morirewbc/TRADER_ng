import type { ValidationResult } from "../index";

export function checkV6Specific(
  code: string,
  version: "v5" | "v6",
): ValidationResult[] {
  if (version !== "v6") return [];

  const results: ValidationResult[] = [];
  const lines = code.split("\n");

  // Check: bool assigned to na without cast
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("//")) continue;

    // bool x = na → should be bool x = bool(na)
    if (/\bbool\s+\w+\s*=\s*na\b/.test(line) && !/bool\s*\(\s*na\s*\)/.test(line)) {
      results.push({
        rule: "bool-na-cast",
        status: "error",
        message: "Cannot assign na to bool without explicit cast in v6",
        line: i + 1,
        suggestion: "Use bool(na) instead of plain na",
      });
    }

    // int x = na → should be int(na)
    if (/\bint\s+\w+\s*=\s*na\b/.test(line) && !/int\s*\(\s*na\s*\)/.test(line)) {
      results.push({
        rule: "int-na-cast",
        status: "warn",
        message: "Assigning na to int may need explicit cast in v6",
        line: i + 1,
        suggestion: "Use int(na) for clarity",
      });
    }
  }

  // Check: fill() mixing hline and plot
  const hlineVars = new Set<string>();
  const plotVars = new Set<string>();

  for (const line of lines) {
    if (line.trim().startsWith("//")) continue;
    // Match: varName = hline(...)
    const hlineMatch = line.match(/(\w+)\s*=\s*hline\s*\(/);
    if (hlineMatch) hlineVars.add(hlineMatch[1]);
    // Match: varName = plot(...)
    const plotMatch = line.match(/(\w+)\s*=\s*plot\s*\(/);
    if (plotMatch) plotVars.add(plotMatch[1]);
  }

  // Check fill() calls for mixed types
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("//")) continue;

    const fillMatch = line.match(/fill\s*\(\s*(\w+)\s*,\s*(\w+)/);
    if (fillMatch) {
      const [, arg1, arg2] = fillMatch;
      const arg1IsHline = hlineVars.has(arg1);
      const arg1IsPlot = plotVars.has(arg1);
      const arg2IsHline = hlineVars.has(arg2);
      const arg2IsPlot = plotVars.has(arg2);

      if ((arg1IsHline && arg2IsPlot) || (arg1IsPlot && arg2IsHline)) {
        results.push({
          rule: "fill-mixed-types",
          status: "error",
          message: "fill() cannot mix hline and plot references",
          line: i + 1,
          suggestion: "Both arguments to fill() must be the same type (both plot or both hline)",
        });
      }
    }
  }

  // Check: input.int/input.float using def instead of defval
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("//")) continue;

    if (/input\.(?:int|float)\s*\(/.test(line) && /\bdef\s*=/.test(line) && !/\bdefval\s*=/.test(line)) {
      results.push({
        rule: "input-def-param",
        status: "error",
        message: "input.int()/input.float() uses defval, not def",
        line: i + 1,
        suggestion: "Change def= to defval=",
      });
    }
  }

  return results;
}
