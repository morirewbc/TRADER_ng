# PineScript AI by plastiQ (layered on Clear Terminal's work)

## Project Overview
Open-source, code generator with RAG-powered generation (with deep NGX Context)
. Chat + code editor with real streaming from Anthropic, OpenAI, Gemini or Ollama. BYOK (Bring Your Own OpenRouter Key). Includes RAG-powered generation, static validation, Nigerian/NGX Content, Nigerian Business News Dashboard, and AI code review.

## Stack
- Next.js 16 (App Router, TypeScript strict)
- Tailwind CSS v4 (no shadcn — all components built with Tailwind directly)
- CodeMirror 6 for code editing
- Anthropic SDK, OpenAI SDK for LLM providers
- BM25 search for RAG (no vector embeddings, no extra dependencies)
- npm (not pnpm)

## Architecture
- Single-page chat app at `/chat` with split-panel layout (chat + editor)
- Settings at `/settings` — provider config stored in localStorage
- API route at `/api/chat` — streams SSE responses, routes to provider
- API route at `/api/validate` — standalone PineScript validation endpoint
- `useChat` hook manages all chat state with useReducer
- Code extraction happens DURING streaming (incremental, not batch)

## RAG System
- **Data sources**: PineScript v6 reference documentation + 285 community example scripts
- **Processing**: `npm run build-rag` processes raw data → JSON chunks + BM25 index
- **Search**: BM25 scoring with function-mention boosting. Returns max 3 docs + 5 refs + 2 examples (~3-4K tokens)
- **Integration**: RAG context injected into system prompt before each generation
- **Data flow**: `data/raw/` (gitignored sources) → `data/pinescript-docs/` (committed JSONs)
- Raw docs: 438 chunks, 441 function refs, 285 example scripts, 1164 indexed documents

## Validation Pipeline
Three layers run after every code generation:
1. **Static validator** — instant regex rules: structure, deprecated patterns, v6 compatibility, TradingView limits
2. **AI reviewer** — LLM call to check types, runtime errors, repainting risks (only if static passes)
3. **Auto-correction** — one fix LLM call if reviewer finds issues, then re-validate statically
- Maximum: generate + review + fix = 3 LLM calls per generation
- Fails open: if AI review/fix errors out, static results are sent alone
- SSE status events: validating → reviewing → correcting → results

## Design System
- Background: #0b0b11, Surface: #12121a, Primary: #00d4aa
- Fonts: Geist Sans (body) + JetBrains Mono (code)
- 60px fixed sidebar on left
- Dark-only theme

## Key Decisions
- No shadcn/ui — lightweight custom components with Tailwind
- CodeMirror over Monaco — lighter, better for single-language use
- npm over pnpm — simpler for open source contributors
- localStorage for settings — no database needed for BYOK
- BM25 over vector embeddings — zero dependencies, fast enough for <1200 documents
- investing.com HistoricalDataAjax endpoint for NGX OHLCV data (full H/L/V, back to listing date). Accessed via Firecrawl (fc-b38e308d921e4b2eaa875b8eb3cc9446) — Firecrawl renders the page in a browser (bypasses Cloudflare), then executeJavascript calls HistoricalDataAjax from within that session.
- Per-ticker ATR14/volatility/volume profiles stored as BM25 RAG chunks for realistic strategy generation
- get_ngx_historical tool gives AI precise bar data + stats during generation for backtesting-aware parameter suggestions
- Tool calling loop (recursive do-while) handles get_ngx_news, get_opec_news, get_ngx_historical for both Anthropic and OpenAI paths

## PineScript Knowledge
- System prompt includes v6 pitfalls + RAG-injected exact signatures
- Always sends currentCode with requests for context continuity
- Code-first response format (code block before explanation)

## File Structure
```
scripts/
  process-docs.ts         — RAG data processor + BM25 index builder
data/
  raw/                    — Source docs + scripts (gitignored)
  pinescript-docs/        — Processed JSONs (committed)
    docs-chunks.json      — Documentation chunks
    reference-functions.json — Function signatures
    example-scripts.json  — Example scripts
    bm25-index.json       — BM25 search index
src/
  app/
    layout.tsx            — Root layout with fonts
    page.tsx              — Landing/redirect
    globals.css           — Design tokens + base styles
    settings/page.tsx     — Provider configuration
    chat/page.tsx         — Main chat + editor interface
    api/chat/route.ts     — Streaming API route + validation pipeline
    api/validate/route.ts — Standalone validation endpoint
  components/
    layout/Sidebar.tsx    — Navigation sidebar
    chat/                 — MessageList, UserMessage, AssistantMessage, ChatInput, StreamingIndicator
    editor/               — EditorPanel, ValidationPanel, pine-language, codemirror-theme
  hooks/
    useChat.ts            — Chat state management + SSE event handling
  lib/
    types.ts              — Shared types
    rag/
      bm25.ts             — BM25 scoring algorithm
      search.ts           — RAG search orchestrator
      index.ts            — Public export
    validator/
      index.ts            — Validation orchestrator
      rules/structure.ts  — Structure rules (version, declaration, balanced delimiters)
      rules/deprecated.ts — Deprecated pattern detection
      rules/v6-specific.ts — v6 type system rules
      rules/limits.ts     — TradingView limit checks
    ai/
      reviewer.ts         — AI code review + auto-correction
scripts/
  discover-ngx-pairs.ts   — Firecrawl-based: renders ng.investing.com pages to extract pair_id per ticker
  fetch-historical.ts     — Firecrawl-based: executeJavascript calls HistoricalDataAjax in-browser for full OHLCV
  process-historical.ts   — Computes per-ticker stats + appends historical chunks to BM25 index
data/
  raw/historical/         — Raw OHLCV JSON per ticker (gitignored). pair-ids.json committed.
  ngx-historical/
    profiles.json         — Per-ticker statistical profiles (committed)
src/
  lib/
    data/
      live.ts             — getNgxNews() + getOpecNews() for tool calling
      historical.ts       — getNgxHistorical() for tool calling
  app/
    api/
      ngx/historical/route.ts — GET /api/ngx/historical?ticker=&period=
```
