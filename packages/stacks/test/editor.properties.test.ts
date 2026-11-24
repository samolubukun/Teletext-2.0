import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { blankCard, buildScript, detectAction, parseCardScript, resolveLookupCredentials, sanitizeMessage, stackSchema, uniqueId, validateStack, type ButtonAction, type Stack } from "../src";

const RUNS = Number(process.env.FC_RUNS ?? 1000);
const name = fc.stringMatching(/^[a-z][a-z0-9_-]{0,39}$/);
const variable = fc.stringMatching(/^[a-z][a-z0-9_]{0,39}$/);
const hostile = fc.oneof(fc.string({ maxLength: 5000 }), fc.string({ unit: "grapheme", maxLength: 500 }), fc.constantFrom("", "\"", "\\", "a\nb", "\u{1F642}"));
const action: fc.Arbitrary<ButtonAction> = fc.oneof(
  name.map((cardId) => ({ kind: "goto" as const, cardId })),
  name.map((formId) => ({ kind: "submit" as const, formId })),
  fc.record({ kind: fc.constant("lookup" as const), table: name, idColumn: name, idField: variable, pinField: variable }),
  hostile.map((text) => ({ kind: "message" as const, text: sanitizeMessage(text) })),
);

describe("Visual editor helpers", () => {
  it("P-ED1: every generated preset script parses and is detected as the same preset", () => {
    fc.assert(fc.property(action, (a) => {
      const script = buildScript(a);
      expect(parseCardScript(script).ok).toBe(true);
      expect(detectAction(script)).toEqual(a);
    }), { numRuns: RUNS });
  });
  it("P-ED1 example: preset scripts match the CardScript grammar", () => {
    expect(buildScript({ kind: "goto", cardId: "home" })).toBe("go to card home");
    expect(buildScript({ kind: "lookup", table: "results", idColumn: "student_id", idField: "sid", pinField: "pin" })).toBe("lookup results by student_id = sid and pin_hash = pin into row");
    expect(buildScript({ kind: "message", text: 'Say "hi"' })).toBe("show message \"Say 'hi'\"");
    expect(detectAction("add 1 to score")).toEqual({ kind: "custom", script: "add 1 to score" });
  });
  it("P-ED2: sanitized messages never contain quotes, backslashes or line breaks", () => {
    fc.assert(fc.property(hostile, (text) => {
      expect(sanitizeMessage(text)).not.toMatch(/["\\\r\n]/);
    }), { numRuns: RUNS });
  });
  it("P-ED3: uniqueId returns a valid id that is not taken", () => {
    fc.assert(fc.property(hostile, fc.array(name, { maxLength: 30 }), (base, taken) => {
      const id = uniqueId(base, taken);
      expect(id).toMatch(/^[a-z][a-z0-9_-]{0,39}$/);
      expect(taken).not.toContain(id);
    }), { numRuns: RUNS });
  });
  it("P-ED3 example: collisions get a numeric suffix", () => {
    expect(uniqueId("card", ["card", "card-2"])).toBe("card-3");
    expect(uniqueId("", [])).toBe("item");
  });
  it("P-ED4: a blank card always passes the stack schema and validation", () => {
    fc.assert(fc.property(fc.array(fc.record({ id: name, page: fc.integer({ min: 100, max: 899 }) }), { maxLength: 5 }), (existing) => {
      const unique = existing.filter((c, i) => existing.findIndex((x) => x.id === c.id) === i && existing.findIndex((x) => x.page === c.page) === i);
      const card = blankCard(unique, unique[0]?.id);
      expect(unique.some((c) => c.id === card.id)).toBe(false);
      expect(card.page).toBeGreaterThanOrEqual(100);
      expect(card.page).toBeLessThanOrEqual(899);
      const stack: Stack = { version: 1, id: "s", title: "S", template: "form", startCard: card.id, tables: {}, cards: [card] };
      const withBack = card.buttons[0]?.script.startsWith("go to") ? { ...stack, cards: [{ ...card, buttons: [{ ...card.buttons[0]!, script: `go to card ${card.id}` }] }] } : stack;
      expect(stackSchema.safeParse(withBack).success).toBe(true);
      expect(validateStack(withBack)).toEqual([]);
    }), { numRuns: RUNS });
  });
});

describe("resolveLookupCredentials", () => {
  const conditions = [{ column: "student_id", variable: "lookup_id", secret: false }, { column: "pin_hash", variable: "code", secret: true }];
  it("P-LK1: uses the field names from the lookup command", () => {
    expect(resolveLookupCredentials({ lookup_id: "1001", code: "1234" }, conditions, [])).toEqual({ lookupId: "1001", pin: "1234" });
  });
  it("P-LK1 example: falls back to common names and secret fields", () => {
    expect(resolveLookupCredentials({ sid: "1", pin: "2" }, [], [])).toEqual({ lookupId: "1", pin: "2" });
    expect(resolveLookupCredentials({ student_number: "7", secret_code: "9" }, [], [{ id: "secret_code", type: "secret" }])).toEqual({ lookupId: "7", pin: "9" });
    expect(resolveLookupCredentials({}, [], [])).toEqual({ lookupId: "", pin: "" });
  });
  it("P-LK2: never throws and always returns strings", () => {
    fc.assert(fc.property(fc.dictionary(hostile, hostile), (values) => {
      const result = resolveLookupCredentials(values, conditions, [{ id: "x", type: "secret" }]);
      expect(typeof result.lookupId).toBe("string");
      expect(typeof result.pin).toBe("string");
    }), { numRuns: RUNS });
  });
  it("P-LK2: ignores inherited keys such as constructor and __proto__", () => {
    expect(resolveLookupCredentials({}, [{ column: "a", variable: "constructor", secret: false }], [])).toEqual({ lookupId: "", pin: "" });
  });
});
