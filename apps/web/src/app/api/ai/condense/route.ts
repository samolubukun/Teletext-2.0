// POST /api/ai/condense  { orgId, source }  with  Authorization: Bearer <Convex auth token>.
// Gemini runs here on the server; GEMINI_API_KEY comes from the environment and never reaches the browser.
// Authorization and the per-plan rate limit are enforced by Convex (aiUsage.authorize).
import { GoogleGenAI } from "@google/genai";
import { condense, MAX_SOURCE_CHARS, type ModelCall } from "@teletext/ai";
import { fetchMutation } from "convex/nextjs";
import { ConvexError } from "convex/values";
import { z } from "zod";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

const body = z.object({ orgId: z.string().min(1).max(64), source: z.string().min(20).max(MAX_SOURCE_CHARS * 2) });

function geminiCall(apiKey: string, model: string): ModelCall {
  const client = new GoogleGenAI({ apiKey });
  return async ({ system, prompt, schema }) => {
    const interaction = await client.interactions.create({
      model,
      input: prompt,
      system_instruction: system,
      response_format: { type: "text", mime_type: "application/json", schema: schema as Record<string, unknown> },
      store: false,
    });
    if (!interaction.output_text) throw new Error("The AI returned an empty answer.");
    return interaction.output_text;
  };
}

const error = (status: number, code: string, message: string) => Response.json({ error: { code, message } }, { status });

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return error(401, "unauthenticated", "Please sign in first.");

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error(400, "invalid", "Paste at least a sentence or two (and at most 20,000 characters).");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return error(503, "config", "The AI service is not configured (GEMINI_API_KEY is missing).");

  let publisher: string;
  try {
    ({ publisher } = await fetchMutation(api.aiUsage.authorize, { orgId: parsed.data.orgId as Id<"organizations"> }, { token }));
  } catch (e) {
    const data = e instanceof ConvexError ? (e.data as { code?: string; message?: string }) : null;
    const status = data?.code === "rate_limit" ? 429 : data?.code === "unauthenticated" ? 401 : 403;
    return error(status, data?.code ?? "forbidden", data?.message ?? "You do not have permission to do that.");
  }

  const result = await condense(parsed.data.source, geminiCall(apiKey, process.env.GEMINI_MODEL || "gemini-3.8-flash"), { publisher });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
