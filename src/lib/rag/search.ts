import { readFileSync } from "fs";
import { join } from "path";
import { scoreBM25 } from "./bm25";

// Types matching the processed JSON files
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

export type RagResult = {
  id: string;
  type: "documentation" | "reference" | "example";
  score: number;
  content: string;
};

interface SearchOptions {
  maxDocs?: number;
  maxRefs?: number;
  maxExamples?: number;
}

// Lazy-loaded data — initialized on first call
let docsData: DocChunk[] | null = null;
let refsData: FunctionRef[] | null = null;
let examplesData: ExampleScript[] | null = null;
let indexData: BM25Index | null = null;

function loadJson<T>(filename: string): T | null {
  try {
    const filePath = join(process.cwd(), "data", "pinescript-docs", filename);
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function loadData() {
  if (docsData) return;

  docsData = loadJson<DocChunk[]>("docs-chunks.json") || [];
  refsData = loadJson<FunctionRef[]>("reference-functions.json") || [];
  examplesData = loadJson<ExampleScript[]>("example-scripts.json") || [];
  indexData = loadJson<BM25Index>("bm25-index.json") || {
    documents: [],
    idf: {},
    avgDl: 0,
    totalDocs: 0,
  };

  if (indexData.totalDocs === 0) {
    console.warn("RAG data not found or empty. Run `npm run build-rag` first.");
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

// Extract explicit PineScript function references from query
function extractFunctionMentions(query: string): string[] {
  const mentions: string[] = [];
  const patterns = query.match(
    /\b(?:ta|math|str|array|matrix|map|request|ticker|timeframe|chart|runtime|log|strategy|input|color)\.\w+/g,
  );
  if (patterns) mentions.push(...patterns);

  // Also match common standalone functions
  const standalone = query.match(
    /\b(?:plot|hline|fill|bgcolor|barcolor|plotshape|indicator|strategy|alert)\b/g,
  );
  if (standalone) mentions.push(...standalone);

  return mentions;
}

export function searchRAG(
  query: string,
  options: SearchOptions = {},
): RagResult[] {
  loadData();
  if (!indexData || !docsData || !refsData || !examplesData) return [];
  if (indexData.totalDocs === 0) return [];

  const { maxDocs = 3, maxRefs = 5, maxExamples = 2 } = options;
  const queryTerms = tokenize(query);
  const functionMentions = extractFunctionMentions(query);

  // Score all indexed documents
  const scored: { id: string; score: number }[] = [];
  for (const doc of indexData.documents) {
    let score = scoreBM25(queryTerms, doc.terms, indexData.idf, indexData.avgDl);

    // Boost documents that match explicitly mentioned functions
    for (const fn of functionMentions) {
      const fnTerms = tokenize(fn);
      for (const t of fnTerms) {
        if (doc.terms.includes(t)) {
          score *= 1.5;
        }
      }
    }

    if (score > 0) {
      scored.push({ id: doc.id, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  // Build lookup maps
  const docsMap = new Map(docsData.map((d) => [d.id, d]));
  const refsMap = new Map(refsData.map((r) => [r.id, r]));
  const examplesMap = new Map(examplesData.map((e) => [e.id, e]));

  // Collect results by type with limits
  const results: RagResult[] = [];
  let docCount = 0;
  let refCount = 0;
  let exampleCount = 0;

  for (const { id, score } of scored) {
    if (docCount >= maxDocs && refCount >= maxRefs && exampleCount >= maxExamples) break;

    const doc = docsMap.get(id);
    if (doc && docCount < maxDocs) {
      results.push({
        id,
        type: "documentation",
        score,
        content: `### ${doc.title}\n${doc.content}`,
      });
      docCount++;
      continue;
    }

    const ref = refsMap.get(id);
    if (ref && refCount < maxRefs) {
      let content = `**${ref.function}** — ${ref.description}`;
      if (ref.returns) content += `\nReturns: ${ref.returns}`;
      if (ref.example) content += `\nExample:\n\`\`\`pine\n${ref.example}\n\`\`\``;
      results.push({ id, type: "reference", score, content });
      refCount++;
      continue;
    }

    const example = examplesMap.get(id);
    if (example && exampleCount < maxExamples) {
      results.push({
        id,
        type: "example",
        score,
        content: `// ${example.title} (${example.category})\n${example.code}`,
      });
      exampleCount++;
      continue;
    }
  }

  return results;
}
