import { PAGE_MAX, PAGE_MIN } from "./constants";

/** A page number is a whole number from 100 to 899 (three digits, 9xx reserved). */
export function isValidPageNumber(n: number): boolean {
  return Number.isInteger(n) && n >= PAGE_MIN && n <= PAGE_MAX;
}

/** True when n is a valid page number inside the inclusive organization range. */
export function isInRange(n: number, range: readonly [start: number, end: number]): boolean {
  const [start, end] = range;
  return isValidPageNumber(n) && n >= start && n <= end;
}
