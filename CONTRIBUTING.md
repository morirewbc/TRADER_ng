# Contributing to PineScript AI

## Getting Started

```bash
git clone https://github.com/arturoabreuhd/pinescript-ai.git
cd pinescript-ai
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll need to configure a provider (Anthropic, OpenAI, Google, or Ollama) in the browser to test generation.

## Project Structure

| Directory | Purpose |
|---|---|
| `src/app/chat/` | Main chat page with split-panel layout (chat + code editor) |
| `src/app/settings/` | Provider and model configuration |
| `src/app/api/chat/` | Streaming SSE endpoint — generation + validation pipeline |
| `src/app/api/fix/` | Auto-correction endpoint |
| `src/components/chat/` | Message list, user/assistant messages, chat input, streaming indicator |
| `src/components/editor/` | CodeMirror editor, validation panel, PineScript language mode |
| `src/hooks/` | `useChat` — all chat state via useReducer |
| `src/lib/rag/` | BM25 search engine for RAG retrieval |
| `src/lib/validator/` | Static validation (regex-based rule engine) |
| `src/lib/validator/rules/` | Individual rule files: structure, deprecated, v6-specific, limits |
| `src/lib/ai/` | AI code reviewer + auto-correction (LLM calls) |
| `scripts/` | RAG data processor (`process-docs.ts`) |
| `data/pinescript-docs/` | Processed RAG data (committed) |
| `data/raw/` | Source documentation and scripts (gitignored) |

## How the RAG Works

The RAG system uses BM25 full-text search with no external dependencies.

**Build time** (`npm run build-rag`):
1. Reads Markdown docs from `data/raw/docs/` — splits into ~800-token chunks
2. Extracts function signatures from `data/raw/docs/reference/functions/*.md`
3. Indexes `.pine` scripts from `data/raw/scripts/` — extracts title, version, functions used
4. Builds a BM25 inverted index over all documents
5. Writes 4 JSON files to `data/pinescript-docs/`

**Runtime** (every generation request):
1. Tokenizes the user's message
2. Scores against BM25 index (function-mention boosting applied)
3. Returns top matches: 5 function refs + 3 doc chunks + 2 example scripts
4. Results injected into the system prompt (~3–4K tokens)

See the [README](README.md#customize-your-knowledge-base) for details on adding your own data.

## Adding Validation Rules

Static validation rules live in `src/lib/validator/rules/`. Each file exports an array of rule objects:

```typescript
interface Rule {
  id: string;
  check: (code: string, version: "v5" | "v6") => ValidationResult | null;
}
```

To add a new rule:

1. Pick the appropriate file (`structure.ts`, `deprecated.ts`, `v6-specific.ts`, or `limits.ts`) — or create a new one
2. Add a rule object with a unique `id` and a `check` function
3. Return `null` if the rule passes, or a `ValidationResult` with status, message, and optional line number
4. If you created a new file, import and spread it in `src/lib/validator/index.ts`

Rules run synchronously and should be fast — no LLM calls, no async. The AI reviewer handles anything that needs deeper analysis.

## Code Style

- TypeScript with strict mode
- Tailwind CSS for all styling — no CSS modules, no styled-components
- Functional components with hooks
- No component library (shadcn, MUI, etc.) — all UI built directly with Tailwind

Run `npm run lint` before submitting.

## Pull Request Process

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Run `npm run build` to verify no type errors
5. Open a PR with a clear description of what changed and why
