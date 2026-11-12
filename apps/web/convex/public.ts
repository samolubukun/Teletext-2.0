// Public, read-only queries for the reader. They return only published content and
// only reader-safe fields. Called from Next.js route handlers (fetchQuery), never with auth.
import { v } from "convex/values";
import { query } from "./_generated/server";

export const page = query({
  args: { number: v.number() },
  returns: v.union(
    v.null(),
    v.object({ pages: v.any(), isLive: v.boolean(), updatedAt: v.number(), publisher: v.string(), expiresAt: v.optional(v.number()) }),
  ),
  handler: async (ctx, { number }) => {
    if (!Number.isInteger(number) || number < 100 || number > 899) return null;
    const page = await ctx.db.query("pages").withIndex("by_number", (q) => q.eq("number", number)).first();
    if (!page || page.status !== "published" || !page.currentVersionId) return null;
    const version = await ctx.db.get(page.currentVersionId);
    const org = await ctx.db.get(page.orgId);
    if (!version || !org) return null;
    // expiresAt lets the route handler refuse a page whose expiry job is late (no Date.now() in a query).
    return { pages: version.rendered, isLive: page.isLive, updatedAt: page.updatedAt, publisher: org.name, expiresAt: page.expiresAt };
  },
});

/** Organizations and their published pages, for page 100 and the directory. */
export const index = query({
  args: {},
  returns: v.array(
    v.object({
      name: v.string(),
      category: v.string(),
      rangeStart: v.number(),
      rangeEnd: v.number(),
      pages: v.array(v.object({ number: v.number(), title: v.string() })),
    }),
  ),
  handler: async (ctx) => {
    const orgs = await ctx.db.query("organizations").withIndex("by_rangeStart").take(100);
    const published = await ctx.db
      .query("pages")
      .withIndex("by_status_number", (q) => q.eq("status", "published"))
      .take(500);
    return orgs
      .map((org) => ({
        name: org.name,
        category: org.category ?? "",
        rangeStart: org.rangeStart,
        rangeEnd: org.rangeEnd,
        pages: published.filter((p) => p.orgId === org._id).map((p) => ({ number: p.number, title: p.title })),
      }))
      .filter((o) => o.pages.length > 0);
  },
});

export const search = query({
  args: { q: v.string() },
  returns: v.array(v.object({ number: v.number(), title: v.string() })),
  handler: async (ctx, { q }) => {
    const term = q.trim().slice(0, 60);
    if (term.length < 2) return [];
    const hits = await ctx.db
      .query("pages")
      .withSearchIndex("search_text", (s) => s.search("searchText", term).eq("status", "published"))
      .take(12);
    return hits.map((p) => ({ number: p.number, title: p.title }));
  },
});
