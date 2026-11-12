// Public page API: GET /api/pages/412 -> { pages: SerializedPage[], isLive, updatedAt }.
// Cached at the edge (s-maxage) and by the service worker, so most reads never reach Convex.
import { isVisible } from "@teletext/core";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { cacheHeaders, convexConfigured } from "@/lib/convexServer";
import { indexPage } from "@/lib/systemPages";

export async function GET(_request: Request, { params }: { params: Promise<{ number: string }> }) {
  const { number: raw } = await params;
  const number = Number(raw);
  if (!/^\d{3}$/.test(raw) || number < 100 || number > 899) {
    return Response.json({ error: { code: "invalid", message: "Page numbers go from 100 to 899." } }, { status: 400 });
  }
  if (!convexConfigured()) {
    return Response.json({ error: { code: "unavailable", message: "The page service is not configured." } }, { status: 503 });
  }

  try {
    if (number === 100) {
      const orgs = await fetchQuery(api.public.index, {});
      const now = Date.now();
      return new Response(JSON.stringify({ pages: indexPage(orgs, new Date(now).toISOString()), isLive: false, updatedAt: now }), {
        headers: cacheHeaders(60),
      });
    }
    const found = await fetchQuery(api.public.page, { number });
    // The expiry job flips the status at the exact time; this check means a late job never leaves an expired page readable (D6).
    if (!found || !isVisible({ status: "published", expiresAt: found.expiresAt }, Date.now())) {
      return Response.json({ error: { code: "not_found", message: `Page ${number} not found.` } }, { status: 404, headers: { "Cache-Control": "public, s-maxage=30" } });
    }
    const { expiresAt, ...page } = found;
    // Do not cache past the expiry time.
    const untilExpiry = expiresAt === undefined ? Infinity : Math.floor((expiresAt - Date.now()) / 1000);
    const seconds = Math.max(1, Math.min(page.isLive ? 15 : 60, untilExpiry));
    return new Response(JSON.stringify(page), { headers: cacheHeaders(seconds) });
  } catch {
    return Response.json({ error: { code: "unavailable", message: "The page service is busy. Try again." } }, { status: 503 });
  }
}
