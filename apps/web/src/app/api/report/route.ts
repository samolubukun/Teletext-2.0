// POST /api/report { number, reason, note? } -> files a report about a published page. Public, rate limited in Convex.
import { REPORT_NOTE_MAX, REPORT_REASONS } from "@teletext/core";
import { ConvexError } from "convex/values";
import { fetchMutation } from "convex/nextjs";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import { convexConfigured } from "@/lib/convexServer";
import { readSmallJson, visitorHash } from "@/lib/visitor";

const body = z.object({
  number: z.number().int().min(100).max(899),
  reason: z.enum(REPORT_REASONS),
  note: z.string().max(REPORT_NOTE_MAX * 3).optional(),
});

export async function POST(request: Request) {
  const parsed = body.safeParse(await readSmallJson(request));
  if (!parsed.success) return Response.json({ error: { code: "invalid", message: "Pick a reason and try again." } }, { status: 400 });
  const hash = visitorHash(request);
  if (!hash || !convexConfigured()) return Response.json({ error: { code: "unavailable", message: "Reporting is not available right now." } }, { status: 503 });
  try {
    await fetchMutation(api.reports.submit, {
      pageNumber: parsed.data.number,
      reason: parsed.data.reason,
      ...(parsed.data.note ? { note: parsed.data.note } : {}),
      reporterHash: hash,
    });
    return Response.json({ ok: true });
  } catch (e) {
    const data = e instanceof ConvexError ? (e.data as { code?: string; message?: string }) : null;
    const status = data?.code === "rate" ? 429 : data?.code === "not_found" ? 404 : 400;
    return Response.json({ error: { code: data?.code ?? "invalid", message: data?.message ?? "The report could not be sent." } }, { status });
  }
}
