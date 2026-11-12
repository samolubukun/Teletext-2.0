// Live data sources: a page fed by a public Google Sheet (CSV export) or an RSS/Atom feed.
// Parsing and URL checks are pure functions in @teletext/core. The only network call is the action `sync`.
// A sync only rewrites the content of the page; it never changes the page's status (C9).
import {
  PLAN_LIMITS,
  SOURCE_LIMITS,
  blocksSchema,
  defaultFastext,
  feedBlocks,
  parseCsv,
  parseFeed,
  sheetBlocks,
  validateSourceUrl,
  type Block,
} from "@teletext/core";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { fail, requirePageAccess } from "./lib/access";
import { recordAudit } from "./lib/audit";
import { writeVersion } from "./pages";

/** JSON with sorted keys. Convex does not keep the key order of stored objects, so plain JSON.stringify would differ. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

const kind = v.union(v.literal("rss"), v.literal("sheet"));
const FETCH_TIMEOUT_MS = 10_000;
const SYNC_NOW_COOLDOWN_MS = 60_000;
const MAX_SOURCES_PER_RUN = 200;

const sourceView = v.object({
  sourceId: v.id("dataSources"),
  kind,
  url: v.string(),
  lastSyncedAt: v.optional(v.number()),
  lastStatus: v.optional(v.union(v.literal("ok"), v.literal("unchanged"), v.literal("error"))),
  lastNote: v.optional(v.string()),
});

/** The source linked to a page, or null. Needs page.read. */
export const forPage = query({
  args: { pageId: v.id("pages") },
  returns: v.union(v.null(), sourceView),
  handler: async (ctx, { pageId }) => {
    await requirePageAccess(ctx, pageId, "page.read");
    const s = await ctx.db.query("dataSources").withIndex("by_page", (q) => q.eq("pageId", pageId)).unique();
    if (!s) return null;
    return { sourceId: s._id, kind: s.kind, url: s.url, lastSyncedAt: s.lastSyncedAt, lastStatus: s.lastStatus, lastNote: s.lastNote };
  },
});

/** Links (or replaces) the source of a page and syncs it at once. Plan limit applies (C7). */
export const link = mutation({
  args: { pageId: v.id("pages"), kind, url: v.string() },
  returns: v.null(),
  handler: async (ctx, { pageId, kind: sourceKind, url }) => {
    const { page, org, userId } = await requirePageAccess(ctx, pageId, "page.write");
    const limit = PLAN_LIMITS[org.plan].dataSources;
    const checked = validateSourceUrl(sourceKind, url);
    if (!checked.ok) fail("invalid_url", checked.reason);

    const existing = await ctx.db.query("dataSources").withIndex("by_page", (q) => q.eq("pageId", pageId)).unique();
    if (!existing) {
      const count = (await ctx.db.query("dataSources").withIndex("by_org", (q) => q.eq("orgId", org._id)).take(limit + 1)).length;
      if (count >= limit) {
        fail("plan_limit", limit === 0 ? "Live data sources are part of the Pro and Organization plans." : `Your plan allows ${limit} live data sources.`);
      }
    }
    const fields = { kind: sourceKind, url: checked.url, lastStatus: undefined, lastNote: undefined, lastSyncedAt: undefined, lastAttemptAt: Date.now() };
    const sourceId = existing ? existing._id : await ctx.db.insert("dataSources", { orgId: org._id, pageId, ...fields });
    if (existing) await ctx.db.patch(existing._id, fields);
    await recordAudit(ctx, org._id, userId, "source.link", `Page ${page.number}: linked a ${sourceKind === "sheet" ? "Google Sheet" : "feed"}`);
    await ctx.scheduler.runAfter(0, internal.dataSources.sync, { sourceId });
    return null;
  },
});

export const unlink = mutation({
  args: { pageId: v.id("pages") },
  returns: v.null(),
  handler: async (ctx, { pageId }) => {
    const { page, org, userId } = await requirePageAccess(ctx, pageId, "page.write");
    const s = await ctx.db.query("dataSources").withIndex("by_page", (q) => q.eq("pageId", pageId)).unique();
    if (s) {
      await ctx.db.delete(s._id);
      await recordAudit(ctx, org._id, userId, "source.unlink", `Page ${page.number}: unlinked its data source`);
    }
    return null;
  },
});

/** Once a minute per source. */
export const syncNow = mutation({
  args: { pageId: v.id("pages") },
  returns: v.null(),
  handler: async (ctx, { pageId }) => {
    await requirePageAccess(ctx, pageId, "page.write");
    const s = await ctx.db.query("dataSources").withIndex("by_page", (q) => q.eq("pageId", pageId)).unique();
    if (!s) fail("not_found", "This page has no data source.");
    const now = Date.now();
    if (s.lastAttemptAt !== undefined && now - s.lastAttemptAt < SYNC_NOW_COOLDOWN_MS) fail("rate", "Please wait a minute before syncing again.");
    await ctx.db.patch(s._id, { lastAttemptAt: now });
    await ctx.scheduler.runAfter(0, internal.dataSources.sync, { sourceId: s._id });
    return null;
  },
});

