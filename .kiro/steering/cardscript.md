---
inclusion: fileMatch
fileMatchPattern: ["packages/stacks/**", ".kiro/specs/stack-*/**", ".kiro/specs/ai-stack-generator/**", ".kiro/specs/lookups-forms-privacy/**"]
---

# CardScript rules (Stage 2)

Allowed commands: go to card/page, set, add, if/else, lookup (server), show message,
submit form (server), for each (limit max 20), clear fields.
Expressions: text, numbers, variables, row.column, comparison, and/or/not, +, -, &.

Forbidden: unbounded loops, recursion, functions, network, files, eval, cross-organization data.

Limits: 200 steps per event, 600 characters per script, 40 cards, 6 fields and 4 buttons
per card, 10 tables, 500 rows per table, 12 columns per table.

The interpreter is a pure function: run(stack, state, event) -> { state, effects }.
It never throws. Errors return a clean error state.
Every go-to target must exist. Every card must have a way out.
A `pin` column in a lookup match is compared against `pin_hash` with a hash check, never plain equality.
