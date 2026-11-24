import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseCardScript, run, stackSchema, validateStack, type Stack, type StackState } from "../src";

const RUNS = Number(process.env.FC_RUNS ?? 1000);
const card = (id: string, page: number, script: string, onEnter?: string) => ({
  id, page, title: id.toUpperCase(), blocks: [], fields: [],
  buttons: [{ key: "green" as const, label: "GO", script }],
  ...(onEnter ? { onEnter } : {}),
});
const oneCard = (script: string): Stack => ({ version: 1, id: "t", title: "T", template: "quiz", startCard: "a", tables: {}, cards: [card("a", 100, script)] });
const messageOf = (stack: Stack, variables: StackState["variables"]): string | undefined => {
  const result = run(stack, { cardId: "a", variables, fields: {} }, { type: "button", key: "green" });
  const effect = result.effects.find((e) => e.type === "message");
  return effect?.type === "message" ? effect.text : undefined;
};

describe("Comparison operators", () => {
  const ops: Array<[string, (a: number, b: number) => boolean]> = [
    ["=", (a, b) => a === b], ["<>", (a, b) => a !== b], ["!=", (a, b) => a !== b],
    [">", (a, b) => a > b], ["<", (a, b) => a < b], [">=", (a, b) => a >= b], ["<=", (a, b) => a <= b],
  ];
  for (const [op, expected] of ops) {
    it(`P-OP1: "${op}" agrees with JavaScript for integers`, () => {
      const stack = oneCard(`if a ${op} b\nshow message "yes"\nelse\nshow message "no"\nend if`);
      fc.assert(fc.property(fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: -1000, max: 1000 }), (a, b) => {
        expect(messageOf(stack, { a, b })).toBe(expected(a, b) ? "yes" : "no");
      }), { numRuns: RUNS });
    });
  }
  it("P-OP1 example: >= and <= parse and handle equal values", () => {
    expect(parseCardScript('if score >= 3\nshow message "ok"\nelse\nend if').ok).toBe(true);
    expect(messageOf(oneCard('if score >= 3\nshow message "ok"\nelse\nshow message "low"\nend if'), { score: 3 })).toBe("ok");
    expect(messageOf(oneCard('if score <= 3\nshow message "ok"\nelse\nshow message "high"\nend if'), { score: 4 })).toBe("high");
  });
});

describe("Template flows run end to end", () => {
  it("P-TP1: a decision stack branches on a choice and every card has a way out", () => {
    const stack: Stack = {
      version: 1, id: "decide", title: "Which route?", template: "decision", startCard: "ask", tables: {},
      cards: [
        { id: "ask", page: 440, title: "WHICH ROUTE?", blocks: [], fields: [{ id: "need", label: "I need", type: "choice", maxLength: 20, options: ["Speed", "Low cost"] }], buttons: [{ key: "green", label: "ADVISE", script: 'if need = "Speed"\ngo to card fast\nelse\ngo to card cheap\nend if' }] },
        { id: "fast", page: 441, title: "TAKE THE EXPRESS", blocks: [], fields: [], buttons: [{ key: "red", label: "BACK", script: "go to card ask" }] },
        { id: "cheap", page: 442, title: "TAKE ROUTE 12", blocks: [], fields: [], buttons: [{ key: "red", label: "BACK", script: "go to card ask" }] },
      ],
    };
    expect(stackSchema.safeParse(stack).success).toBe(true);
    expect(validateStack(stack)).toEqual([]);
    const go = (need: string) => run(stack, { cardId: "ask", variables: { need }, fields: { need } }, { type: "button", key: "green" }).effects;
    expect(go("Speed")).toEqual([{ type: "navigate", cardId: "fast" }]);
    expect(go("Low cost")).toEqual([{ type: "navigate", cardId: "cheap" }]);
  });
  it("P-TP2: a card's onEnter script runs on the enter event and counts toward the step limit", () => {
    const stack: Stack = { ...oneCard('show message "hi"'), cards: [card("a", 100, 'show message "x"', 'show message "welcome"')] };
    const result = run(stack, { cardId: "a", variables: {}, fields: {} }, { type: "enter" });
    expect(result.effects).toEqual([{ type: "message", text: "welcome" }]);
    expect(result.steps).toBe(1);
  });
});
