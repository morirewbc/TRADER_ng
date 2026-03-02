# PineScript AI

Self-hosted PineScript code generator with RAG-powered generation, multi-provider LLM support, and a built-in validation pipeline. Bring your own API key — nothing is stored on any server.

<!-- ![PineScript AI Screenshot](docs/screenshot.png) -->

## Features

- **Multi-provider** — Anthropic (Claude), OpenAI (GPT-4.1, o3), Google (Gemini), or Ollama for local models
- **RAG-powered generation** — BM25 search over PineScript v6 docs and 285 example scripts, injected into every prompt
- **3-layer validation** — Static regex rules, optional AST transpiler check, AI code review with auto-correction
- **Live code editor** — CodeMirror 6 with PineScript syntax highlighting, inline validation results
- **BYOK** — Bring Your Own Key. API keys stay in your browser's localStorage, never touch a server
- **Streaming** — Real-time SSE streaming from all providers

## Quick Start

```bash
git clone https://github.com/arturoabreuhd/pinescript-ai.git
cd pinescript-ai
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), pick your provider, paste your API key, and start generating.

## Easy Mode (Non-Technical)

Use one command:

```bash
npm run start:easy
```

What it does:

- Runs a quick setup check (`npm run setup`)
- Runs environment diagnostics (`npm run doctor`)
- Starts the app on an available port
- Opens your browser automatically to `/chat`

## Customize Your Knowledge Base

This is where PineScript AI becomes yours. The RAG system uses a local BM25 search index — no vector database, no embeddings API, no external services. You control exactly what knowledge the AI has access to.

### How it works

```
data/raw/          (your source files — gitignored)
    docs/          Markdown documentation
    scripts/       .pine example scripts

        ↓  npm run build-rag

data/pinescript-docs/   (processed JSON — committed, used at runtime)
    docs-chunks.json           Documentation split into ~800-token chunks
    reference-functions.json   Function signatures with examples
    example-scripts.json       Example scripts with metadata
    bm25-index.json            Search index
```

The shipped dataset includes PineScript v6 reference documentation and 285 community example scripts. You can replace or extend this with anything you want.

### Adding your own documentation

Place Markdown files in `data/raw/docs/`. The processor respects subdirectories for organization:

```
data/raw/docs/
├── concepts/              General concepts (execution model, types, etc.)
├── reference/
│   ├── functions/         One .md per namespace (ta.md, strategy.md, math.md)
│   ├── variables.md       Built-in variables
│   ├── constants.md       Built-in constants
│   └── types.md           Type definitions
├── visuals/               Plotting, colors, tables
└── writing_scripts/       Publishing, debugging, optimization
```

The function reference files get special treatment — each `## functionName` section is extracted as a standalone signature with params, return type, and example code. Structure them like:

```markdown
## ta.rsi

Calculates the Relative Strength Index.

### Returns
series float

```pine
rsiValue = ta.rsi(close, 14)
```
```

Everything else is chunked into ~800-token blocks for retrieval.

### Adding example scripts

Place `.pine` files in `data/raw/scripts/`. The processor automatically extracts:

- Script title from `indicator("title")` or `strategy("title")`
- PineScript version from `//@version=N`
- All function calls used (ta.*, strategy.*, etc.)
- Category from the subdirectory name

Organize by topic if you want meaningful categories:

```
data/raw/scripts/
├── trend/          Moving averages, MACD, ADX scripts
├── oscillators/    RSI, Stochastic, CCI scripts
├── volume/         OBV, VWAP, volume profile scripts
└── strategies/     Complete strategy examples
```

### Rebuilding the index

After adding or changing files in `data/raw/`:

```bash
npm run build-rag
```

This regenerates all four JSON files in `data/pinescript-docs/`. The search index is rebuilt from scratch — there's no incremental update. Takes a few seconds even with hundreds of documents.

### How search works at runtime

When a user sends a message, the last user message is tokenized and scored against the BM25 index. The top results are injected into the system prompt:

- Up to **5 function references** (exact signatures the model should use)
- Up to **3 documentation chunks** (concepts, guides, explanations)
- Up to **2 example scripts** (complete working code)

This keeps the context window around 3–4K tokens of RAG content per generation, enough to ground the model without overwhelming it.

## Optional: Transpiler Validation

You can optionally enable AST-level validation using [pine-transpiler](https://github.com/Opus-Aether-AI/pine-transpiler). This catches syntax errors that regex-based validation can't.

```bash
npm install github:Opus-Aether-AI/pine-transpiler
```

Then enable it in Settings > Transpiler Validation. The transpiler is AGPL-3.0 licensed — installing it is your choice. PineScript AI works fine without it.

## Docker

```bash
docker compose up --build
```

The app will be available at [http://localhost:3000](http://localhost:3000).

## Tech Stack

- [Next.js 16](https://nextjs.org) — App Router, TypeScript strict mode
- [Tailwind CSS v4](https://tailwindcss.com) — Styling (no component library)
- [CodeMirror 6](https://codemirror.net) — Code editor with custom PineScript mode
- [Anthropic SDK](https://docs.anthropic.com) / [OpenAI SDK](https://platform.openai.com/docs) — LLM providers (Google Gemini uses OpenAI-compatible API)
- BM25 — Full-text search for RAG (zero external dependencies)

## Project Structure

```
src/
├── app/
│   ├── chat/page.tsx            Main chat + editor interface
│   ├── settings/page.tsx        Provider configuration
│   └── api/
│       ├── chat/route.ts        Streaming generation + validation pipeline
│       └── fix/route.ts         Auto-correction endpoint
├── components/
│   ├── chat/                    Messages, input, streaming indicator
│   └── editor/                  Code editor, validation panel
├── hooks/
│   └── useChat.ts               Chat state management
└── lib/
    ├── types.ts                 Shared types and settings
    ├── rag/                     BM25 search engine
    ├── validator/               Static validation rules
    │   └── rules/               Structure, deprecated patterns, v6, limits
    ├── ai/                      AI code review + auto-correction
    └── transpiler.ts            Optional transpiler wrapper

scripts/
└── process-docs.ts              RAG data processor

data/
├── raw/                         Source docs + scripts (gitignored)
└── pinescript-docs/             Processed JSONs (committed)
```

## License

[MIT](LICENSE)
