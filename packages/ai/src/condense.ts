// Condenser orchestration: model call -> Zod validation -> one repair attempt -> fallback,
// then the fact guard. The model call is injected so this stays testable without network.
import type { Block } from "@teletext/core";
import { extractiveSummary } from "./fallback";
import { factGuard, type FactReport } from "./facts";
import { CONDENSE_SYSTEM, buildCondensePrompt, buildRepairPrompt } from "./prompt";
import { CONDENSE_JSON_SCHEMA, blocksToText, condenseOutputSchema, toBlocks } from "./schema";

export const MAX_SOURCE_CHARS = 20_000;

export type ModelCall = (request: { system: string; prompt: string; schema: object }) => Promise<string>;

export type CondenseResult = {
  blocks: Block[];
  fastextLabels: string[];
  facts: FactReport;
  usedFallback: boolean;
  attempts: number;
  note?: string;
};

function parse(text: string): { ok: true; value: ReturnType<typeof condenseOutputSchema.parse> } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return { ok: false, error: "The answer was not valid JSON." };
  }
  const result = condenseOutputSchema.safeParse(json);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: result.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`).join("\n") };
}

export async function condense(sourceInput: string, call: ModelCall, options: { publisher?: string } = {}): Promise<CondenseResult> {
  const source = sourceInput.slice(0, MAX_SOURCE_CHARS);
  const note = sourceInput.length > MAX_SOURCE_CHARS ? `Only the first ${MAX_SOURCE_CHARS} characters were used. Split long documents into several pages.` : undefined;

  let previous = "";
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const prompt = attempt === 1 ? buildCondensePrompt(source, options.publisher) : buildRepairPrompt(source, previous, lastError);
    try {
      previous = await call({ system: CONDENSE_SYSTEM, prompt, schema: CONDENSE_JSON_SCHEMA });
    } catch (e) {
      lastError = e instanceof Error ? e.message : "The AI service failed.";
      continue;
    }
    const parsed = parse(previous);
    if (parsed.ok) {
      const blocks = toBlocks(parsed.value);
      return {
        blocks,
        fastextLabels: parsed.value.fastext.map((f) => f.label),
        facts: factGuard(source, blocksToText(blocks)),
        usedFallback: false,
        attempts: attempt,
        ...(note ? { note } : {}),
      };
    }
    lastError = parsed.error;
  }

  const blocks = extractiveSummary(source);
  return {
    blocks,
    fastextLabels: [],
    facts: factGuard(source, blocksToText(blocks)),
    usedFallback: true,
    attempts: 2,
    note: `The AI draft failed twice (${lastError.split("\n")[0] ?? "unknown error"}), so this is a plain extract of the source. ${note ?? ""}`.trim(),
  };
}
