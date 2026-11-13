import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { render } from "../src/render";
import { blocksSchema } from "../src/schema";
import {
  MOSAIC_MAX_COLS,
  MOSAIC_MAX_ROWS,
  bitmapToMosaic,
  imageToMosaic,
  isSextantCode,
  mosaicGridSize,
  mosaicToBitmap,
  sextantChar,
  suggestInvert,
  type GrayImage,
} from "../src/mosaic";
import { CTX, RUNS } from "./arbitraries";

const pixel = fc.oneof({ weight: 8, arbitrary: fc.integer({ min: 0, max: 255 }) }, fc.constantFrom(NaN, Infinity, -Infinity, -5, 300, 1e12, 0.5));
const smallImage: fc.Arbitrary<GrayImage> = fc
  .tuple(fc.integer({ min: 1, max: 40 }), fc.integer({ min: 1, max: 40 }))
  .chain(([width, height]) => fc.array(pixel, { minLength: width * height, maxLength: width * height }).map((data) => ({ width, height, data })));
const cleanImage: fc.Arbitrary<GrayImage> = fc
  .tuple(fc.integer({ min: 1, max: 40 }), fc.integer({ min: 1, max: 40 }))
  .chain(([width, height]) => fc.array(fc.integer({ min: 0, max: 255 }), { minLength: width * height, maxLength: width * height }).map((data) => ({ width, height, data })));
// Hostile shapes: empty, thin, NaN sizes, data shorter than the size says.
const oddImage: fc.Arbitrary<GrayImage> = fc.record({
  width: fc.oneof(fc.integer({ min: -3, max: 3000 }), fc.constantFrom(NaN, Infinity, 0.5, 1e9)),
  height: fc.oneof(fc.integer({ min: -3, max: 3000 }), fc.constantFrom(NaN, Infinity, 0.5, 1e9)),
  data: fc.array(pixel, { maxLength: 200 }),
});

function checkRows(rows: string[]) {
  expect(rows.length).toBeLessThanOrEqual(MOSAIC_MAX_ROWS);
  for (const r of rows) {
    expect(r.length).toBeLessThanOrEqual(MOSAIC_MAX_COLS);
    for (let i = 0; i < r.length; i++) expect(isSextantCode(r.charCodeAt(i))).toBe(true);
  }
}

const bitmap = fc
  .tuple(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 1, max: 22 }))
  .chain(([cols, rows]) => fc.array(fc.array(fc.boolean(), { minLength: cols * 2, maxLength: cols * 2 }), { minLength: rows * 3, maxLength: rows * 3 }));

