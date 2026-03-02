---
description: Log learnings, errors, and feature requests to enable continuous improvement
---
1. Create `.learnings/` directory in project root if it doesn't exist.
2. If command/operation fails, append to `.learnings/ERRORS.md` with ERR-YYYYMMDD-XXX ID, Summary, Error output, Context, and Suggested Fix.
3. If user corrects you, or you find a better approach, append to `.learnings/LEARNINGS.md` with LRN-YYYYMMDD-XXX ID, category, Summary, Details, Suggested Action, and Metadata.
4. If a capability is missing, append to `.learnings/FEATURE_REQUESTS.md` with FEAT-YYYYMMDD-XXX ID, Requested Capability, Extent, Complexity, and Target.
5. If learning is generally applicable, promote to `CLAUDE.md`, `AGENTS.md`, or `.github/copilot-instructions.md`.
