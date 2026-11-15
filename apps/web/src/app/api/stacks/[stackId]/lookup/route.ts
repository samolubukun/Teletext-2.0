import { fetchMutation } from "convex/nextjs";
import { ConvexError } from "convex/values";
import { z } from "zod";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { api } from "../../../../../../convex/_generated/api";
import { convexConfigured } from "@/lib/convexServer";
import { readSmallJson, visitorHash } from "@/lib/visitor";

const body = z.object({ lookupId: z.string().trim().min(1).max(80), pin: z.string().min(1).max(80) });
const stackId = z.string().min(1);

export async function POST(request: Request, context: { params: Promise<{ stackId: string }> }) {
  if (process.env.NEXT_PUBLIC_STACKS_ENABLED !== "true") return Response.json({ error: { code: "disabled", message: "Stacks are not enabled." } }, { status: 404 });
  const { stackId: raw } = await context.params;
  const parsed = body.safeParse(await readSmallJson(request, 500));
  const visitor = visitorHash(request);
  if (!parsed.success || !stackId.safeParse(raw).success) return Response.json({ error: { code: "invalid", message: "Enter your ID and PIN." } }, { status: 400 });
  if (!visitor || !convexConfigured()) return Response.json({ error: { code: "unavailable", message: "Lookup is not available right now." } }, { status: 503 });
  try {
    const result = await fetchMutation(api.stacks.lookup, { stackId: raw as Id<"stacks">, lookupId: parsed.data.lookupId, pin: parsed.data.pin, visitorHash: visitor });
    return Response.json(result, { status: result.ok ? 200 : result.code === "rate" ? 429 : 404 });
  } catch (error) {
    const data = error instanceof ConvexError ? (error.data as { message?: string }) : null;
    return Response.json({ error: { code: "unavailable", message: data?.message ?? "Lookup is not available right now." } }, { status: 503 });
  }
}
