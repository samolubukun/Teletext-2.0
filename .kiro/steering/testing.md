# Testing rules

- Every exported pure function in packages/core, packages/ai and packages/stacks needs a
  property-based test (fast-check) AND at least one example test.
- Properties are written in each spec's design.md BEFORE implementation. Name tests after the
  property id, for example `it("P12: rejects every number outside 100..899")`.
- Generators must be aggressive: empty strings, 50,000 characters, emoji, mixed scripts,
  200-character words, tables with 12 columns, numbers at boundaries.
- When a property fails, keep the shrunk input as a permanent regression test and log it in
  docs/kiro-notes.md (it is write-up material).
- Run counts come from `FC_RUNS` (default 1,000 while developing, 10,000 before submission).
- Golden fixtures live in packages/core/fixtures/. Update a snapshot only after reading the diff.
- Convex functions are tested with `convex-test` + Vitest (edge-runtime environment), including
  the permission scenarios: two organizations; owner, editor and viewer in org A; one outsider.
- End-to-end: Playwright covers the demo path. Accessibility: @axe-core/playwright on reader and dashboard.
- Never delete or weaken a failing test to make it pass. Fix the code or the spec.

## Commands
- All tests: `npm test` (root). Core only: `npm test --workspace @teletext/core`.
- Type check: `npm run typecheck`. Lint: `npm run lint`.
- On Windows PowerShell, pipe test output through `| Out-String` when running from an agent.
