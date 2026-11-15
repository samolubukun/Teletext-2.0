# Design: Stack format and CardScript

## Package boundary

`packages/stacks` is pure TypeScript. It imports no browser, Convex, network, clock or randomness code. Stage 1 never imports it. Server integrations consume typed effects.

## Correctness properties

| Id | Property |
| --- | --- |
| ST1 | Every exported schema/parser/interpreter function has an example test and a fast-check property test. |
| ST2 | Parsing any string, including empty, emoji, mixed scripts, 50,000 characters and 600-character boundaries, never throws. |
| ST3 | A valid stack has no duplicate card/table/field ids, valid targets, valid page numbers, bounded collections and an exit from every card. |
| ST4 | A script over 600 characters or with a forbidden command is rejected with a position. |
| ST5 | Parse/validate never performs I/O, clock reads or randomness. |
| ST6 | `run` is deterministic for the same stack, state and event. |
| ST7 | `run` never throws for arbitrary event values and always returns state plus effects or a clean error. |
| ST8 | No run produces more than 200 steps; an over-limit script returns an error effect/state. |
| ST9 | Lookup effects contain only organization-scoped table, column, variable and secret-marker metadata, never row data or plaintext PINs. |
| ST10 | A valid stack's cards can be converted to Stage 1 blocks without exceeding card limits. |

## Public API

- `stackSchema`: Zod schema for untrusted stack JSON.
- `validateStack(stack)`: diagnostics for targets, limits and exits.
- `parseCardScript(source)`: AST or diagnostics.
- `run(stack, state, event)`: pure interpreter result.
- `cardBlocks(stack, cardId)`: returns the card's Stage 1 blocks.

## AST and execution

The implementation supports the safe line-oriented subset: `go to card`, `go to page`, `set`, `add`, `show message`, `clear fields`, `submit form`, `lookup`, bounded `if`/`else`/`end if`, and bounded `for each ... limit N` (N <= 20). Expressions support text, numbers, variables, row columns, comparisons, boolean `and`/`or`/`not`, numeric `+`/`-`, and text concatenation with `&`. Unknown text and malformed blocks are rejected. Loops only iterate values already present in interpreter state; they never access tables or perform I/O.

Additional correctness properties:

| Id | Property |
| --- | --- |
| P-CS1 | Expression parsing and evaluation are deterministic and never execute code or access external data. |
| P-CS2 | Conditional branches execute only the selected branch. |
| P-CS3 | Submit emits a copied field payload and never mutates input state. |
| P-CS4 | Iteration executes at most the declared limit and never more than 20 items. |
| P-CS5 | Unterminated or unexpected control-flow delimiters return diagnostics. |
| P-CS6 | Nested execution remains bounded by 200 steps. |

Lookup is an effect:

```ts
{ type: "lookup", table: "results", conditions: [{ column: "student_id", variable: "sid", secret: false }, { column: "pin_hash", variable: "pin", secret: true }], into: "row" }
```

No interpreter capability can access a database. The Convex effect runner owns organization and PIN verification.
