import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { expiryValid, luhnValid } from "../../src/lib/fakeCard";

const RUNS = Number(process.env.FC_RUNS ?? 1000);

/** Appends the Luhn check digit to a payload of digits. */
function withCheckDigit(payload: string): string {
  for (let c = 0; c <= 9; c++) if (luhnValid(payload + c)) return payload + c;
  throw new Error("no check digit");
}

describe("demo card checks", () => {
  it("accepts the standard test card and rejects a typo", () => {
    expect(luhnValid("4242 4242 4242 4242")).toBe(true);
    expect(luhnValid("4242 4242 4242 4243")).toBe(false);
    expect(luhnValid("")).toBe(false);
  });

  it("every payload has exactly one valid check digit", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[1-9][0-9]{14}$/), (payload) => {
        const full = withCheckDigit(payload);
        expect(luhnValid(full)).toBe(true);
        const valid = [...Array(10).keys()].filter((c) => luhnValid(payload + c));
        expect(valid).toHaveLength(1);
      }),
      { numRuns: RUNS },
    );
  });

  it("never throws on any text, however long", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string({ maxLength: 100 }), fc.string({ unit: "grapheme", maxLength: 50 }), fc.constant("9".repeat(50_000))), (s) => {
        expect(typeof luhnValid(s)).toBe("boolean");
        expect(typeof expiryValid(s, 2026, 11)).toBe("boolean");
      }),
      { numRuns: RUNS },
    );
  });

  it("expiry: this month is fine, last month is not, month 13 is not", () => {
    expect(expiryValid("11/26", 2026, 11)).toBe(true);
    expect(expiryValid("10/26", 2026, 11)).toBe(false);
    expect(expiryValid("12/30", 2026, 11)).toBe(true);
    expect(expiryValid("13/30", 2026, 11)).toBe(false);
    expect(expiryValid("1/30", 2026, 11)).toBe(false);
  });
});
