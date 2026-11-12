# Implementation Plan: data-connectors

- [x] 1. Properties C1-C9 written in design.md before the code
- [x] 2. Pure parsing and URL checks in `packages/core/src/sources.ts` with property tests C1-C6
- [x] 3. Convex: `dataSources` table; `link`, `unlink`, `syncNow`, `forPage`; internal `sync` action, `applySync`, `syncDue`; 15-minute cron
- [x] 4. convex-test suite for C7-C9 with a stubbed network (`apps/web/tests/convex/dataSources.test.ts`)
- [x] 5. Dashboard card on the page editor
- [ ] 6. Try it against one real public Google Sheet and one real feed after deploy, and write the result in docs/kiro-notes.md
