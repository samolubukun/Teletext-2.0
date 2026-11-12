// POST /api/view { number } -> counts one view. Fire and forget: always answers 204 so it never slows the reader.
import { classifyDevice } from "@teletext/core";
import { fetchMutation } from "convex/nextjs";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import { convexConfigured } from "@/lib/convexServer";
import { readSmallJson, visitorHash } from "@/lib/visitor";

const body = z.object({ number: z.number().int().min(100).max(899) });

export async function POST(request: Request) {
  const parsed = body.safeParse(await readSmallJson(request, 200));
  const hash = visitorHash(request);
  if (!parsed.success || !hash || !convexConfigured()) return new Response(null, { status: 204 });
  try {
    await fetchMutation(api.traffic.recordView, {
      pageNumber: parsed.data.number,
      device: classifyDevice(request.headers.get("user-agent") ?? ""),
      visitorHash: hash,
    });
  } catch {
    // A failed count is not worth an error for the reader.
  }
  return new Response(null, { status: 204 });
}
