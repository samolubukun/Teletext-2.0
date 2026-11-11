// Live check against Gemini. Skipped unless GEMINI_LIVE=1 and GEMINI_API_KEY are set.
// Run from packages/ai: $env:GEMINI_LIVE=1; $env:GEMINI_API_KEY=...; npx vitest run test/gemini.live.test.ts
import { GoogleGenAI } from "@google/genai";
import { describe, expect, it } from "vitest";
import { condense, type ModelCall } from "../src/condense";
import { withModelFallback } from "../src/fallback-models";

const SOURCE = `Dear parents and guardians,
The Term 1 examination reports for all JSS3 students will be ready for collection on Friday 13 November 2026.
Collection will take place in the Main Hall between 9am and 3pm. Please bring your child's ID card.
Outstanding fees of N2,500 must be cleared before reports can be released.
For questions, call the school office on 0800 000 0000.
Mrs Adaeze Okafor, Principal, Greenfield High`;

const live = process.env.GEMINI_LIVE === "1" && Boolean(process.env.GEMINI_API_KEY);

describe.skipIf(!live)("Gemini live condense", () => {
  it("produces a valid draft with no invented values", async () => {
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
        { timeout: 20_000, maxRetries: 0 },
      );
      if (!r.output_text) throw new Error("empty answer");
      return r.output_text;
    };
    const attempts: string[] = [];
    const t0 = Date.now();
    const result = await condense(SOURCE, withModelFallback(models, callFor, (a) => attempts.push(`${a.model}:${a.ok ? "ok" : a.error}`)));
    console.log(JSON.stringify({ ms: Date.now() - t0, attempts, usedFallback: result.usedFallback, note: result.note }));
    console.log(JSON.stringify(result.blocks, null, 1));
    console.log("matched:", result.facts.matched.map((p) => p.draft.raw).join(" | "));
    console.log("UNMATCHED:", result.facts.unmatched.map((v) => v.raw).join(" | ") || "(none)");
    console.log("dropped:", result.facts.dropped.map((v) => v.raw).join(" | ") || "(none)");
    expect(result.usedFallback).toBe(false);
    expect(result.facts.unmatched.filter((v) => v.kind !== "name")).toEqual([]);
    // condense-v2: a range stays a range, never "9am and 3pm".
    const text = JSON.stringify(result.blocks);
    expect(text).not.toMatch(/9am and 3pm/i);
    expect(text).toMatch(/9am (to|-) ?3pm|9am-3pm/i);
  }, 120_000);
});
