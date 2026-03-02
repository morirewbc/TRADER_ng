## First Principles Decomposer: pinescript-ai (NGX Trading Engine)

**PROBLEM:** We need a detailed `README.md` for a codebase that builds a trading engine/AI co-pilot for the NGX (Nigerian Exchange Group) stock market.

### Phase 1: ASSUMPTIONS IDENTIFIED
1. **Assumption:** Users know what "Pine Script" is and why it's used for the NGX. 
   → **Challenge:** Retail NGX traders might not use TradingView heavily yet. The README must explain *why* we generate Pine Script configured specifically for Nigerian market data (NGX prefix, NGN currency, specific market hours).
2. **Assumption:** The RAG (Retrieval-Augmented Generation) pipeline works magically out-of-the-box.
   → **Challenge:** Developers need to know *how* the data gets into the app. They must run `npm run build-ngx` or `npm run build-rag` to parse `.md` docs and `.pine` scripts into the BM25 index BEFORE the AI can assist properly.
3. **Assumption:** The application only uses OpenAI.
   → **Challenge:** The backend explicitly supports Anthropic, OpenAI, Google Base URLs, and local Ollama models. The README must highlight this flexibility for cost and privacy.
4. **Assumption:** Generated code is just raw text dumped to the user.
   → **Challenge:** The app has a sophisticated multi-stage validation pipeline (static analysis, transpiler validation, and an AI Reviewer self-correction loop). This is a massive selling point that needs explicit documentation.

### Phase 2: FUNDAMENTAL TRUTHS (The Atoms)
- **Bedrock Fact 1:** This is a Next.js (React 19) web application providing a chat-based UI and a CodeMirror-powered editor.
- **Bedrock Fact 2:** It acts as a specialized AI code generator, specifically constrained and prompted to output TradingView Pine Script (v5 or v6) tailored for the Nigerian Exchange Group (NGX).
- **Bedrock Fact 3:** The AI utilizes local Retrieval-Augmented Generation (RAG). It scores user queries against a local BM25 index of Pine Script documentation and hand-crafted NGX example scripts to ensure accuracy.
- **Bedrock Fact 4:** It performs strict code validation on the generated output, automatically fixing errors using a secondary AI review pass before presenting it to the user.

### Phase 3: REBUILT SOLUTION (The New README Architecture)
A ground-up README must address the core needs: **What is this**, **Why is it special for NGX**, and **How do I run and extend it?**

#### VS CONVENTIONAL:
Conventional READMEs list generic installation steps and a vague "AI Trading Bot" feature list. Our rebuilt README explicitly documents the *data ingestion flow* (`build-ngx`), the *Provider Agnostic LLM Setup*, the *NGX-specific system prompts*, and the *Self-Correcting Validation Loop*.

---

Let's generate the actual `README.md` based on these truths.
