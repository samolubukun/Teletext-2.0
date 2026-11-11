// POST /api/ai/condense  { orgId, source }  with  Authorization: Bearer <Convex auth token>.
// Gemini runs here on the server; GEMINI_API_KEY comes from the environment and never reaches the browser.
// Authorization and the per-plan rate limit are enforced by Convex (aiUsage.authorize).
// Model: GEMINI_MODEL (default gemini-3.5-flash-lite), falling back to GEMINI_FALLBACK_MODEL
// (default gemini-3.1-flash-lite) on any error such as 503 or a timeout.
import { GoogleGenAI } from "@google/genai";
import { condense, MAX_SOURCE_CHARS, withModelFallback, type ModelCall } from "@teletext/ai";
import { fetchMutation } from "convex/nextjs";
import { ConvexError } from "convex/values";
import { z } from "zod";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export const maxDuration = 60;

const PRIMARY_MODEL = "gemini-3.5-flash-lite";
const FALLBACK_MODEL = "gemini-3.1-flash-lite";
const PER_CALL_TIMEOUT_MS = 20_000;

const body = z.object({ orgId: z.string().min(1).max(64), source: z.string().min(20).max(MAX_SOURCE_CHARS * 2) });

function geminiCall(client: GoogleGenAI, model: string): ModelCall {
  return async ({ system, prompt, schema }) => {
    const interaction = await client.interactions.create(
      {
        model,
        input: prompt,
        system_instruction: system,
        response_format: { type: "text", mime_type: "application/json", schema: schema as Record<string, unknown> },
        store: false,
      },
      { timeout: PER_CALL_TIMEOUT_MS, maxRetries: 0 },
    );
    if (!interaction.output_text) throw new Error("empty answer");
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

  const client = new GoogleGenAI({ apiKey });
  const models = [process.env.GEMINI_MODEL || PRIMARY_MODEL, process.env.GEMINI_FALLBACK_MODEL || FALLBACK_MODEL];
  const used: string[] = [];
  const call = withModelFallback(models, (m) => geminiCall(client, m), (a) => {
    if (a.ok) used.push(a.model);
    else console.warn(`[ai] ${a.model} failed: ${a.error}`);
  });

  const result = await condense(parsed.data.source, call, { publisher });
  return Response.json({ ...result, model: used.at(-1) ?? null }, { headers: { "Cache-Control": "no-store" } });
}
