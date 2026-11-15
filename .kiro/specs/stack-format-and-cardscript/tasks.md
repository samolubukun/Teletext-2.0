# Tasks: Stack format and CardScript

- [x] 1. Create pure `packages/stacks` package and test configuration.
- [x] 2. Add stack Zod schema and diagnostics.
- [x] 3. Add CardScript tokenizer/parser for the safe subset.
- [x] 4. Add stack validation for targets, limits, tables and exits.
- [x] 5. Add pure interpreter and typed effects with a 200-step cap.
- [x] 6. Add aggressive example and fast-check tests for ST1-ST10 and CardScript control flow, expressions, bounded loops, and submit effects.
- [x] 7. Add Convex stack tables and org-scoped permissions behind `STACKS_ENABLED`.
- [x] 8. Add server-side lookup table upload with hashed PINs and rate limiting.
- [x] 9. Add lookup reader route and input mode.
- [x] 10. Add dashboard stack editor, JSON preview, CSV lookup import, publisher inbox, card map, and Play mode.
- [ ] 11. Add AI Stack generator and Playwright live coverage.

- [x] 11. Add AI Stack generator and Playwright live coverage.
  - Generator validates with `@teletext/stacks`, repairs once, and falls back to an unpublished blank template.
  - Gemini receives descriptions plus template/column metadata only. It never receives lookup rows, PINs, or submissions.
  - Route is server-only, auth/rate-limited through Convex, and disabled unless `NEXT_PUBLIC_STACKS_ENABLED=true`.
  - Offline generator properties and examples live in `packages/ai/test/stack.test.ts`. Live lookup coverage remains deployment-gated by `E2E_BASE_URL` and `E2E_STACK_ENABLED`.
