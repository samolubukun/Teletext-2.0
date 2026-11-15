import { fetchMutation } from "convex/nextjs";
import { ConvexError } from "convex/values";
import { z } from "zod";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { api } from "../../../../../../convex/_generated/api";
import { convexConfigured } from "@/lib/convexServer";
import { readSmallJson, visitorHash } from "@/lib/visitor";

const body = z.object({ formId: z.string().min(1).max(40), fields: z.record(z.string(), z.string()).refine((v) => Object.keys(v).length <= 6) });

export async function POST(request: Request, context: { params: Promise<{ stackId: string }> }) {
  if (process.env.NEXT_PUBLIC_STACKS_ENABLED !== "true") return Response.json({ error: { code: "disabled", message: "Stacks are not enabled." } }, { status: 404 });
  const { stackId } = await context.params;
  const parsed = body.safeParse(await readSmallJson(request, 3000));
  const visitor = visitorHash(request);
  if (!parsed.success || !visitor || !convexConfigured()) return Response.json({ error: { code: "invalid", message: "The form could not be sent." } }, { status: 400 });
  try {
    return Response.json(await fetchMutation(api.forms.submit, { stackId: stackId as Id<"stacks">, formId: parsed.data.formId, fields: parsed.data.fields, visitorHash: visitor }));
  } catch (error) {
    const data = error instanceof ConvexError ? (error.data as { message?: string; code?: string }) : null;
    return Response.json({ error: { code: data?.code ?? "unavailable", message: data?.message ?? "The form could not be sent." } }, { status: data?.code === "rate" ? 429 : 400 });
  }
}
