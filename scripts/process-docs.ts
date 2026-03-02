import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, relative, basename, dirname } from "path";

// --- Types ---

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

// --- Helpers ---

const RAW_DOCS = join(__dirname, "../data/raw/docs");
const RAW_SCRIPTS = join(__dirname, "../data/raw/scripts");
const OUTPUT = join(__dirname, "../data/pinescript-docs");

function readDir(dir: string, ext: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
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
  // Extract PineScript identifiers like ta.rsi, request.security, etc.
  const identifiers = text.match(/\b[a-z_]+\.[a-z_]+(?:\(\))?/g) || [];
  identifiers.forEach((id) => kw.add(id.replace("()", "")));
  // Extract standalone function names
  const funcs = text.match(/\b(?:ta|math|str|array|matrix|map|request|ticker|timeframe|chart|runtime|log|strategy|input|color|plot|hline|fill|indicator|label|line|box|table)\.\w+/g) || [];
  funcs.forEach((f) => kw.add(f));
  // Extract common PineScript keywords
  const pineKw = ["indicator", "strategy", "overlay", "input", "plot", "hline", "fill", "bgcolor", "barcolor", "alert", "alertcondition", "var", "varip", "series", "simple", "const", "export", "import", "method", "type", "switch", "for", "while", "if", "else"];
  pineKw.forEach((k) => {
    if (text.toLowerCase().includes(k)) kw.add(k);
  });
  return [...kw];
}

// --- Step 1: Process documentation into chunks ---

