import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { condense, type ModelCall } from "../src/condense";
import { EVAL_CASES } from "../src/eval-cases";
import { scoreCase, summarize, valueSurvives } from "../src/eval";
import { extractValues } from "../src/facts";

const runs = Number(process.env.FC_RUNS ?? 1000);

// A model that always fails, so condense() uses the extractive fallback. This is the baseline
// every real prompt has to beat.
const failing: ModelCall = async () => {
  throw new Error("offline");
};

describe("evaluation harness", () => {
  it("has exactly 20 cases with unique ids", () => {
    expect(EVAL_CASES).toHaveLength(20);
    expect(new Set(EVAL_CASES.map((c) => c.id)).size).toBe(20);
  });

  it("every must-keep value really appears in its own source", () => {
    for (const c of EVAL_CASES) {
      for (const v of c.mustKeep) {
        expect(valueSurvives(v, c.source), `${c.id}: ${v}`).toBe(true);
      }
    }
  });

  it("every phrase regex compiles", () => {
    for (const c of EVAL_CASES) for (const p of c.phrases ?? []) expect(() => new RegExp(p, "i")).not.toThrow();
  });

  it("the extractive fallback keeps most facts and invents none (baseline)", async () => {
    const scores = [];
    for (const c of EVAL_CASES) scores.push(scoreCase(c, await condense(c.source, failing)));
    const s = summarize(scores, EVAL_CASES);
    console.log("fallback baseline", JSON.stringify(s));
    expect(s.fallbackCount).toBe(20);
    expect(s.inventedCount).toBe(0);
  });

  it("P-E1: a draft equal to the source scores a perfect keep rate", () => {
    for (const c of EVAL_CASES) {
      const result = {
        blocks: [{ type: "paragraph" as const, text: c.source }],
        fastextLabels: [],
        facts: { matched: [], unmatched: [], dropped: [] },
        usedFallback: false,
        attempts: 1,
      };
      expect(scoreCase(c, result).kept).toBe(c.mustKeep.length);
    }
  });

  it("P-E2: valueSurvives is true for any extracted value in its own text and never throws", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 2000 }), (text) => {
        for (const v of extractValues(text)) expect(valueSurvives(v.raw, text)).toBe(true);
        expect(() => valueSurvives("anything", text)).not.toThrow();
      }),
      { numRuns: runs },
    );
  });
});
