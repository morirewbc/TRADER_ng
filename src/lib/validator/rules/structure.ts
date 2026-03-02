import type { ValidationResult } from "../index";

export function checkStructure(code: string): ValidationResult[] {
  const results: ValidationResult[] = [];
  const lines = code.split("\n");

  // Check version annotation on first non-empty line
  const firstNonEmpty = lines.findIndex((l) => l.trim().length > 0);
  if (firstNonEmpty === -1) {
    results.push({
      rule: "empty-script",
      status: "error",
      message: "Script is empty",
    });
    return results;
  }

  const firstLine = lines[firstNonEmpty].trim();
  if (!firstLine.startsWith("//@version=")) {
    results.push({
      rule: "missing-version",
      status: "error",
      message: "//@version= annotation must be the first non-empty line",
      line: firstNonEmpty + 1,
      suggestion: "Add //@version=6 as the first line",
    });
  }

  // Check for indicator or strategy declaration
  const hasIndicator = /\bindicator\s*\(/.test(code);
  const hasStrategy = /\bstrategy\s*\(/.test(code);
  const hasLibrary = /\blibrary\s*\(/.test(code);

  if (!hasIndicator && !hasStrategy && !hasLibrary) {
    results.push({
      rule: "missing-declaration",
      status: "error",
      message: "Script must have an indicator(), strategy(), or library() declaration",
      suggestion: 'Add indicator("My Script") after the version annotation',
    });
  }

  if (hasIndicator && hasStrategy) {
    results.push({
      rule: "dual-declaration",
      status: "error",
      message: "Script cannot be both indicator() and strategy()",
      suggestion: "Remove one of the declarations",
    });
  }

  // Check balanced delimiters
  const openParens = (code.match(/\(/g) || []).length;
  const closeParens = (code.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    results.push({
      rule: "unbalanced-parens",
      status: "error",
      message: `Unbalanced parentheses: ${openParens} opening, ${closeParens} closing`,
    });
  }

  const openBrackets = (code.match(/\[/g) || []).length;
  const closeBrackets = (code.match(/\]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    results.push({
      rule: "unbalanced-brackets",
      status: "error",
      message: `Unbalanced brackets: ${openBrackets} opening, ${closeBrackets} closing`,
    });
  }

  // Check unbalanced strings (excluding escaped quotes and comments)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comment-only lines
    if (line.trim().startsWith("//")) continue;
    // Remove inline comments
    const withoutComments = line.replace(/\/\/.*$/, "");
    // Count unescaped quotes
    const doubleQuotes = (withoutComments.match(/(?<!\\)"/g) || []).length;
    if (doubleQuotes % 2 !== 0) {
      results.push({
        rule: "unbalanced-string",
        status: "error",
        message: "Unbalanced string quotes",
        line: i + 1,
      });
    }
  }

  if (results.length === 0) {
    results.push({
      rule: "structure",
      status: "pass",
      message: "Script structure is valid",
    });
  }

  return results;
}
