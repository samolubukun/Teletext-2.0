// POST /api/ai/stack. Generates an unpublished, validated Stage 2 draft.
import { GoogleGenAI } from "@google/genai";
import { generateStack, stackRequestSchema, withModelFallback, type ModelCall } from "@teletext/ai";
import { fetchMutation } from "convex/nextjs";
import { ConvexError } from "convex/values";
import { z } from "zod";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export const maxDuration = 60;
const PER_CALL_TIMEOUT_MS = 20_000;
const body = stackRequestSchema.extend({ orgId: z.string().min(1).max(64) });
const error = (status: number, code: string, message: string) => Response.json({ error: { code, message } }, { status });
function geminiCall(client: GoogleGenAI, model: string): ModelCall {
  return async ({ system, prompt, schema }) => {
    const interaction = await client.interactions.create({ model, input: prompt, system_instruction: system,
      response_format: { type: "text", mime_type: "application/json", schema: schema as Record<string, unknown> }, store: false },
      { timeout: PER_CALL_TIMEOUT_MS, maxRetries: 0 });
    if (!interaction.output_text) throw new Error("empty answer");
    return interaction.output_text;
  };
}

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_STACKS_ENABLED !== "true") return error(404, "disabled", "Stacks are not enabled.");
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return error(401, "unauthenticated", "Please sign in first.");
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error(400, "invalid", "Provide a description and valid stack metadata.");
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return error(503, "config", "The AI service is not configured.");
  try {
    await fetchMutation(api.aiUsage.authorize, { orgId: parsed.data.orgId as Id<"organizations"> }, { token });
  } catch (e) {
    const data = e instanceof ConvexError ? (e.data as { code?: string; message?: string }) : null;
    const status = data?.code === "rate_limit" ? 429 : data?.code === "unauthenticated" ? 401 : 403;
    return error(status, data?.code ?? "forbidden", data?.message ?? "You do not have permission to do that.");
  }
  const client = new GoogleGenAI({ apiKey });
  const models = [process.env.GEMINI_MODEL || "gemini-3.5-flash-lite", process.env.GEMINI_FALLBACK_MODEL || "gemini-3.1-flash-lite"];
  const call = withModelFallback(models, (model) => geminiCall(client, model));
  const { orgId: _orgId, ...requestData } = parsed.data;
  const result = await generateStack(requestData, call);
  return Response.json({ ...result, model: models[0] }, { headers: { "Cache-Control": "no-store" } });
}