function processDocChunks(): DocChunk[] {
  const chunks: DocChunk[] = [];
  const files = readDir(RAW_DOCS, ".md");
  let chunkId = 0;

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const relPath = relative(RAW_DOCS, file);
    const section = dirname(relPath) === "." ? "root" : dirname(relPath);

    // Split by ## or ### headers
    const parts = content.split(/(?=^#{2,3}\s)/m);

    let buffer = "";
    let currentTitle = basename(file, ".md");

    for (const part of parts) {
      const headerMatch = part.match(/^(#{2,3})\s+(.+)/);
      if (headerMatch) {
        currentTitle = headerMatch[2].trim();
      }

      const combined = buffer + part;
      const tokens = estimateTokens(combined);

      if (tokens > 800 && buffer) {
        // Flush buffer
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
      } else if (tokens > 800) {
        // Single section too large — split but don't break code blocks
        const lines = part.split("\n");
        let subBuffer = "";
        for (const line of lines) {
          subBuffer += line + "\n";
          if (estimateTokens(subBuffer) > 700 && !subBuffer.includes("```") ||
              (subBuffer.split("```").length - 1) % 2 === 0 && estimateTokens(subBuffer) > 700) {
            chunks.push({
              id: `doc-${chunkId++}`,
              type: "documentation",
              source: relPath,
              section,
              title: currentTitle,
              content: subBuffer.trim(),
              keywords: extractKeywords(subBuffer),
            });
            subBuffer = "";
          }
        }
        if (subBuffer.trim()) {
          buffer = subBuffer;
        }
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

// --- Step 2: Extract function signatures ---

function extractFunctionRefs(): FunctionRef[] {
  const refs: FunctionRef[] = [];
  const funcDir = join(RAW_DOCS, "reference", "functions");
  if (!existsSync(funcDir)) return refs;

  const files = readDir(funcDir, ".md");
  let refId = 0;

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const namespace = basename(file, ".md");

    // Split by ## headers — each function is a ## section
    const sections = content.split(/(?=^## \w)/m);

    for (const section of sections) {
      const headerMatch = section.match(/^## (\S+)/);
      if (!headerMatch) continue;

      const funcName = headerMatch[1].replace(/\(\)$/, "");
      const fullName = funcName.includes(".") ? funcName : `${namespace}.${funcName}`;

      // Extract description (text after header, before ### subsections)
      const descMatch = section.match(/^## .+\n\n([\s\S]*?)(?=\n###|\n---|\n$)/);
      const description = descMatch ? descMatch[1].trim().split("\n")[0] : "";

      // Extract returns
      const returnsMatch = section.match(/### Returns\n([\s\S]*?)(?=\n###|\n---|\n$)/);
      const returns = returnsMatch ? returnsMatch[1].trim() : "";

      // Extract code example
      const exampleMatch = section.match(/```pine\n([\s\S]*?)```/);
      const example = exampleMatch ? exampleMatch[1].trim() : "";

      // Build signature from the function name + description hints
      const signature = fullName + "(...)";

      // Extract params from description context
      const params: FunctionRef["params"] = [];

      refs.push({
        id: `ref-${refId++}`,
        type: "reference",
        namespace: namespace,
        function: fullName,
        signature,
        description: description || section.split("\n").slice(1, 3).join(" ").trim(),
        params,
        returns,
        example: example.slice(0, 500),
        keywords: [fullName, namespace, ...extractKeywords(section)],
      });
    }
  }

  // Also parse from complete reference and other reference files
  const refFiles = [
    join(RAW_DOCS, "reference", "variables.md"),
    join(RAW_DOCS, "reference", "constants.md"),
    join(RAW_DOCS, "reference", "types.md"),
  ];

  for (const file of refFiles) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, "utf-8");
    const namespace = basename(file, ".md");
    const sections = content.split(/(?=^## \w)/m);

    for (const section of sections) {
      const headerMatch = section.match(/^## (\S+)/);
      if (!headerMatch) continue;

      const name = headerMatch[1].replace(/\(\)$/, "");
      const descMatch = section.match(/^## .+\n\n([\s\S]*?)(?=\n###|\n---|\n$)/);

      refs.push({
        id: `ref-${refId++}`,
        type: "reference",
        namespace,
        function: name,
        signature: name,
        description: descMatch ? descMatch[1].trim().split("\n")[0] : "",
        params: [],
        returns: "",
        example: "",
        keywords: [name, namespace, ...extractKeywords(section)],
      });
    }
  }

  return refs;
}

// --- Step 3: Index example scripts ---

function indexExampleScripts(): ExampleScript[] {
  const scripts: ExampleScript[] = [];
  const files = readDir(RAW_SCRIPTS, ".pine");
  let scriptId = 0;

  for (const file of files) {
    const code = readFileSync(file, "utf-8");
    const relPath = relative(RAW_SCRIPTS, file);

    // Extract version
    const versionMatch = code.match(/\/\/@version=(\d+)/);
    const version = versionMatch ? `v${versionMatch[1]}` : "unknown";

    // Extract type and title
    const typeMatch = code.match(/^(indicator|strategy|library)\s*\(\s*["']([^"']+)["']/m);
    const scriptType = typeMatch ? typeMatch[1] : "indicator";
    const title = typeMatch ? typeMatch[2] : basename(file, ".pine");

    // Extract category from directory path
    const parts = relPath.split("/");
    const category = parts.length > 2 ? parts[1] : parts.length > 1 ? parts[0] : "general";

    // Extract functions used
    const funcPattern = /\b(ta|math|str|array|matrix|map|request|ticker|timeframe|chart|runtime|log|strategy|input|color)\.\w+/g;
    const funcsUsed = new Set<string>();
    let match;
    while ((match = funcPattern.exec(code)) !== null) {
      funcsUsed.add(match[0]);
    }

    // Also detect standalone built-ins
    const builtins = ["plot", "hline", "fill", "bgcolor", "barcolor", "plotshape", "plotchar", "plotarrow", "plotcandle", "alert", "alertcondition"];
    builtins.forEach((b) => {
      if (new RegExp(`\\b${b}\\s*\\(`).test(code)) funcsUsed.add(b);
    });

    scripts.push({
      id: `script-${scriptId++}`,
      type: "example",
      category,
      title,
      version,
      code: code.slice(0, 3000), // Cap at ~750 tokens
      functions_used: [...funcsUsed],
      keywords: [title.toLowerCase(), category, scriptType, version, ...funcsUsed, ...extractKeywords(code)],
    });
  }

  return scripts;
}

// --- Step 4: Build BM25 index ---

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function buildBM25Index(
  docs: DocChunk[],
  refs: FunctionRef[],
  examples: ExampleScript[],
): BM25Index {
  const documents: { id: string; terms: string[] }[] = [];

  for (const doc of docs) {
    const terms = tokenize([doc.title, doc.content, ...doc.keywords].join(" "));
    documents.push({ id: doc.id, terms });
  }

  for (const ref of refs) {
    const terms = tokenize(
      [ref.function, ref.signature, ref.description, ref.returns, ref.example, ...ref.keywords].join(" "),
    );
    documents.push({ id: ref.id, terms });
  }

  for (const ex of examples) {
    const terms = tokenize(
      [ex.title, ex.category, ex.code.slice(0, 1000), ...ex.keywords].join(" "),
    );
    documents.push({ id: ex.id, terms });
  }

  // Compute IDF
  const totalDocs = documents.length;
  const df: Record<string, number> = {};
  for (const doc of documents) {
    const unique = new Set(doc.terms);
    for (const term of unique) {
      df[term] = (df[term] || 0) + 1;
    }
  }

  const idf: Record<string, number> = {};
  for (const [term, count] of Object.entries(df)) {
    idf[term] = Math.log((totalDocs - count + 0.5) / (count + 0.5) + 1);
  }

  // Average document length
  const avgDl = documents.reduce((sum, d) => sum + d.terms.length, 0) / totalDocs;

  return { documents, idf, avgDl, totalDocs };
}

// --- Main ---

function main() {
  console.log("Processing documentation...");
  const docChunks = processDocChunks();
  console.log(`  ${docChunks.length} doc chunks`);

  console.log("Extracting function references...");
  const funcRefs = extractFunctionRefs();
  console.log(`  ${funcRefs.length} function references`);

  console.log("Indexing example scripts...");
  const examples = indexExampleScripts();
  console.log(`  ${examples.length} example scripts`);

  console.log("Building BM25 index...");
  const bm25 = buildBM25Index(docChunks, funcRefs, examples);
  console.log(`  ${bm25.totalDocs} indexed documents, ${Object.keys(bm25.idf).length} unique terms`);

  // Write outputs
  writeFileSync(join(OUTPUT, "docs-chunks.json"), JSON.stringify(docChunks, null, 2));
  writeFileSync(join(OUTPUT, "reference-functions.json"), JSON.stringify(funcRefs, null, 2));
  writeFileSync(join(OUTPUT, "example-scripts.json"), JSON.stringify(examples, null, 2));
  writeFileSync(join(OUTPUT, "bm25-index.json"), JSON.stringify(bm25));

  console.log(`\nOutput written to ${OUTPUT}/`);
  console.log("Done.");
}

main();
