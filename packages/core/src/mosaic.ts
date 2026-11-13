// Picture to teletext mosaic. Pure: the caller decodes the picture and passes brightness values.
// Each screen cell holds 2 x 3 dots ("sextant"). Character = 0x20 + dots, skipping 0x40 (see TeletextScreen).
//   dot bits: top-left 0x01, top-right 0x02, mid-left 0x04, mid-right 0x08, bottom-left 0x10, bottom-right 0x40

/** 39, not 40: the first cell of a mosaic row holds the colour code. */
export const MOSAIC_MAX_COLS = 39;
export const MOSAIC_MAX_ROWS = 22;
const MAX_PIXELS = 4_000_000;
/** A dot is about 3/4 as wide as it is tall on a teletext screen (cell 1:2, 2 dots across, 3 down). */
const DOT_ASPECT = 0.75;

export type GrayImage = { width: number; height: number; data: ArrayLike<number> };

export type MosaicOptions = {
  /** Most columns to use, 1 to 39. Default 36. */
  maxCols?: number;
  /** Most rows to use, 1 to 22. Default 22. */
  maxRows?: number;
  /** 0 to 255, or "auto" (Otsu). Dots at or above it are lit. */
  threshold?: number | "auto";
  /** Light dots where the image is DARK (for a dark logo on a white background). */
  invert?: boolean;
  /** Floyd-Steinberg error diffusion: keeps shading, costs sharp edges. */
  dither?: boolean;
};

export type MosaicResult = {
  rows: string[];
  cols: number;
  rowCount: number;
  threshold: number;
  /** Number of lit dots, for the preview and for tests. */
  lit: number;
};

const BITS = [0x01, 0x02, 0x04, 0x08, 0x10, 0x40] as const;

/** Six dots in reading order (TL, TR, ML, MR, BL, BR) to one character. */
export function sextantChar(dots: readonly boolean[]): string {
  let code = 0x20;
  for (let i = 0; i < 6; i++) if (dots[i]) code |= BITS[i] as number;
  return String.fromCharCode(code);
}

/** True for the characters a mosaic row may use. */
export function isSextantCode(code: number): boolean {
  return (code >= 0x20 && code <= 0x3f) || (code >= 0x60 && code <= 0x7f);
}

/** Packs a dot grid (rows of booleans, size a multiple of 2 x 3) into mosaic rows. Missing dots count as off. */
export function bitmapToMosaic(bits: readonly (readonly boolean[])[]): string[] {
  const height = bits.length;
  const width = bits.reduce((m, r) => Math.max(m, r.length), 0);
  const rows: string[] = [];
  for (let y = 0; y < height; y += 3) {
    let row = "";
    for (let x = 0; x < width; x += 2) {
      const dot = (dx: number, dy: number) => bits[y + dy]?.[x + dx] === true;
      row += sextantChar([dot(0, 0), dot(1, 0), dot(0, 1), dot(1, 1), dot(0, 2), dot(1, 2)]);
    }
    rows.push(row);
  }
  return rows;
}

/** The dot grid a set of mosaic rows shows. Characters that are not sextant codes show as blank cells. */
export function mosaicToBitmap(rows: readonly string[]): boolean[][] {
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const out: boolean[][] = Array.from({ length: rows.length * 3 }, () => new Array<boolean>(width * 2).fill(false));
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const code = row.charCodeAt(c);
      if (!isSextantCode(code)) continue;
      BITS.forEach((bit, i) => {
        if (code & bit) (out[r * 3 + Math.floor(i / 2)] as boolean[])[c * 2 + (i % 2)] = true;
      });
    }
  });
  return out;
}

function level(v: number | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(255, Math.max(0, v)) : 0;
}

/** Otsu's method: the threshold that best separates dark from bright. */
export function otsuThreshold(values: ArrayLike<number>): number {
  const hist = new Array<number>(256).fill(0);
  const n = values.length;
  for (let i = 0; i < n; i++) hist[Math.round(level(values[i]))]!++;
  let total = 0;
  for (let i = 0; i < 256; i++) total += i * (hist[i] as number);
  let wB = 0;
  let sumB = 0;
  let best = 128;
  let bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t] as number;
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += t * (hist[t] as number);
    const mB = sumB / wB;
    const mF = (total - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) {
      bestVar = between;
      best = t + 1;
    }
  }
  return Math.min(255, best);
}

