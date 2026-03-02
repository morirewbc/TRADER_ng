---
description: Code with high operational discipline, assumption surfacing, and strict code quality standards
---
1. Assumption Surfacing: Before implementing, explicitly state assumptions ("ASSUMPTIONS I'M MAKING").
2. Confusion Management: If specs are unclear, STOP, name the confusion, present the tradeoff, and wait for resolution.
3. Implementation Workflow: Enforce simplicity. Write definition of success (test-first), implement naïve correct version, verify, then optimize. Emit an inline plan for multi-step tasks.
4. Scope Discipline: Touch exactly what is asked. Do not clean up unrelated code. Explicitly list dead code and ask for permission to remove.
5. Provide a clear change description showing what was changed, what wasn't touched, and potential concerns.
