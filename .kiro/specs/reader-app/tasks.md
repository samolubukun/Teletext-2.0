# Implementation Plan: reader-app

- [x] 1. Entry reducer and its property tests (R1 to R4) in `packages/core/src/entry.ts`
- [x] 2. `TeletextScreen` component (own HTML/CSS renderer, colours, double height, flash, sextant mosaics)
- [x] 3. `GET /api/pages/[number]` with cache headers, 400 / 404 / 503 responses, not-found page
- [x] 4. Sub-page stepping (R5), history back, short links `/p/412` and `/p/412/2`
- [ ] 4a. Move history into a pure module and add property R6
- [x] 5. Fastext keys, clicks, on-screen keypad
- [x] 6. Settings store with persistence, Classic / Clean / Ticker modes
- [ ] 6a. Settings round-trip test (R7)
- [x] 7. Accessibility layer: hidden text version, live region, focus styles, reduced motion
- [x] 8. Safari and iOS: avoided by design (no SVG mosaics); still to verify on a real iPhone
- [x] 9. Page 100 index (one screen), keyword search, page-number search
- [x] 10. Live page refresh, live header clock
- [x] 11. Playwright: type 412, see the page, use fastext, go offline (tests/e2e/reader.spec.ts, desktop + Pixel 7)
- [ ] 12. Real-device test (low-end Android and iPhone)