describe("mosaic logo tool (mosaic-logo-tool M1-M7)", () => {
  it("M1: never throws and always returns a valid, small mosaic, even for hostile images", () => {
    fc.assert(
      fc.property(fc.oneof(smallImage, oddImage), fc.record({ maxCols: fc.option(fc.integer({ min: -5, max: 80 }), { nil: undefined }), maxRows: fc.option(fc.integer({ min: -5, max: 80 }), { nil: undefined }), threshold: fc.oneof(fc.constant("auto" as const), fc.double({ noNaN: false }), fc.integer({ min: 0, max: 255 })), invert: fc.boolean(), dither: fc.boolean() }), (img, opts) => {
        const r = imageToMosaic(img, opts);
        checkRows(r.rows);
        expect(r.rows.length).toBe(r.rowCount);
        expect(Number.isFinite(r.threshold)).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it("M1 example: 0 x 0, 5 million pixels and a short data array give an empty or blank result, not an error", () => {
    expect(imageToMosaic({ width: 0, height: 0, data: [] }).rows).toEqual([]);
    expect(imageToMosaic({ width: 3000, height: 3000, data: [] }).rows).toEqual([]);
    expect(imageToMosaic({ width: 10, height: 10, data: [255, 255] }).rows.length).toBeGreaterThan(0);
  });

  it("M2: packing then unpacking a dot grid gives the same grid", () => {
    fc.assert(
      fc.property(bitmap, (bits) => {
        expect(mosaicToBitmap(bitmapToMosaic(bits))).toEqual(bits);
      }),
      { numRuns: RUNS },
    );
  });

  it("M2 example: the six dots and the characters the screen draws", () => {
    expect(sextantChar([false, false, false, false, false, false])).toBe(" ");
    expect(sextantChar([true, true, true, true, true, true])).toBe("\x7f");
    expect(sextantChar([true, false, false, false, false, false])).toBe("!");
    expect(sextantChar([false, false, false, false, false, true])).toBe("`");
  });

  it("M3: invert turns every dot into its opposite (no dithering)", () => {
    fc.assert(
      fc.property(cleanImage, fc.integer({ min: 0, max: 255 }), (img, threshold) => {
        const a = mosaicToBitmap(imageToMosaic(img, { threshold }).rows);
        const b = mosaicToBitmap(imageToMosaic(img, { threshold, invert: true }).rows);
        expect(b).toEqual(a.map((row) => row.map((d) => !d)));
      }),
      { numRuns: RUNS },
    );
  });

  it("M4: a black picture lights nothing, a white one lights everything; invert swaps them", () => {
    for (const [w, h] of [[1, 1], [8, 3], [40, 40], [200, 17]] as const) {
      const black = { width: w, height: h, data: new Array<number>(w * h).fill(0) };
      const white = { width: w, height: h, data: new Array<number>(w * h).fill(255) };
      const b = imageToMosaic(black);
      const wh = imageToMosaic(white);
      expect(b.lit).toBe(0);
      expect(wh.lit).toBe(wh.cols * wh.rowCount * 6);
      expect(imageToMosaic(black, { invert: true }).lit).toBe(b.cols * b.rowCount * 6);
      expect(imageToMosaic(white, { invert: true }).lit).toBe(0);
    }
  });

  it("M5: a higher threshold never lights more dots (no dithering)", () => {
    fc.assert(
      fc.property(cleanImage, fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), (img, a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(imageToMosaic(img, { threshold: hi }).lit).toBeLessThanOrEqual(imageToMosaic(img, { threshold: lo }).lit);
      }),
      { numRuns: RUNS },
    );
  });

  it("M6: the rows pass the block schema and render without a trimmed warning", () => {
    fc.assert(
      fc.property(cleanImage, fc.boolean(), fc.boolean(), (img, invert, dither) => {
        const { rows } = imageToMosaic(img, { invert, dither });
        const blocks = [{ type: "mosaic" as const, rows }];
        expect(blocksSchema.safeParse(blocks).success).toBe(true);
        const result = render(blocks, CTX);
        expect(result.warnings.some((w) => w.code === "mosaic-trimmed")).toBe(false);
      }),
      { numRuns: Math.min(RUNS, 300) },
    );
  });

  it("M7: the grid fits the limits and follows the picture's shape", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4000 }), fc.integer({ min: 1, max: 4000 }), fc.integer({ min: 1, max: 40 }), fc.integer({ min: 1, max: 22 }), (w, h, maxCols, maxRows) => {
        const g = mosaicGridSize(w, h, maxCols, maxRows);
        expect(g.cols).toBeGreaterThanOrEqual(1);
        expect(g.rows).toBeGreaterThanOrEqual(1);
        expect(g.cols).toBeLessThanOrEqual(maxCols);
        expect(g.rows).toBeLessThanOrEqual(maxRows);
        // Turning the picture on its side never makes it relatively wider.
        const t = mosaicGridSize(h, w, maxCols, maxRows);
        if (w > h) expect(g.cols / g.rows).toBeGreaterThanOrEqual(t.cols / t.rows);
      }),
      { numRuns: RUNS },
    );
  });

  it("regression: the all-dots-lit character (0x7f) is kept by the layout, not blanked as 'trimmed' (found by M6)", () => {
    const full = "\x7f".repeat(39);
    const r = render([{ type: "mosaic", rows: [full, full] }], CTX);
    expect(r.warnings.some((w) => w.code === "mosaic-trimmed")).toBe(false);
    expect(JSON.stringify(r.pages[0]?.rows)).toContain("\x7f");
  });

  it("example: a white disc on black comes out as a rounded shape, and suggestInvert spots a logo on white", () => {
    const size = 60;
    const disc = Array.from({ length: size * size }, (_, i) => {
      const x = (i % size) - 30;
      const y = Math.floor(i / size) - 30;
      return x * x + y * y < 22 * 22 ? 255 : 0;
    });
    const r = imageToMosaic({ width: size, height: size, data: disc }, { maxCols: 30 });
    expect(r.lit).toBeGreaterThan(50);
    expect(r.rows[0]?.trim()).toBe(r.rows[0]?.trim().replace(/[^ -?`-\x7f]/g, ""));
    expect(suggestInvert({ width: size, height: size, data: disc })).toBe(false);
    expect(suggestInvert({ width: size, height: size, data: disc.map((v) => 255 - v) })).toBe(true);
  });
});
