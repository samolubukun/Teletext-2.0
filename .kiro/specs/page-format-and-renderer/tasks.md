# Implementation Plan: page-format-and-renderer

Each task ends with the requirements it satisfies and the tests that must pass. Keep tasks small
so Kiro can finish one at a time. Run tests with `npm test --workspace @teletext/core`.

- [x] 1. Set up the package
  - Create `packages/core` with strict TypeScript, Vitest and fast-check
  - Add the core types from the design (`src/types.ts`) and grid constants (`src/constants.ts`)
  - Add `isValidPageNumber` and `isInRange` with the P12 property test
  - _Requirements: all, 6.3_

- [ ] 2. Normalizer
  - Implement `normalize` with a replacement table, emoji removal, base-letter mapping and whitespace collapse
  - Return a warning for every removed or simplified character
  - Write P6 and one unit test per replacement
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 3. Style guide
  - Create the `StyleGuide` data mirroring `.kiro/steering/teletext-style.md`
  - Create the allowed color-pair list and an `isAllowedPair(fg, bg)` helper
  - _Requirements: 2.6, 6.2_

- [ ] 4. Tokenizer and wrapper
  - Turn blocks into lines of tokens: greedy wrap, hyphen splitting, number-unit gluing, hanging indents
  - Width is measured in tokens, counting control codes
  - Write P1 and P3
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2_

- [ ] 5. Tables
  - Column width allocation, right-aligned numbers, stacked key-value fallback with a warning
  - Unit tests plus P1 over random tables
  - _Requirements: 3.3, 3.4_

- [ ] 6. Double height and headings
  - Two-row headings with the row below forced empty
  - Write P9
  - _Requirements: 2.5_

- [ ] 7. Paginator
  - Fill 22 body rows, keep-together rules, repeated table headers, `n/total` and continued markers
  - Write P2, P4, P8, P10, P11
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 8. Decorator
  - Header row (page number, publisher, date and time from `now`), fastext bar with default links, label shortening
  - Write P15
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 9. Validator
  - All invariants, contrast, page-number range (reuse `isInRange`), plain-language messages with fixes
  - Write P7 (P12 already exists)
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 10. Render facade
  - Wire the pipeline into `render` with deterministic `now`, and the empty-input page
  - Write P5 and P14
  - _Requirements: 4.6, 7.1, 7.5_

- [ ] 11. Display adapter
  - `toDisplayRows` for `@techandsoftware/teletext`, including a test that the output fits the 40-wide screen
  - _Requirements: 7.2_

- [ ] 12. Golden fixtures
  - Add the six fixtures (school notice, results table, clinic timetable, transport alert, FAQ, long article) with snapshots
  - _Requirements: all (regression safety)_

- [ ] 13. Size and speed checks
  - Pages serialize under 5 KB; 10,000 characters render in under 50 ms
  - Write P13
  - _Requirements: 7.3, 7.4_

- [ ] 14. Hook and notes
  - Confirm the "Core tests" and "Boundary guard" hooks run on save in `packages/core`
  - Log in `docs/kiro-notes.md` what Kiro got right and wrong; save a screenshot of the first property test that failed and how it was fixed
  - _Requirements: none (write-up evidence)_

## Definition of done

- [ ] All 15 properties pass with at least 1,000 runs each (`FC_RUNS=10000` before submission)
- [ ] All golden fixtures match
- [ ] No `any` types, strict mode passes
- [ ] Every warning has a plain-language message and a suggested fix
- [ ] Notes and screenshots saved for the write-up
- [ ] **Gate A:** 10,000 random inputs all produce valid pages
