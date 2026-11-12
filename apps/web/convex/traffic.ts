// Page views (public write, rate limited) and the analytics summary (owner/editor/viewer read, Pro plan and up).
import { PLAN_LIMITS, dayKey, summarizeViews } from "@teletext/core";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { fail, requireOrgAccess } from "./lib/access";
import { hit } from "./lib/rateLimit";

const MINUTE = 60_000;
const HOUR = 3_600_000;
/** One counted view per visitor per page per minute, and a ceiling per page per hour against floods. */
const VIEWS_PER_VISITOR_PER_MINUTE = 1;
const VIEWS_PER_PAGE_PER_HOUR = 20_000;
const MAX_ROWS = 3000;

const device = v.union(v.literal("mobile"), v.literal("desktop"), v.literal("other"));

/**
 * Called by POST /api/view with a salted hash of the visitor's IP. The hash is only a rate-limit key and is
 * never stored on a view row. Unknown or unpublished pages are ignored without an error (nothing to learn).
 */
export const recordView = mutation({
  args: { pageNumber: v.number(), device, visitorHash: v.string() },
  returns: v.null(),
  handler: async (ctx, { pageNumber, device: deviceClass, visitorHash }) => {
    if (!Number.isInteger(pageNumber) || pageNumber < 100 || pageNumber > 899) return null;
    if (!/^[0-9a-f]{16,64}$/.test(visitorHash)) return null;
    if (!(await hit(ctx, `v:${visitorHash}:${pageNumber}`, VIEWS_PER_VISITOR_PER_MINUTE, MINUTE))) return null;
    if (!(await hit(ctx, `vg:${pageNumber}`, VIEWS_PER_PAGE_PER_HOUR, HOUR))) return null;

    const page = await ctx.db.query("pages").withIndex("by_number", (q) => q.eq("number", pageNumber)).first();
    if (!page || page.status !== "published") return null;

    const day = dayKey(Date.now());
    const row = await ctx.db
      .query("viewCounts")
      .withIndex("by_page_day", (q) => q.eq("pageNumber", pageNumber).eq("day", day))
      .unique();
    if (row) await ctx.db.patch(row._id, { [deviceClass]: row[deviceClass] + 1 });
    else await ctx.db.insert("viewCounts", { orgId: page.orgId, pageNumber, day, mobile: 0, desktop: 0, other: 0, [deviceClass]: 1 });
    return null;
  },
});

const summaryShape = v.object({
  total: v.number(),
  byDevice: v.object({ mobile: v.number(), desktop: v.number(), other: v.number() }),
  byDay: v.array(v.object({ day: v.number(), views: v.number() })),
  topPages: v.array(v.object({ pageNumber: v.number(), views: v.number(), title: v.string() })),
});

/**
 * Views for the organization since `sinceDay` (yyyymmdd, passed in because queries cannot read the clock).
 * Only rows of this organization are read (T9). The free plan gets `locked: true` and no numbers.
 */
export const summary = query({
  args: { orgId: v.id("organizations"), sinceDay: v.number() },
  returns: v.object({ locked: v.boolean(), summary: v.optional(summaryShape) }),
  handler: async (ctx, { orgId, sinceDay }) => {
    const { org } = await requireOrgAccess(ctx, orgId, "org.read");
    if (!PLAN_LIMITS[org.plan].analytics) return { locked: true };
    if (!Number.isInteger(sinceDay) || sinceDay < 20000101) fail("invalid", "Pick a valid start day.");
    const rows = await ctx.db.query("viewCounts").withIndex("by_org_day", (q) => q.eq("orgId", orgId).gte("day", sinceDay)).take(MAX_ROWS);
    const s = summarizeViews(rows, 5);
    const pages = await ctx.db.query("pages").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect();
    const titles = new Map(pages.map((p) => [p.number, p.title]));
    return { locked: false, summary: { ...s, topPages: s.topPages.map((p) => ({ ...p, title: titles.get(p.pageNumber) ?? "" })) } };
  },
});
