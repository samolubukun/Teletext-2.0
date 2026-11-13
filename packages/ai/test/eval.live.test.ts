// Live evaluation of the current prompt against the 20 cases.
// Run from the repo root:
//   $env:GEMINI_LIVE=1; $env:GEMINI_API_KEY="..."; npm run eval --workspace @teletext/ai
// Record the printed score in docs/kiro-notes.md together with PROMPT_VERSION.
import { GoogleGenAI } from "@google/genai";
import { describe, expect, it } from "vitest";
import { condense, type ModelCall } from "../src/condense";
import { blocksToText } from "../src/schema";
import { scoreCase, summarize } from "../src/eval";
import { EVAL_CASES } from "../src/eval-cases";
import { withModelFallback } from "../src/fallback-models";
import { PROMPT_VERSION } from "../src/prompt";

const live = process.env.GEMINI_LIVE === "1" && Boolean(process.env.GEMINI_API_KEY);

describe.skipIf(!live)("condenser evaluation (live)", () => {
  it("scores the prompt on 20 cases", async () => {
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });
    const models = [process.env.GEMINI_MODEL || "gemini-3.5-flash-lite", process.env.GEMINI_FALLBACK_MODEL || "gemini-3.1-flash-lite"];
    const callFor = (model: string): ModelCall => async ({ system, prompt, schema }) => {
      const r = await client.interactions.create(
        {
          model,
          input: prompt,
          system_instruction: system,
          response_format: { type: "text", mime_type: "application/json", schema: schema as Record<string, unknown> },
          store: false,
        },
        { timeout: 30_000, maxRetries: 0 },
      );
      if (!r.output_text) throw new Error("empty answer");
      return r.output_text;
    };
    const call = withModelFallback(models, callFor);
    const scores = [];
    for (const c of EVAL_CASES) {
      const result = await condense(c.source, call);
      const score = scoreCase(c, result);
      scores.push(score);
      if (score.missingValues.length || score.missingPhrases.length || score.invented.length || score.usedFallback) {
        console.log(`${c.id}:`, JSON.stringify({ missing: score.missingValues, phrases: score.missingPhrases, invented: score.invented, fallback: score.usedFallback }));
        // Read the actual draft before changing the prompt or the regex (a miss may be a fair rewording).
        if (score.missingPhrases.length) console.log(`  draft of ${c.id}: ${JSON.stringify(blocksToText(result.blocks))}`);
      }
    }
    const summary = summarize(scores, EVAL_CASES);
    console.log(`EVAL ${PROMPT_VERSION}`, JSON.stringify(summary));
    expect(summary.fallbackCount).toBeLessThanOrEqual(2);
    expect(summary.keptRate).toBeGreaterThanOrEqual(0.9);
    expect(summary.inventedCount).toBe(0);
  }, 900_000);
});