/** True when the picture is mostly bright (a logo on white): the caller should default to invert. */
export function suggestInvert(img: GrayImage): boolean {
  const w = Math.floor(img.width);
  const h = Math.floor(img.height);
  if (!(w > 0 && h > 0) || w * h > MAX_PIXELS) return false;
  // The border says what the background is.
  let sum = 0;
  let count = 0;
  const at = (x: number, y: number) => level(img.data[y * w + x]);
  for (let x = 0; x < w; x++) {
    sum += at(x, 0) + at(x, h - 1);
    count += 2;
  }
  for (let y = 1; y < h - 1; y++) {
    sum += at(0, y) + at(w - 1, y);
    count += 2;
  }
  return count > 0 && sum / count >= 128;
}

/** Dot grid size for an image: keeps the shape, fits 2*maxCols x 3*maxRows dots. */
export function mosaicGridSize(width: number, height: number, maxCols: number, maxRows: number): { cols: number; rows: number } {
  const a = width / height;
  const maxW = 2 * maxCols;
  const maxH = 3 * maxRows;
  let h = Math.min(maxH, Math.floor((maxW * DOT_ASPECT) / a));
  h = Math.max(3, h);
  let w = Math.max(2, Math.round((h * a) / DOT_ASPECT));
  if (w > maxW) {
    w = maxW;
    h = Math.max(3, Math.min(maxH, Math.round((w * DOT_ASPECT) / a)));
  }
  return { cols: Math.min(maxCols, Math.ceil(w / 2)), rows: Math.min(maxRows, Math.ceil(h / 3)) };
}

function clampInt(v: number | undefined, lo: number, hi: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : fallback;
}

const EMPTY: MosaicResult = { rows: [], cols: 0, rowCount: 0, threshold: 128, lit: 0 };

/** Brightness grid to mosaic rows. Never throws; unusable input gives an empty result. */
export function imageToMosaic(img: GrayImage, options: MosaicOptions = {}): MosaicResult {
  const w = Math.floor(img.width);
  const h = Math.floor(img.height);
  if (!(w > 0 && h > 0) || w * h > MAX_PIXELS) return { ...EMPTY };
  const maxCols = clampInt(options.maxCols, 1, MOSAIC_MAX_COLS, 36);
  const maxRows = clampInt(options.maxRows, 1, MOSAIC_MAX_ROWS, MOSAIC_MAX_ROWS);
  const { cols, rows } = mosaicGridSize(w, h, maxCols, maxRows);
  const W = cols * 2;
  const H = rows * 3;

  // Area average: each dot is the mean of the source pixels it covers.
  const gray = new Float64Array(W * H);
  for (let ty = 0; ty < H; ty++) {
    const y0 = Math.min(h - 1, Math.floor((ty * h) / H));
    const y1 = Math.min(h, Math.max(y0 + 1, Math.ceil(((ty + 1) * h) / H)));
    for (let tx = 0; tx < W; tx++) {
      const x0 = Math.min(w - 1, Math.floor((tx * w) / W));
      const x1 = Math.min(w, Math.max(x0 + 1, Math.ceil(((tx + 1) * w) / W)));
      let sum = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) sum += level(img.data[y * w + x]);
      gray[ty * W + tx] = sum / ((y1 - y0) * (x1 - x0));
    }
  }

  const threshold =
    typeof options.threshold === "number" && Number.isFinite(options.threshold) ? Math.min(255, Math.max(0, options.threshold)) : otsuThreshold(gray);
  const invert = options.invert === true;
  const lit: boolean[][] = Array.from({ length: H }, () => new Array<boolean>(W).fill(false));
  let count = 0;

  if (options.dither === true) {
    const work = Float64Array.from(gray);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const old = work[y * W + x] as number;
        const on = old >= threshold;
        const err = old - (on ? 255 : 0);
        if (x + 1 < W) work[y * W + x + 1] = (work[y * W + x + 1] as number) + (err * 7) / 16;
        if (y + 1 < H) {
          if (x > 0) work[(y + 1) * W + x - 1] = (work[(y + 1) * W + x - 1] as number) + (err * 3) / 16;
          work[(y + 1) * W + x] = (work[(y + 1) * W + x] as number) + (err * 5) / 16;
          if (x + 1 < W) work[(y + 1) * W + x + 1] = (work[(y + 1) * W + x + 1] as number) + err / 16;
        }
        (lit[y] as boolean[])[x] = on !== invert;
      }
    }
  } else {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) (lit[y] as boolean[])[x] = (gray[y * W + x] as number) >= threshold !== invert;
  }
  for (const r of lit) for (const d of r) if (d) count++;
  return { rows: bitmapToMosaic(lit), cols, rowCount: rows, threshold, lit: count };
}
