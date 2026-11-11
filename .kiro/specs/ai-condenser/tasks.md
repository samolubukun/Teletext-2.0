# Implementation Plan: ai-condenser

- [x] 1. Zod schemas and the extractive fallback summarizer
- [x] 2. Value extractor and normalizer (A3, A4)
- [x] 3. Fact guard: matched / unmatched / dropped (A1, A2, A5)
- [x] 4. Prompt (condense-v2), API route with per-plan rate limit, retry once, model fallback
- [x] 5. Editor integration: highlights, source sentence, dropped facts with "Add back", confirmation checkbox
- [x] 6. Live Gemini test (opt-in: `GEMINI_LIVE=1`)
- [ ] 7. A6: property test that any draft passes the schema and renders to valid pages
- [ ] 8. Evaluation harness: 20 sources with must-keep facts, scored per prompt version
- [ ] 9. Playwright: paste text, condense, see a highlighted value, confirm, publish
