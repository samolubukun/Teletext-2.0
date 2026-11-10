// Reader page-number entry as a pure reducer (reader-app R1-R4) and sub-page stepping (R5).
import { isValidPageNumber } from "./page-number";

export type EntryState = { digits: string };
export type EntryKey = { type: "digit"; digit: string } | { type: "backspace" } | { type: "clear" };
export type EntryResult = {
  state: EntryState;
  /** Set exactly when a third digit completes a valid page number. */
  go?: number;
  /** Set when a third digit completes a number outside 100-899. */
  invalid?: number;
};

export const EMPTY_ENTRY: EntryState = { digits: "" };

export function entry(state: EntryState, key: EntryKey): EntryResult {
  const digits = state.digits.slice(0, 2);
  switch (key.type) {
    case "clear":
      return { state: EMPTY_ENTRY };
    case "backspace":
      return { state: { digits: digits.slice(0, -1) } };
    case "digit": {
      if (!/^[0-9]$/.test(key.digit)) return { state: { digits } };
      const next = digits + key.digit;
      if (next.length < 3) return { state: { digits: next } };
      const n = Number(next);
      return isValidPageNumber(n) ? { state: EMPTY_ENTRY, go: n } : { state: EMPTY_ENTRY, invalid: n };
    }
  }
}

/** Header display while typing: "P4__", "P41_". Empty when no digits are typed. */
export function entryLabel(state: EntryState): string {
  return state.digits ? `P${state.digits.padEnd(3, "_")}` : "";
}

/** Steps through sub-pages with wrap-around; the result is always within 1..total. */
export function stepSubpage(sub: number, total: number, delta: number): number {
  const t = Math.max(1, Math.floor(total));
  const current = Math.min(Math.max(1, Math.floor(sub) || 1), t);
  return ((((current - 1 + Math.trunc(delta)) % t) + t) % t) + 1;
}
