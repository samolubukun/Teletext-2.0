// Report-a-page. Readers submit through POST /api/report (public, rate limited); the page's own
// organization reviews the reports and either dismisses them or takes the page offline.
import { REPORT_REASON_LABELS, cleanReportNote, isReportReason } from "@teletext/core";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { fail, requireOrgAccess } from "./lib/access";
import { recordAudit } from "./lib/audit";
import { hit } from "./lib/rateLimit";

const HOUR = 3_600_000;
const REPORTS_PER_VISITOR_PER_HOUR = 5;
const REPORTS_PER_PAGE_PER_HOUR = 30;
const MAX_OPEN_LISTED = 50;

export const submit = mutation({
  args: { pageNumber: v.number(), reason: v.string(), note: v.optional(v.string()), reporterHash: v.string() },
  returns: v.null(),
  handler: async (ctx, { pageNumber, reason, note, reporterHash }) => {
    if (!Number.isInteger(pageNumber) || pageNumber < 100 || pageNumber > 899) fail("invalid", "That page number is not valid.");
    if (!isReportReason(reason)) fail("invalid", "Pick a reason from the list.");
    if (!/^[0-9a-f]{16,64}$/.test(reporterHash)) fail("invalid", "The report could not be checked.");
    if (!(await hit(ctx, `r:${reporterHash}`, REPORTS_PER_VISITOR_PER_HOUR, HOUR))) fail("rate", "Too many reports. Please try again later.");
    if (!(await hit(ctx, `rg:${pageNumber}`, REPORTS_PER_PAGE_PER_HOUR, HOUR))) fail("rate", "This page has had many reports. Please try again later.");

    const page = await ctx.db.query("pages").withIndex("by_number", (q) => q.eq("number", pageNumber)).first();
    if (!page || page.status !== "published") fail("not_found", `Page ${pageNumber} is not published.`);
    const clean = note === undefined ? "" : cleanReportNote(note);
    await ctx.db.insert("reports", {
      pageNumber,
      reason,
      status: "open",
      orgId: page.orgId,
      createdAt: Date.now(),
      ...(clean ? { note: clean } : {}),
    });
    return null;
  },
});

/** Open reports for pages of this organization (T8). Any member can read; the reporter is not recorded. */
export const list = query({
  args: { orgId: v.id("organizations") },
  returns: v.array(
    v.object({
      reportId: v.id("reports"),
      pageNumber: v.number(),
      pageTitle: v.string(),
      reason: v.string(),
      reasonLabel: v.string(),
      note: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, { orgId }) => {
    await requireOrgAccess(ctx, orgId, "page.read");
    const rows = await ctx.db.query("reports").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "open")).take(MAX_OPEN_LISTED);
    const out = [];
    for (const r of rows) {
      const page = await ctx.db.query("pages").withIndex("by_number", (q) => q.eq("number", r.pageNumber)).first();
      out.push({
        reportId: r._id,
        pageNumber: r.pageNumber,
        pageTitle: page?.title ?? "",
        reason: r.reason,
        reasonLabel: isReportReason(r.reason) ? REPORT_REASON_LABELS[r.reason] : r.reason,
        note: r.note ?? "",
        createdAt: r.createdAt ?? r._creationTime,
      });
    }
    return out;
  },
});

/** Dismiss needs "page.write". Taking the page offline needs "page.publish", like any status change. Viewers and outsiders can do neither (T8). */
export const resolve = mutation({
  args: { reportId: v.id("reports"), action: v.union(v.literal("dismiss"), v.literal("archive")) },
  returns: v.null(),
  handler: async (ctx, { reportId, action }) => {
    const report = await ctx.db.get(reportId);
    // Same answer for "missing" and "someone else's" so ids reveal nothing.
    if (!report || !report.orgId) fail("forbidden", "You do not have permission to do that.");
    const { userId } = await requireOrgAccess(ctx, report.orgId, action === "archive" ? "page.publish" : "page.write");
    if (report.status !== "open") return null;

    if (action === "dismiss") {
      await ctx.db.patch(reportId, { status: "closed", resolution: "dismissed" });
      await recordAudit(ctx, report.orgId, userId, "report.dismiss", `Page ${report.pageNumber}: ${report.reason}`);
      return null;
    }

    const page = await ctx.db.query("pages").withIndex("by_number", (q) => q.eq("number", report.pageNumber)).first();
    if (page && page.orgId === report.orgId && page.status !== "archived") {
      await ctx.db.patch(page._id, { status: "archived", publishAt: undefined, expiresAt: undefined, updatedAt: Date.now() });
    }
    // Every open report for that page is settled by taking it down.
    const open = await ctx.db.query("reports").withIndex("by_org_status", (q) => q.eq("orgId", report.orgId).eq("status", "open")).take(200);
    for (const r of open) if (r.pageNumber === report.pageNumber) await ctx.db.patch(r._id, { status: "closed", resolution: "archived" });
    await recordAudit(ctx, report.orgId, userId, "report.archive", `Page ${report.pageNumber} taken offline: ${report.reason}`);
    return null;
  },
});
