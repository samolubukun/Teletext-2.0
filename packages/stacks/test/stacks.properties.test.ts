import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cardBlocks, parseCardScript, run, stackSchema, validateStack, type Stack, type StackState } from "../src";

const RUNS = Number(process.env.FC_RUNS ?? 1000);
const validStack: Stack = {
  version: 1,
  id: "results-2026",
  title: "Exam Results Lookup",
  template: "lookup",
  startCard: "home",
  tables: { results: { columns: ["student_id", "pin_hash", "name", "grade", "score"] } },
  cards: [
    { id: "home", page: 412, title: "EXAM RESULTS", blocks: [{ type: "heading", level: 1, text: "EXAM RESULTS" }], fields: [{ id: "sid", label: "Student ID", type: "text", maxLength: 12 }, { id: "pin", label: "PIN", type: "secret", maxLength: 4 }], buttons: [{ key: "green", label: "Submit", script: "lookup results by student_id = sid and pin_hash = pin into row" }] },
    { id: "result", page: 413, title: "RESULT", blocks: [{ type: "heading", level: 1, text: "RESULT" }], fields: [], buttons: [{ key: "red", label: "Back", script: "go to card home" }] },
  ],
};
const state: StackState = { cardId: "home", variables: { sid: "1001", pin: "1234" }, fields: { sid: "1001", pin: "1234" } };
const hostile = fc.oneof(fc.string({ maxLength: 60000 }), fc.string({ unit: "binary", maxLength: 2000 }), fc.string({ unit: "grapheme", maxLength: 2000 }), fc.constantFrom("", "go to card", "eval(x)", "for ever", "🙂🙂"));

describe("Stack format and CardScript ST1-ST10", () => {
  it("ST2/ST4: parsing arbitrary hostile source never throws", () => {
    fc.assert(fc.property(hostile, (source) => {
      const result = parseCardScript(source);
      expect(result.ok === true || result.ok === false).toBe(true);
    }), { numRuns: RUNS });
  });

  it("ST2/ST4 example: valid commands parse and forbidden commands fail with a position", () => {
    expect(parseCardScript('go to card result\nshow message "Done"\nclear fields')).toMatchObject({ ok: true });
    const bad = parseCardScript("eval(something)");
    expect(bad).toMatchObject({ ok: false });
    if (!bad.ok) expect(bad.diagnostics[0]?.position).toBeGreaterThanOrEqual(0);
    expect(parseCardScript("x".repeat(601))).toMatchObject({ ok: false });
  });

  it("ST3/ST10: valid stack validates and card blocks are returned without I/O", () => {
    expect(stackSchema.safeParse(validStack).success).toBe(true);
    expect(validateStack(validStack)).toEqual([]);
    expect(cardBlocks(validStack, "home")).toEqual(validStack.cards[0]!.blocks);
    expect(cardBlocks(validStack, "missing")).toEqual([]);
  });

  it("ST3 example: unknown target, duplicate card and dead end produce diagnostics", () => {
    const bad: Stack = { ...validStack, cards: [{ ...validStack.cards[0]!, buttons: [{ key: "green", label: "Go", script: "go to card missing" }] }, { ...validStack.cards[1]!, id: "home", buttons: [] }] };
    const codes = validateStack(bad).map((d) => d.code);
    expect(codes).toContain("duplicate_card");
    expect(codes).toContain("target");
    expect(codes).toContain("dead_end");
  });

  it("ST6/ST7/ST9: run is deterministic, never throws, and lookup creates metadata only", () => {
    fc.assert(fc.property(fc.oneof(fc.constant("green"), fc.string({ maxLength: 200 })), (key) => {
      const a = run(validStack, state, { type: "button", key });
      const b = run(validStack, state, { type: "button", key });
      expect(a).toEqual(b);
      expect(a.steps).toBeLessThanOrEqual(200);
      expect(JSON.stringify(a.effects)).not.toContain("1234");
    }), { numRuns: RUNS });
  });

  it("ST6/ST9 example: lookup is a server effect and never exposes table rows or PINs", () => {
    const result = run(validStack, state, { type: "button", key: "green" });
    expect(result.effects).toEqual([{ type: "lookup", table: "results", conditions: [{ column: "student_id", variable: "sid", secret: false }, { column: "pin_hash", variable: "pin", secret: true }], into: "row" }]);
    expect(JSON.stringify(result.effects)).not.toContain("1234");
  });

  it("ST7 example: missing card returns a clean error, never a throw", () => {
    expect(run(validStack, { ...state, cardId: "missing" }, { type: "enter" })).toMatchObject({ state: { error: "This card is not available." }, effects: [] });
  });

  it("ST8: a generated script can never return more than the execution limit", () => {
    const many = Array.from({ length: 250 }, () => 'show message "x"').join("\n");
    const stack: Stack = { ...validStack, cards: [{ ...validStack.cards[0]!, buttons: [{ key: "green", label: "Run", script: many.slice(0, 600) }] }] };
    const result = run(stack, state, { type: "button", key: "green" });
    expect(result.steps).toBeLessThanOrEqual(200);
  });
});
