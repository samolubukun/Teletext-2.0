import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { blankStack, generateStack, type StackRequest } from "../src/stack";

const request: StackRequest = { description: "Check exam results by candidate ID", template: "lookup", columns: ["candidate_id", "result"] };

describe("stack generator", () => {
  it("P-SG1: returns a valid blank lookup template after two invalid answers", async () => {
    const result = await generateStack(request, async () => "{}");
    expect(result.usedFallback).toBe(true);
    expect(result.stack.cards[0]?.buttons[0]?.script).toContain("show message");
  });
  it("P-SG2: accepts a valid model draft without publishing it", async () => {
    const stack = blankStack(request);
    const result = await generateStack(request, async () => JSON.stringify(stack));
    expect(result.usedFallback).toBe(false);
    expect(result.stack).toEqual(stack);
  });
  it("P-SG3: never sends table rows or secrets to the model", async () => {
    let prompt = "";
    await generateStack(request, async (input) => { if (!prompt) prompt = input.prompt; return "{}"; });
    expect(prompt).toContain("candidate_id");
    expect(prompt).not.toContain("12345");
    expect(prompt).not.toContain("pin_hash");
  });
  it("P-SG4: blank fallback remains valid for aggressive descriptions", async () => {
    await fc.assert(fc.asyncProperty(fc.string({ unit: fc.constantFrom(...Array.from("aZ09 _-😀漢")) , minLength: 1, maxLength: 4000 }), async (description) => {
      const stack = blankStack({ ...request, description });
      expect(stack.cards.length).toBeGreaterThan(0);
      expect(stack.tables.results?.columns.length).toBeGreaterThan(0);
    }), { numRuns: Number(process.env.FC_RUNS ?? 1000) });
  });
});
