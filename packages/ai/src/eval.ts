// Evaluation harness for the condenser (ai-condenser task 8). Pure scoring only: the live model
// call lives in test/eval.live.test.ts. Run `npm run eval --workspace @teletext/ai` after every
// prompt change and record the score in docs/kiro-notes.md.
import type { CondenseResult } from "./condense";
import { extractValues } from "./facts";
import { blocksToText } from "./schema";

export type EvalCase = {
  id: string;
  /** Fake source text. */
  source: string;
  /** Values (as written in the source) that must survive in the draft. */
  mustKeep: string[];
  /** Meaning-level checks the value guard cannot see: regex sources that must match the draft text. */
  phrases?: string[];
};

export type CaseScore = {
  id: string;
  kept: number;
  total: number;
  /** Draft values not found in the source (names excluded, as in the live test). */
  invented: string[];
  missingValues: string[];
  missingPhrases: string[];
  usedFallback: boolean;
};

export type EvalSummary = {
  cases: number;
  keptRate: number;
  inventedCount: number;
  phrasePassRate: number;
  fallbackCount: number;
};

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]+/g) ?? []);

/** True when the draft text still carries the value (same comparison key; names by word). */
export function valueSurvives(value: string, draftText: string): boolean {
  const wanted = extractValues(value)[0];
  if (!wanted) return draftText.toLowerCase().includes(value.toLowerCase());
  if (wanted.kind === "name") {
    const have = words(draftText);
    return [...words(wanted.raw)].every((w) => have.has(w));
  }
  return extractValues(draftText).some((v) => v.key === wanted.key);
}

export function scoreCase(c: EvalCase, result: CondenseResult): CaseScore {
  const text = blocksToText(result.blocks);
  const missingValues = c.mustKeep.filter((v) => !valueSurvives(v, text));
  const missingPhrases = (c.phrases ?? []).filter((p) => !new RegExp(p, "i").test(text));
  return {
    id: c.id,
    kept: c.mustKeep.length - missingValues.length,
    total: c.mustKeep.length,
    invented: result.facts.unmatched.filter((v) => v.kind !== "name").map((v) => v.raw),
    missingValues,
    missingPhrases,
    usedFallback: result.usedFallback,
  };
}

export function summarize(scores: readonly CaseScore[], cases: readonly EvalCase[]): EvalSummary {
  const kept = scores.reduce((n, s) => n + s.kept, 0);
  const total = scores.reduce((n, s) => n + s.total, 0);
  const phraseTotal = cases.reduce((n, c) => n + (c.phrases?.length ?? 0), 0);
  const phraseMissing = scores.reduce((n, s) => n + s.missingPhrases.length, 0);
  return {
    cases: scores.length,
    keptRate: total === 0 ? 1 : kept / total,
    inventedCount: scores.reduce((n, s) => n + s.invented.length, 0),
    phrasePassRate: phraseTotal === 0 ? 1 : (phraseTotal - phraseMissing) / phraseTotal,
    fallbackCount: scores.filter((s) => s.usedFallback).length,
  };
}
