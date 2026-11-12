import {
  PLAN_LIMITS,
  allowedTransitions,
  blocksSchema,
  canPublishMore,
  canTransition,
  defaultFastext,
  fastextLinkSchema,
  isInRange,
  type Block,
  type FastextLink,
} from "@teletext/core";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { fail, requireOrgAccess, requirePageAccess } from "./lib/access";
import { renderForOrg, searchTextOf } from "./lib/renderPage";
import { fastextLink, pageStatus } from "./schema";

const pageSummary = v.object({
  pageId: v.id("pages"),
  number: v.number(),
  title: v.string(),
  status: pageStatus,
  updatedAt: v.number(),
  isLive: v.boolean(),
});

export const list = query({
  args: { orgId: v.id("organizations") },
  returns: v.array(pageSummary),
  handler: async (ctx, { orgId }) => {
    await requireOrgAccess(ctx, orgId, "page.read");
    const pages = await ctx.db.query("pages").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect();
    return pages.map((p) => ({ pageId: p._id, number: p.number, title: p.title, status: p.status, updatedAt: p.updatedAt, isLive: p.isLive }));
  },
});

export const get = query({
  args: { pageId: v.id("pages") },
  returns: v.object({
    pageId: v.id("pages"),
    orgId: v.id("organizations"),
    orgName: v.string(),
    rangeStart: v.number(),
    rangeEnd: v.number(),
    helpPage: v.number(),
    utcOffsetMinutes: v.number(),
    number: v.number(),
    title: v.string(),
    status: pageStatus,
    isLive: v.boolean(),
    version: v.number(),
    blocks: v.any(),
    fastext: v.array(fastextLink),
    uncheckedFacts: v.number(),
    nextStatuses: v.array(pageStatus),
    canWrite: v.boolean(),
    canPublish: v.boolean(),
  }),
  handler: async (ctx, { pageId }) => {
    const { page, org, role } = await requirePageAccess(ctx, pageId, "page.read");
    const version = page.currentVersionId ? await ctx.db.get(page.currentVersionId) : null;
    return {
      pageId: page._id,
      orgId: org._id,
      orgName: org.name,
      rangeStart: org.rangeStart,
      rangeEnd: org.rangeEnd,
      helpPage: org.helpPage ?? org.rangeStart,
      utcOffsetMinutes: org.utcOffsetMinutes ?? 60,
      number: page.number,
      title: page.title,
      status: page.status,
      isLive: page.isLive,
      version: version?.version ?? 0,
      blocks: version?.blocks ?? [],
      fastext: version?.fastext ?? defaultFastext(page.number, org.helpPage ?? org.rangeStart),
      uncheckedFacts: version?.uncheckedFacts ?? 0,
      nextStatuses: allowedTransitions(page.status, { requireApproval: org.requireApproval ?? false }),
      canWrite: role !== "viewer",
      canPublish: role !== "viewer",
    };
  },
});

/** Free page numbers in the organization's range, for the "new page" picker. */
export const freeNumbers = query({
  args: { orgId: v.id("organizations") },
  returns: v.array(v.number()),
  handler: async (ctx, { orgId }) => {
    const { org } = await requireOrgAccess(ctx, orgId, "page.read");
    const used = new Set((await ctx.db.query("pages").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect()).map((p) => p.number));
    const free: number[] = [];
    for (let n = org.rangeStart; n <= org.rangeEnd && free.length < 60; n++) if (!used.has(n)) free.push(n);
    return free;
  },
});

async function writeVersion(
  ctx: MutationCtx,
  page: Doc<"pages">,
  org: Doc<"organizations">,
  userId: string,
  blocks: Block[],
  fastext: FastextLink[],
  uncheckedFacts: number,
) {
  const now = Date.now();
  const { rendered, warnings } = renderForOrg(org, page.number, blocks, fastext, now);
  const previous = page.currentVersionId ? await ctx.db.get(page.currentVersionId) : null;
  const versionId = await ctx.db.insert("pageVersions", {
    pageId: page._id,
    version: (previous?.version ?? 0) + 1,
    blocks,
    rendered,
    fastext,
    errorCount: warnings.filter((w) => w.level === "error").length,
    warningCount: warnings.filter((w) => w.level === "warning").length,
    uncheckedFacts,
    createdBy: userId,
  });
  const firstHeading = blocks.find((b) => b.type === "heading");
  const title = firstHeading && firstHeading.type === "heading" && firstHeading.text.trim() ? firstHeading.text.trim().slice(0, 60) : page.title;
  await ctx.db.patch(page._id, { currentVersionId: versionId, updatedAt: now, title, searchText: searchTextOf(title, blocks) });
  return { versionId, warnings };
}

export const create = mutation({
  args: { orgId: v.id("organizations"), number: v.number(), title: v.string() },
  returns: v.id("pages"),
  handler: async (ctx, { orgId, number, title }) => {
    const { org, userId } = await requireOrgAccess(ctx, orgId, "page.write");
    if (!isInRange(number, [org.rangeStart, org.rangeEnd])) fail("range", `Pick a page number from ${org.rangeStart} to ${org.rangeEnd}.`);
    const taken = await ctx.db.query("pages").withIndex("by_number", (q) => q.eq("number", number)).first();
    if (taken) fail("taken", `Page ${number} already exists.`);
    const cleanTitle = title.trim().slice(0, 60) || `Page ${number}`;
    const pageId: Id<"pages"> = await ctx.db.insert("pages", {
      orgId,
      number,
      title: cleanTitle,
      status: "draft",
      isLive: false,
      updatedAt: Date.now(),
      searchText: cleanTitle,
    });
    const page = await ctx.db.get(pageId);
    if (!page) fail("not_found", "Page not found.");
    await writeVersion(ctx, page, org, userId, [{ type: "heading", level: 1, text: cleanTitle.toUpperCase().slice(0, 38) }], defaultFastext(number, org.helpPage ?? org.rangeStart), 0);
    return pageId;
  },
});

