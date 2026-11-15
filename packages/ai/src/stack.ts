import { stackSchema, validateStack, type Stack } from "@teletext/stacks";
import { z } from "zod";
import type { ModelCall } from "./condense";

export const STACK_TEMPLATES = ["lookup", "quiz", "form", "decision"] as const;
export const stackRequestSchema = z.object({
  description: z.string().min(1).max(4000),
  template: z.enum(STACK_TEMPLATES).default("lookup"),
  columns: z.array(z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/)).max(12).default([]),
});
export type StackRequest = z.infer<typeof stackRequestSchema>;

export const STACK_JSON_SCHEMA = {
  type: "object",
  description: "A valid safe Teletext Stack definition. Use only the supplied table columns.",
  properties: {
    version: { type: "integer", enum: [1] }, id: { type: "string" }, title: { type: "string" },
    template: { type: "string", enum: STACK_TEMPLATES }, startCard: { type: "string" },
    tables: { type: "object" }, cards: { type: "array" },
  }, required: ["version", "id", "title", "template", "startCard", "tables", "cards"],
} as const;

const blank = (request: StackRequest): Stack => {
  const id = request.template === "lookup" ? "lookup" : "start";
  const columns = request.columns.length ? request.columns : ["lookup_id"];
  return {
    version: 1, id: "generated-stack", title: request.template.toUpperCase(), template: request.template, startCard: id,
    tables: { results: { columns } },
    cards: [{ id, page: 100, title: request.template.toUpperCase().slice(0, 38), blocks: [],
      fields: request.template === "lookup" ? [{ id: "lookup_id", label: "Lookup ID", type: "text", maxLength: 40 }] : [],
      buttons: [{ key: "red", label: "START", script: "show message \"Complete this draft before publishing.\"" }] }],
  };
};

function parseStack(text: string): { ok: true; value: Stack } | { ok: false; error: string } {
  let value: unknown;
  try { value = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { return { ok: false, error: "The answer was not valid JSON." }; }
  const parsed = stackSchema.safeParse(value);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`).join("\n") };
  const diagnostics = validateStack(parsed.data);
  return diagnostics.length ? { ok: false, error: diagnostics.slice(0, 8).map((d) => d.message).join("\n") } : { ok: true, value: parsed.data };
}

export type StackGenerationResult = { stack: Stack; usedFallback: boolean; attempts: number; error?: string };

export async function generateStack(requestInput: StackRequest, call: ModelCall): Promise<StackGenerationResult> {
  const request = stackRequestSchema.parse(requestInput);
  const metadata = JSON.stringify({ templates: STACK_TEMPLATES, selectedTemplate: request.template, columns: request.columns });
  let previous = "";
  let error = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const prompt = attempt === 1
      ? `Create a safe Teletext stack draft. Description: ${request.description}\nAvailable metadata only (never invent table data): ${metadata}\nReturn JSON matching the schema. Use only safe CardScript commands.`
      : `Repair this stack JSON. Keep the description and metadata constraints. Validation errors: ${error}\nJSON:\n${previous}`;
    try { previous = await call({ system: "Generate a draft only. Never publish. Do not include lookup rows, IDs, PINs, personal data, network calls, or unsupported commands.", prompt, schema: STACK_JSON_SCHEMA }); }
    catch (e) { error = e instanceof Error ? e.message : "The AI service failed."; continue; }
    const parsed = parseStack(previous);
    if (parsed.ok) return { stack: parsed.value, usedFallback: false, attempts: attempt };
    error = parsed.error;
  }
  return { stack: blank(request), usedFallback: true, attempts: 2, error };
}

export function blankStack(request: StackRequest): Stack { return blank(stackRequestSchema.parse(request)); }
