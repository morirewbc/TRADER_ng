/**
 * process-ngx.ts — Safe NGX data merger
 *
 * Reads the existing committed JSON files and appends NGX documentation
 * and example scripts to them, then rebuilds the BM25 index over the
 * full merged corpus.
 *
 * Unlike `build-rag` (which rebuilds from scratch and requires the full
 * raw docs directory), this script can be run at any time without the
 * original PineScript raw docs being present.
 *
 * Usage: npm run build-ngx
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, relative, dirname, basename } from "path";

const OUTPUT   = join(__dirname, "../data/pinescript-docs");
const RAW_NGX_DOCS    = join(__dirname, "../data/raw/docs/ngx");
const RAW_NGX_SCRIPTS = join(__dirname, "../data/raw/scripts/ngx-examples");

// ─── Types (mirrored from process-docs.ts) ───────────────────────────────────

interface DocChunk {
  id: string;
  type: "documentation";
  source: string;
  section: string;
  title: string;
  content: string;
  keywords: string[];
}

interface FunctionRef {
  id: string;
  type: "reference";
  namespace: string;
  function: string;
  signature: string;
  description: string;
  params: { name: string; type: string; description: string }[];
  returns: string;
  example: string;
  keywords: string[];
}

interface ExampleScript {
  id: string;
  type: "example";
  category: string;
  title: string;
  version: string;
  code: string;
  functions_used: string[];
  keywords: string[];
}

interface BM25Index {
  documents: { id: string; terms: string[] }[];
  idf: Record<string, number>;
  avgDl: number;
  totalDocs: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readDir(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  const { readdirSync, statSync } = require("fs");
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...readDir(full, ext));
    } else if (entry.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function extractKeywords(text: string): string[] {
  const kw = new Set<string>();
  const identifiers = text.match(/\b[a-z_]+\.[a-z_]+(?:\(\))?/g) || [];
  identifiers.forEach((id) => kw.add(id.replace("()", "")));
  const funcs = text.match(/\b(?:ta|math|str|array|matrix|map|request|ticker|timeframe|chart|runtime|log|strategy|input|color|plot|hline|fill|indicator|label|line|box|table)\.\w+/g) || [];
  funcs.forEach((f) => kw.add(f));
  const pineKw = ["indicator", "strategy", "overlay", "input", "plot", "hline", "fill", "bgcolor", "barcolor", "alert", "alertcondition", "var", "varip", "series", "simple", "const"];
  pineKw.forEach((k) => { if (text.toLowerCase().includes(k)) kw.add(k); });
  // NGX-specific keywords
  const ngxKw = ["ngx", "nigeria", "nigerian", "naira", "ngn", "dangote", "zenith", "gtco", "access bank", "mtn"];
  ngxKw.forEach((k) => { if (text.toLowerCase().includes(k)) kw.add(k); });
  return [...kw];
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

// ─── Load existing JSON data ──────────────────────────────────────────────────

function loadExisting<T>(filename: string, fallback: T[]): T[] {
  const path = join(OUTPUT, filename);
  if (!existsSync(path)) return fallback;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

// ─── Process NGX documentation chunks ────────────────────────────────────────

function processNGXDocChunks(idOffset: number): DocChunk[] {
  const chunks: DocChunk[] = [];
  const files = readDir(RAW_NGX_DOCS, ".md");
  let chunkId = idOffset;

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const relPath = "ngx/" + basename(file);
    const section = "ngx";

    const parts = content.split(/(?=^#{2,3}\s)/m);
    let buffer = "";
    let currentTitle = basename(file, ".md");

    for (const part of parts) {
      const headerMatch = part.match(/^(#{2,3})\s+(.+)/);
      if (headerMatch) currentTitle = headerMatch[2].trim();

      const combined = buffer + part;
      if (estimateTokens(combined) > 800 && buffer) {
        chunks.push({
          id: `doc-${chunkId++}`,
          type: "documentation",
          source: relPath,
          section,
          title: currentTitle,
          content: buffer.trim(),
          keywords: extractKeywords(buffer),
        });
        buffer = part;
      } else {
        buffer = combined;
      }
    }

    if (buffer.trim() && estimateTokens(buffer) > 20) {
      chunks.push({
        id: `doc-${chunkId++}`,
        type: "documentation",
        source: relPath,
        section,
        title: currentTitle,
        content: buffer.trim(),
        keywords: extractKeywords(buffer),
      });
    }
  }

  return chunks;
}

// ─── Process NGX example scripts ─────────────────────────────────────────────

function processNGXExamples(idOffset: number): ExampleScript[] {
  const scripts: ExampleScript[] = [];
  const files = readDir(RAW_NGX_SCRIPTS, ".pine");
  let scriptId = idOffset;

  for (const file of files) {
    const code = readFileSync(file, "utf-8");

    const versionMatch = code.match(/\/\/@version=(\d+)/);
    const version = versionMatch ? `v${versionMatch[1]}` : "v6";

    const typeMatch = code.match(/^(indicator|strategy|library)\s*\(\s*["']([^"']+)["']/m);
    const title = typeMatch ? typeMatch[2] : basename(file, ".pine");
    const scriptType = typeMatch ? typeMatch[1] : "indicator";

    const funcPattern = /\b(ta|math|str|array|matrix|map|request|ticker|timeframe|chart|runtime|log|strategy|input|color)\.\w+/g;
    const funcsUsed = new Set<string>();
    let match;
    while ((match = funcPattern.exec(code)) !== null) funcsUsed.add(match[0]);

    const builtins = ["plot", "hline", "fill", "bgcolor", "barcolor", "plotshape", "plotchar", "alert", "alertcondition", "table.new", "table.cell", "label.new"];
    builtins.forEach((b) => {
      if (new RegExp(`\\b${b.replace(".", "\\.")}\\s*[.(]`).test(code)) funcsUsed.add(b);
    });

    scripts.push({
      id: `script-${scriptId++}`,
      type: "example",
      category: "ngx-examples",
      title,
      version,
      code: code.slice(0, 3000),
      functions_used: [...funcsUsed],
      keywords: [title.toLowerCase(), "ngx-examples", scriptType, version, "ngx", "nigeria", ...funcsUsed, ...extractKeywords(code)],
    });
  }

  return scripts;
}

// ─── Remove stale NGX entries (for idempotent re-runs) ───────────────────────

function removeExistingNGX<T extends { source?: string; category?: string }>(items: T[]): T[] {
  return items.filter((item) => {
    const src = item.source ?? "";
    const cat = item.category ?? "";
    return !src.startsWith("ngx/") && cat !== "ngx-examples";
  });
}

// ─── Rebuild BM25 index ───────────────────────────────────────────────────────

function buildBM25Index(
  docs: DocChunk[],
  refs: FunctionRef[],
  examples: ExampleScript[],
): BM25Index {
  const documents: { id: string; terms: string[] }[] = [];

  for (const doc of docs) {
    documents.push({ id: doc.id, terms: tokenize([doc.title, doc.content, ...doc.keywords].join(" ")) });
  }
  for (const ref of refs) {
    documents.push({ id: ref.id, terms: tokenize([ref.function, ref.description, ref.returns, ref.example, ...ref.keywords].join(" ")) });
  }
  for (const ex of examples) {
    documents.push({ id: ex.id, terms: tokenize([ex.title, ex.category, ex.code.slice(0, 1000), ...ex.keywords].join(" ")) });
  }

  const totalDocs = documents.length;
  const df: Record<string, number> = {};
  for (const doc of documents) {
    const unique = new Set(doc.terms);
    for (const term of unique) df[term] = (df[term] || 0) + 1;
  }

  const idf: Record<string, number> = {};
  for (const [term, count] of Object.entries(df)) {
    idf[term] = Math.log((totalDocs - count + 0.5) / (count + 0.5) + 1);
  }

  const avgDl = documents.reduce((sum, d) => sum + d.terms.length, 0) / totalDocs;
  return { documents, idf, avgDl, totalDocs };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log("Loading existing data...");
  const existingDocs     = loadExisting<DocChunk>("docs-chunks.json", []);
  const existingRefs     = loadExisting<FunctionRef>("reference-functions.json", []);
  const existingExamples = loadExisting<ExampleScript>("example-scripts.json", []);
  console.log(`  Existing: ${existingDocs.length} doc chunks, ${existingRefs.length} refs, ${existingExamples.length} examples`);

  // Remove any previously merged NGX entries (makes this script idempotent)
  const baseDocs     = removeExistingNGX(existingDocs) as DocChunk[];
  const baseExamples = removeExistingNGX(existingExamples) as ExampleScript[];

  console.log("Processing NGX documentation...");
  const ngxDocs = processNGXDocChunks(baseDocs.length);
  console.log(`  ${ngxDocs.length} NGX doc chunks`);

  console.log("Processing NGX example scripts...");
  const ngxExamples = processNGXExamples(baseExamples.length);
  console.log(`  ${ngxExamples.length} NGX example scripts`);

  // Merge
  const allDocs     = [...baseDocs, ...ngxDocs];
  const allRefs     = existingRefs;  // no NGX function refs to add
  const allExamples = [...baseExamples, ...ngxExamples];

  console.log("Building merged BM25 index...");
  const bm25 = buildBM25Index(allDocs, allRefs, allExamples);
  console.log(`  ${bm25.totalDocs} total indexed documents, ${Object.keys(bm25.idf).length} unique terms`);

  writeFileSync(join(OUTPUT, "docs-chunks.json"),        JSON.stringify(allDocs, null, 2));
  writeFileSync(join(OUTPUT, "reference-functions.json"), JSON.stringify(allRefs, null, 2));
  writeFileSync(join(OUTPUT, "example-scripts.json"),    JSON.stringify(allExamples, null, 2));
  writeFileSync(join(OUTPUT, "bm25-index.json"),         JSON.stringify(bm25));

  console.log(`\nMerged output written to ${OUTPUT}/`);
  console.log("Done. Run this script again after any changes to data/raw/docs/ngx/ or data/raw/scripts/ngx-examples/");
}

main();
