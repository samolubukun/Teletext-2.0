// Live check against Gemini. Skipped unless GEMINI_LIVE=1 and GEMINI_API_KEY are set.
// Run: $env:GEMINI_LIVE=1; $env:GEMINI_API_KEY=...; npx vitest run test/gemini.live.test.ts
import { GoogleGenAI } from "@google/genai";
import { describe, expect, it } from "vitest";
import { condense } from "../src/condense";

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
    const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
    const t0 = Date.now();
    const result = await condense(SOURCE, async ({ system, prompt, schema }) => {
      const r = await client.interactions.create({
        model,
        input: prompt,
        system_instruction: system,
        response_format: { type: "text", mime_type: "application/json", schema: schema as Record<string, unknown> },
        store: false,
      });
      if (!r.output_text) throw new Error("empty answer");
      return r.output_text;
    });
    console.log(JSON.stringify({ model, ms: Date.now() - t0, usedFallback: result.usedFallback, attempts: result.attempts, note: result.note }));
    console.log(JSON.stringify(result.blocks, null, 1));
    console.log("matched:", result.facts.matched.map((p) => p.draft.raw).join(" | "));
    console.log("UNMATCHED:", result.facts.unmatched.map((v) => v.raw).join(" | ") || "(none)");
    console.log("dropped:", result.facts.dropped.map((v) => v.raw).join(" | ") || "(none)");
    expect(result.usedFallback).toBe(false);
  }, 120_000);
});
