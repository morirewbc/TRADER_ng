# PineScript AI: NGX Trading Engine 📈🇳🇬

An intelligent, multi-provider AI co-pilot designed specifically for generating, reviewing, and validating **TradingView Pine Script** strategies for the **Nigerian Exchange Group (NGX)**.

Built on Next.js 14/15, this application provides a chat-based interface and an integrated code editor (CodeMirror). It leverages a specialized local Retrieval-Augmented Generation (RAG) engine to provide accurate, NGX-contextualized trading algorithms.

---

## 🏗️ Core Architecture (Built from First Principles)

We broke down the problem of AI-assisted trading for the Nigerian market to its fundamental truths to build a resilient engine:

### 1. Market-Specific Prompting & Generation
Generic LLMs write generic trading bots. This engine is heavily constrained by system prompts tailored for the NGX:
- Forces the use of the `NGX:` prefix (e.g., `NGX:DANGCEM`, `NGX:MTNN`).
- Enforces local market hours (10:00–14:30 WAT).
- Formats currency strictly to Nigerian Naira (NGN).
- Understands NGX-specific market behaviors (e.g., news-driven gap opens, low-liquidity volume spikes).

### 2. Local BM25 RAG Pipeline
Instead of relying on an LLM's outdated training data, the application uses a local **BM25 scoring index**. 
It ingests local `.md` PineScript documentation and `.pine` NGX example scripts, scores them against the user's query, and injects the exact function signatures and examples directly into the LLM context.

### 3. Self-Correcting Validation Loop
Generated code isn't just dumped to the screen. The backend executes a strict multi-phase pipeline:
1. **Generation:** Streams the initial response from the LLM.
2. **Static Validation:** Runs regex and abstract syntax tree-like checks for deprecated PineScript features (e.g., ensuring `indicator()` is used in v6 instead of `study()`).
3. **AI Reviewer:** If static checks pass, a secondary AI agent reviews the code for logic flaws.
4. **Auto-Correction:** If the reviewer finds issues, it automatically fixes them and returns the corrected, production-ready script.

### 4. Native Live Data Ingestion (Tool Calling)
The engine isn't restricted to static local documentation. It natively supports **Recursive Tool Calling**, allowing the AI to autonomously fetch live data via Server-Sent Events (SSE) before generating code:
- **`get_ngx_news`**: Pulls live corporate actions, market updates, and Nairametrics news directly into the context window for sentiment-aware NGX algorithms.
- **`get_opec_news`**: Ingests real-time OPEC press releases for energy-sector strategies (e.g., NGX:SEPLAT).

### 5. Premium UI/UX Ecosystem
The frontend isn't just a basic chatbox. It boasts a state-of-the-art interface built with **React 19, Framer Motion, and Tailwind CSS**:
- **Glassmorphism Design:** Beautiful, translucent frosted-glass aesthetic for the input and toolbars.
- **Micro-Animations:** Fluid layout transitions powered by `framer-motion` for message lists and the custom `StreamingIndicator`.
- **Performance Optimized:** Lazy-loaded CodeMirror editor bundles and optimized radial gradients.

### 6. Provider Agnostic
Bring your own intelligence. The engine securely interfaces with multiple API providers out of the box, cleanly routed through unified OpenAI/Anthropic SDK architecture:
- **Anthropic** (Claude 3.5 Sonnet recommended for logic/coding)
- **OpenAI** (GPT-4o, o3-mini)
- **Groq** (Blazing fast Llama-3-70B via OpenAI SDK proxy)
- **OpenRouter** (Access thousands of open-weight models natively)
- **Google** (Gemini API native tool-calling via `/v1beta/openai/`)
- **Ollama** (Host Qwen2.5-Coder locally for 100% absolute privacy on your own GPU)

### 7. Dynamic Model Discovery
The Model selector doesn't use a stale hardcoded list. When you paste your API key, the app **dynamically fetches all available models** from your provider in real-time via a dedicated `/api/models` endpoint:
- Supports **OpenAI**, **Groq**, **OpenRouter**, **Google**, and **Ollama** (`/api/tags`).
- Debounced (800ms) — only fires after you stop typing, with zero token cost.
- Falls back to a curated default list if the fetch fails.
- Displayed inside a **searchable Combobox dropdown** with Framer Motion animations, instant filtering, and click-outside-to-close.

### 8. Security-First API Key Handling
- **Client-only storage:** API keys live in `localStorage` and are never persisted on the server.
- **POST-based model fetch:** The `/api/models` endpoint uses `POST` (not `GET`), so your key travels in the encrypted request body — never in URL query params, server logs, browser history, or proxy logs.
- **Error sanitization:** `sanitizeProviderError()` strips raw error messages before they reach the client, preventing accidental API key leakage in stack traces.
- **SSRF protection:** `validateOllamaUrl()` blocks requests to cloud metadata endpoints (e.g., `169.254.169.254`).
- **Rate limiting:** Max 30 requests per minute per IP.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v20+ recommended)
- API Key from Anthropic, OpenAI, or a running local instance of Ollama.

### 1. Installation

Clone the repository and install the dependencies:

```bash
git clone <repository-url> trader-ngx
cd trader-ngx
npm install
```

### 2. Build the RAG Engine (Critical Step)
Before the AI can answer accurately, you must build the index from the raw documentation and NGX specific scripts.

```bash
# Processes files in data/raw/docs/ngx and data/raw/scripts/ngx-examples
npm run build-ngx

# Alternatively, rebuild the entire PineScript + NGX reference library:
npm run build-rag
```

### 3. Run the Development Server

```bash
npm run dev
```

Navigate to [http://localhost:3000/chat](http://localhost:3000/chat) to start building NGX algorithms. You can configure your model and API key directly in the UI settings panel.

---

## 📂 Project Structure Breakdown

| Path | Purpose |
|------|---------|
| `scripts/process-ngx.ts` | The core ingestion script. Parses markdown and standardizes `.pine` scripts to build the `bm25-index.json`. |
| `src/app/api/chat/route.ts` | The brains of the operation. Handles rate-limiting, secure LLM streaming, user-code injection, and the entire validation/review pipeline. |
| `src/lib/rag/` | Custom BM25 search logic (`search.ts` and `bm25.ts`). Scores user queries and extracts function signatures. |
| `src/lib/security.ts` | Server-Side Request Forgery (SSRF) protection for Ollama setups, API validation, and sanitization parameters. |
| `src/lib/ai/reviewer.ts` | The secondary autonomous agent responsible for critiquing and fixing the primary generated code. |
| `src/app/api/models/route.ts` | Dynamic model discovery endpoint. Proxies `/v1/models` for each provider via POST (keys in body, not URL). |

## 🛠️ Modifying the BM25 Index

To teach the AI about new NGX patterns:
1. Navigate to `data/raw/scripts/ngx-examples/`
2. Create a new `.pine` file illustrating your strategy.
3. Run `npm run build-ngx` to seamlessly ingest the new strategy without wiping the existing documentation database.

## 📄 License
MIT License - See the [LICENSE](LICENSE) file for more details.
