import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { isValidPageNumber, isInRange } from "../src/page-number";
import { PAGE_MAX, PAGE_MIN } from "../src/constants";

const RUNS = Number(process.env.FC_RUNS ?? 1000);

describe("page numbers", () => {
  // P12: Page numbers outside 100 to 899 are always rejected by the validator.
  it("P12: rejects every number outside 100..899", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ max: PAGE_MIN - 1 }),
          fc.integer({ min: PAGE_MAX + 1 }),
          fc.double({ noNaN: false }).filter((n) => !Number.isInteger(n)),
        ),
        (n) => !isValidPageNumber(n),
      ),
      { numRuns: RUNS },
    );
  });

  it("P12: accepts every integer inside 100..899", () => {
    fc.assert(
      fc.property(fc.integer({ min: PAGE_MIN, max: PAGE_MAX }), (n) => isValidPageNumber(n)),
      { numRuns: RUNS },
    );
  });

  it("isInRange: only accepts valid numbers inside the organization range", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: PAGE_MIN, max: PAGE_MAX }),
        fc.integer({ min: PAGE_MIN, max: PAGE_MAX }),
        fc.integer({ min: 0, max: 1000 }),
        (a, b, n) => {
          const start = Math.min(a, b);
          const end = Math.max(a, b);
          const expected = isValidPageNumber(n) && n >= start && n <= end;
          return isInRange(n, [start, end]) === expected;
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("examples", () => {
    expect(isValidPageNumber(100)).toBe(true);
    expect(isValidPageNumber(899)).toBe(true);
    expect(isValidPageNumber(99)).toBe(false);
    expect(isValidPageNumber(900)).toBe(false);
    expect(isValidPageNumber(412.5)).toBe(false);
    expect(isInRange(412, [400, 449])).toBe(true);
    expect(isInRange(450, [400, 449])).toBe(false);
  });
});
