# Design: mosaic logo tool (Stage 1, editor)

A publisher picks a logo or picture. The browser shrinks it and reads brightness only; `packages/core` turns that grid of brightness values into the rows of a `mosaic` block. The result uses the sextant characters the screen already draws (each cell is 2 x 3 dots). This replaces the GPL `image-to-sextants` package named in the plan with original MIT code.

## Decisions

1. Core takes a plain grayscale grid (`width`, `height`, values 0 to 255). No canvas, no DOM, so it is pure and testable. The browser does the decoding with a canvas and sends only luminance.
2. One colour per mosaic block (the style guide's mosaic colour). Dots are lit where the image is bright, because the screen background is black. "Invert" is for dark logos on white.
3. Output size: at most 39 columns (the first cell of the row holds the colour code) and 22 rows. The aspect ratio is kept using the dot shape of a teletext cell (a dot is about 3/4 as wide as it is tall).
4. Threshold is automatic (Otsu) unless the publisher moves the slider. Optional Floyd-Steinberg dithering keeps shading.
5. Input is untrusted: any size, NaN, out-of-range numbers, short arrays. Core never throws and refuses images over 4,000,000 pixels with an empty result.
6. Upload limits in the UI: PNG, JPEG, WebP or GIF only (no SVG), 2 MB, read locally, never uploaded to a server.

## Correctness properties (written before the code)

| Id | Property |
| --- | --- |
| M1 | For any image, including 0 x 0, NaN, huge and out-of-range values, `imageToMosaic` never throws, returns at most 22 rows of at most 39 characters, and every character is a valid sextant code (0x20 to 0x3F or 0x60 to 0x7F) |
| M2 | Round trip: `mosaicToBitmap(bitmapToMosaic(bits))` equals `bits` for any bitmap whose size is a multiple of 2 x 3 |
| M3 | Invert is exact: inverting turns every lit dot off and every dark dot on (without dithering) |
| M4 | A blank image gives no lit dots (or all lit when inverted); a solid bright image the opposite |
| M5 | Raising the threshold never lights more dots (without dithering) |
| M6 | The rows always pass `blocksSchema`, and `render()` never reports `mosaic-trimmed` for them |
| M7 | The result keeps the image's shape: the dot grid is within the limits, and a wider image never produces fewer columns than a taller one of the same area |
