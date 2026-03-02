import type { ValidationResult } from "../index";

export function checkLimits(code: string): ValidationResult[] {
  const results: ValidationResult[] = [];

  // Count plot-like calls
  const plotCalls = (
    code.match(/\b(?:plot|plotshape|plotchar|plotarrow|plotcandle|plotbar|hline|fill|bgcolor|barcolor)\s*\(/g) || []
  ).length;

  if (plotCalls > 64) {
    results.push({
      rule: "plot-limit-exceeded",
      status: "error",
      message: `${plotCalls} plot calls exceed TradingView limit of 64`,
      suggestion: "Reduce the number of plot/hline/fill/bgcolor calls",
    });
  } else if (plotCalls > 50) {
    results.push({
      rule: "plot-limit-warning",
      status: "warn",
      message: `${plotCalls} plot calls approaching TradingView limit of 64`,
      suggestion: "Consider reducing plot calls to stay safely under the limit",
    });
  }

  // Count request.* calls
  const requestCalls = (code.match(/\brequest\.\w+\s*\(/g) || []).length;

  if (requestCalls > 40) {
    results.push({
      rule: "request-limit-exceeded",
      status: "error",
      message: `${requestCalls} request calls exceed TradingView limit of 40`,
      suggestion: "Reduce the number of request.security() and other request.* calls",
    });
  } else if (requestCalls > 30) {
    results.push({
      rule: "request-limit-warning",
      status: "warn",
      message: `${requestCalls} request calls approaching TradingView limit of 40`,
      suggestion: "Consider reducing request.* calls to stay safely under the limit",
    });
  }

  // Check for excessively long scripts (TradingView has ~70k char limit for compiled)
  if (code.length > 50000) {
    results.push({
      rule: "script-size-warning",
      status: "warn",
      message: `Script is ${Math.round(code.length / 1000)}K characters — may approach TradingView compilation limits`,
      suggestion: "Consider splitting into a library + indicator pattern",
    });
  }

  return results;
}
