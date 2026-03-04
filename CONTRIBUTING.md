# Contributing to TRADER_ng

Thanks for your interest in contributing.

## Contribution Model

This repository is maintainer-owned upstream (`morirewbc/TRADER_ng`).  
External contributors should:

1. Fork the repository
2. Push changes to their fork
3. Open a Pull Request (PR) back to `morirewbc/TRADER_ng:main`

Direct pushes to upstream are not part of the public contribution workflow.

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+

### Local setup

```bash
git clone https://github.com/<your-github-username>/TRADER_ng.git
cd TRADER_ng
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Fork + PR Workflow

1. Fork this repo on GitHub.
2. Clone your fork locally.
3. Create a branch from `main`:

```bash
git checkout -b feat/short-description
```

4. Make your changes.
5. Run required checks (see below).
6. Commit with a clear message.
7. Push to your fork.
8. Open a PR from your fork branch into `morirewbc/TRADER_ng:main`.

## Required Checks Before Opening a PR

Run these from the repository root:

```bash
npm run lint
npm run build
```

If your changes touch data ingestion or RAG indexing, run the relevant script(s) too:

- `npm run build-rag` for PineScript docs/scripts ingestion
- `npm run build-ngx` for NGX-focused docs ingestion
- `npm run discover-ngx-pairs`, `npm run fetch-historical`, `npm run build-historical` for NGX historical data pipeline changes

## What Not to Commit

Do not commit generated or local artifacts such as:

- `node_modules/`
- `.next/`
- `__MACOSX/`
- `.DS_Store`
- `tsconfig.tsbuildinfo`
- local API keys, secrets, or machine-specific files

Also avoid committing large raw dumps in `data/raw/historical/` unless explicitly required and discussed.

## Project Map (Where to Change What)

- `src/app/` — app routes and API endpoints (`/api/chat`, `/api/fix`, `/api/validate`, `/api/ngx/*`)
- `src/components/` — UI components (chat, editor, NGX views, layout)
- `src/hooks/` — client-side state/data hooks
- `src/lib/` — core logic (RAG, validator, AI review, data adapters, security)
- `scripts/` — ingestion/processing scripts for docs and NGX datasets
- `data/` — processed datasets and raw inputs

## PR Expectations

Please include in your PR:

- What changed
- Why it changed
- How you verified it (`lint/build` output and any extra checks)
- Screenshots or short clips for UI changes
- Any follow-up work or limitations

Keep PRs focused and reasonably small. Large multi-purpose PRs are harder to review and may be asked to split.

## Review and Merge

Maintainers may request changes before merge.  
PRs that are out of scope, unreviewable, or fail checks may be closed.
