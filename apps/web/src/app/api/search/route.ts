import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import { cacheHeaders, convexConfigured } from "@/lib/convexServer";

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return Response.json({ hits: [] });
  if (!convexConfigured()) return Response.json({ error: { code: "unavailable", message: "Search is not configured." } }, { status: 503 });
  try {
    const hits = await fetchQuery(api.public.search, { q });
    return new Response(JSON.stringify({ hits }), { headers: cacheHeaders(60) });
  } catch {
    return Response.json({ error: { code: "unavailable", message: "Search is busy. Try again." } }, { status: 503 });
  }
}