export const sourceForSync = internalQuery({
  args: { sourceId: v.id("dataSources") },
  returns: v.union(v.null(), v.object({ kind, url: v.string(), title: v.string() })),
  handler: async (ctx, { sourceId }) => {
    const s = await ctx.db.get(sourceId);
    if (!s) return null;
    const page = await ctx.db.get(s.pageId);
    return page ? { kind: s.kind, url: s.url, title: page.title } : null;
  },
});

/** Reads at most `maxBytes` of the body, so a huge or endless response cannot fill memory. */
async function readCapped(res: Response, maxBytes: number): Promise<string | null> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8").decode(all);
}

export const sync = internalAction({
  args: { sourceId: v.id("dataSources") },
  returns: v.null(),
  handler: async (ctx, { sourceId }): Promise<null> => {
    // Explicit types: this action calls functions of its own module, which would otherwise make the types circular.
    const source: { kind: "rss" | "sheet"; url: string; title: string } | null = await ctx.runQuery(internal.dataSources.sourceForSync, { sourceId });
    if (!source) return null;
    const report = (error: string): Promise<null> => ctx.runMutation(internal.dataSources.applySync, { sourceId, error });
    // Checked again here: the stored URL could predate a stricter rule.
    const checked = validateSourceUrl(source.kind, source.url);
    if (!checked.ok) return await report(checked.reason);
    try {
      const res = await fetch(checked.url, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { Accept: source.kind === "sheet" ? "text/csv" : "application/rss+xml, application/atom+xml, text/xml, */*;q=0.5", "User-Agent": "Teletext2-DataSource/1.0" },
      });
      if (res.status >= 300 && res.status < 400) {
        return await report(source.kind === "sheet" ? "The sheet is not shared publicly. In Google Sheets choose Share, then anyone with the link can view." : "The feed address redirects. Paste the final address.");
      }
      if (!res.ok) return await report(`The source answered with error ${res.status}.`);
      const text = await readCapped(res, SOURCE_LIMITS.maxBytes);
      if (text === null) return await report("The source is too large (limit 200 KB).");
      const blocks: Block[] =
        source.kind === "sheet" ? sheetBlocks(source.title, parseCsv(text)) : feedBlocks(source.title, parseFeed(text));
      if (source.kind === "rss" && blocks.length > 0 && blocks[1]?.type === "paragraph" && !/<(rss|feed|rdf)/i.test(text)) {
        return await report("That address is not an RSS or Atom feed.");
      }
      return await ctx.runMutation(internal.dataSources.applySync, { sourceId, blocks });
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      return await report(timedOut ? "The source took too long to answer." : "The source could not be reached.");
    }
  },
});

export const applySync = internalMutation({
  args: { sourceId: v.id("dataSources"), blocks: v.optional(v.any()), error: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { sourceId, blocks, error }) => {
    const s = await ctx.db.get(sourceId);
    if (!s) return null;
    const now = Date.now();
    if (error !== undefined || blocks === undefined) {
      await ctx.db.patch(sourceId, { lastAttemptAt: now, lastStatus: "error", lastNote: (error ?? "No content.").slice(0, 200) });
      return null;
    }
    const parsed = blocksSchema.safeParse(blocks);
    if (!parsed.success) {
      await ctx.db.patch(sourceId, { lastAttemptAt: now, lastStatus: "error", lastNote: "The data could not be turned into a page." });
      return null;
    }
    const page = await ctx.db.get(s.pageId);
    const org = page ? await ctx.db.get(page.orgId) : null;
    if (!page || !org) return null;
    const current = page.currentVersionId ? await ctx.db.get(page.currentVersionId) : null;
    if (current && canonical(current.blocks) === canonical(parsed.data)) {
      // Nothing changed: no new version, so history stays readable (C8).
      await ctx.db.patch(sourceId, { lastAttemptAt: now, lastSyncedAt: now, lastStatus: "unchanged", lastNote: undefined });
      return null;
    }
    const fastext = current?.fastext ?? defaultFastext(page.number, org.helpPage ?? org.rangeStart);
    await writeVersion(ctx, page, org, "connector", parsed.data, fastext, 0);
    await ctx.db.patch(sourceId, { lastAttemptAt: now, lastSyncedAt: now, lastStatus: "ok", lastNote: undefined });
    await recordAudit(ctx, org._id, "connector", "source.sync", `Page ${page.number}: content updated from its data source`);
    return null;
  },
});

/** Called by the cron: starts a sync for every source that was not tried in the last 14 minutes. */
export const syncDue = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const sources = await ctx.db.query("dataSources").take(MAX_SOURCES_PER_RUN);
    for (const s of sources) {
      if (s.lastAttemptAt !== undefined && now - s.lastAttemptAt < 14 * 60_000) continue;
      await ctx.db.patch(s._id, { lastAttemptAt: now });
      await ctx.scheduler.runAfter(0, internal.dataSources.sync, { sourceId: s._id as Id<"dataSources"> });
    }
    return null;
  },
});