export const save = mutation({
  args: { pageId: v.id("pages"), blocks: v.any(), fastext: v.array(fastextLink), uncheckedFacts: v.optional(v.number()) },
  returns: v.object({ version: v.number(), errors: v.number(), warnings: v.number() }),
  handler: async (ctx, args) => {
    const { page, org, userId } = await requirePageAccess(ctx, args.pageId, "page.write");
    const blocks = blocksSchema.safeParse(args.blocks);
    if (!blocks.success) fail("invalid", `The page content is not valid: ${blocks.error.issues[0]?.message ?? "unknown problem"}.`);
    const fastext = fastextLinkSchema.array().max(4).safeParse(args.fastext);
    if (!fastext.success) fail("invalid", "The fastext links are not valid.");
    const { versionId, warnings } = await writeVersion(ctx, page, org, userId, blocks.data, fastext.data, Math.max(0, Math.floor(args.uncheckedFacts ?? 0)));
    const version = await ctx.db.get(versionId);
    return {
      version: version?.version ?? 0,
      errors: warnings.filter((w) => w.level === "error").length,
      warnings: warnings.filter((w) => w.level === "warning").length,
    };
  },
});

export const setStatus = mutation({
  args: { pageId: v.id("pages"), to: pageStatus, confirmFacts: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { pageId, to, confirmFacts }) => {
    const { page, org } = await requirePageAccess(ctx, pageId, to === "published" ? "page.publish" : "page.write");
    if (!canTransition(page.status, to, { requireApproval: org.requireApproval ?? false })) {
      fail("transition", `A ${page.status} page cannot move to ${to}.`);
    }
    if (to === "published") {
      const version = page.currentVersionId ? await ctx.db.get(page.currentVersionId) : null;
      if (!version) fail("empty", "Save the page before publishing.");
      if (version.errorCount > 0) fail("errors", "Fix the errors in the validation panel before publishing.");
      if (version.uncheckedFacts > 0 && !confirmFacts) {
        fail("facts", `${version.uncheckedFacts} value(s) from the AI draft were not found in your source. Check them, then confirm.`);
      }
      if (version.uncheckedFacts > 0 && confirmFacts) await ctx.db.patch(version._id, { uncheckedFacts: 0 });
      const published = await ctx.db.query("pages").withIndex("by_org_status", (q) => q.eq("orgId", org._id).eq("status", "published")).collect();
      if (!canPublishMore(org.plan, published.length)) {
        fail("plan_limit", `Your ${org.plan} plan allows ${PLAN_LIMITS[org.plan].publishedPages} published pages. Archive a page or upgrade.`);
      }
    }
    await ctx.db.patch(pageId, { status: to, updatedAt: Date.now() });
    return null;
  },
});

export const setLive = mutation({
  args: { pageId: v.id("pages"), isLive: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { pageId, isLive }) => {
    await requirePageAccess(ctx, pageId, "page.write");
    await ctx.db.patch(pageId, { isLive });
    return null;
  },
});

const MAX_VERSIONS_LISTED = 30;

/** Newest first. Reader-safe: no user ids, only whether the caller made the version. */
export const versions = query({
  args: { pageId: v.id("pages") },
  returns: v.array(
    v.object({
      version: v.number(),
      createdAt: v.number(),
      byMe: v.boolean(),
      errorCount: v.number(),
      warningCount: v.number(),
      isCurrent: v.boolean(),
    }),
  ),
  handler: async (ctx, { pageId }) => {
    const { page, userId } = await requirePageAccess(ctx, pageId, "page.read");
    const rows = await ctx.db
      .query("pageVersions")
      .withIndex("by_page_version", (q) => q.eq("pageId", pageId))
      .order("desc")
      .take(MAX_VERSIONS_LISTED);
    return rows.map((r) => ({
      version: r.version,
      createdAt: r._creationTime,
      byMe: r.createdBy === userId,
      errorCount: r.errorCount,
      warningCount: r.warningCount,
      isCurrent: r._id === page.currentVersionId,
    }));
  },
});

/**
 * Restore (D5): copies the content of an older version into a NEW version, so history is never rewritten.
 * Needs the same permission as saving. The version is looked up by (pageId, version), so a version of
 * another page can never be restored here.
 */
export const restore = mutation({
  args: { pageId: v.id("pages"), version: v.number() },
  returns: v.object({ version: v.number(), blocks: v.any(), fastext: v.array(fastextLink) }),
  handler: async (ctx, { pageId, version }) => {
    const { page, org, userId } = await requirePageAccess(ctx, pageId, "page.write");
    const old = await ctx.db
      .query("pageVersions")
      .withIndex("by_page_version", (q) => q.eq("pageId", pageId).eq("version", version))
      .unique();
    if (!old) fail("not_found", `Version ${version} does not exist.`);
    // Re-validate: the content rules may have changed since that version was saved.
    const blocks = blocksSchema.safeParse(old.blocks);
    if (!blocks.success) fail("invalid", "That version can no longer be restored because its content is not valid any more.");
    const fastext = fastextLinkSchema.array().max(4).safeParse(old.fastext);
    if (!fastext.success) fail("invalid", "That version's fastext links are not valid any more.");
    const { versionId } = await writeVersion(ctx, page, org, userId, blocks.data, fastext.data, old.uncheckedFacts);
    const created = await ctx.db.get(versionId);
    return { version: created?.version ?? 0, blocks: blocks.data, fastext: fastext.data };
  },
});
