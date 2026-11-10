// Page range allocation (publisher-dashboard D1). Convex mutations are serializable,
// so calling this inside one mutation never hands out overlapping ranges.
import { PAGE_MAX } from "./constants";

/** 100-199 are reserved for the platform (index, help, directory). */
export const ALLOCATION_START = 200;

export type Range = readonly [start: number, end: number];

/** First-fit allocation of `size` consecutive numbers that overlap none of `taken`. */
export function allocateRange(taken: readonly Range[], size: number): [number, number] | null {
  if (!Number.isInteger(size) || size < 1) return null;
  const sorted = [...taken].sort((a, b) => a[0] - b[0]);
  let start = ALLOCATION_START;
  for (const [s, e] of sorted) {
    if (e < start) continue;
    if (s - start >= size) break;
    start = Math.max(start, e + 1);
  }
  const end = start + size - 1;
  return end <= PAGE_MAX ? [start, end] : null;
}

export function rangesOverlap(a: Range, b: Range): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}
