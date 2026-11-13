# Implementation Plan: mosaic-logo-tool

- [x] 1. Properties M1-M7 written in design.md before the code
- [x] 2. Pure converter in `packages/core/src/mosaic.ts` (grid size, area average, Otsu, invert, dither, sextant packing)
- [x] 3. Property tests M1-M7 plus examples (`packages/core/test/mosaic.properties.test.ts`)
- [x] 4. Layout fix: keep the all-dots character 0x7f (found by M6)
- [x] 5. Editor: "Make mosaic art from a picture" inside the mosaic block (PNG, JPEG, WebP, GIF, 2 MB, decoded in the browser)
- [ ] 6. Try it in the browser with a real logo and a photo, and note the result in docs/kiro-notes.md
