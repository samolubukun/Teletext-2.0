import { PLAN_LIMITS, allocateRange, can, type Plan } from "@teletext/core";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { fail, requireOrgAccess, requireUserId } from "./lib/access";
import { plan } from "./schema";

const MAX_ORGS_PER_USER = 3;

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "org"
  );
}

/** The signed-in user's organizations with their role. Empty when signed out. */
export const mine = query({
  args: {},
  returns: v.array(
    v.object({
      orgId: v.id("organizations"),
      name: v.string(),
      slug: v.string(),
      plan,
      role: v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer")),
      rangeStart: v.number(),
      rangeEnd: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const memberships = await ctx.db.query("members").withIndex("by_user", (q) => q.eq("userId", identity.subject)).collect();
    const out = [];
    for (const m of memberships) {
      const org = await ctx.db.get(m.orgId);
      if (org) out.push({ orgId: org._id, name: org.name, slug: org.slug, plan: org.plan, role: m.role, rangeStart: org.rangeStart, rangeEnd: org.rangeEnd });
    }
    return out;
  },
});

export const get = query({
  args: { orgId: v.id("organizations") },
  returns: v.object({
    orgId: v.id("organizations"),
    name: v.string(),
    slug: v.string(),
    plan,
    role: v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer")),
    rangeStart: v.number(),
    rangeEnd: v.number(),
    publishedCount: v.number(),
    pageCount: v.number(),
    limits: v.object({ publishedPages: v.number(), aiRequestsPerHour: v.number() }),
    canWrite: v.boolean(),
    canPublish: v.boolean(),
    canBill: v.boolean(),
    requireApproval: v.boolean(),
  }),
  handler: async (ctx, { orgId }) => {
    const { org, role } = await requireOrgAccess(ctx, orgId, "org.read");
    const pages = await ctx.db.query("pages").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect();
    const limits = PLAN_LIMITS[org.plan];
    return {
      orgId: org._id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      role,
      rangeStart: org.rangeStart,
      rangeEnd: org.rangeEnd,
      publishedCount: pages.filter((p) => p.status === "published").length,
      pageCount: pages.length,
      limits: { publishedPages: limits.publishedPages, aiRequestsPerHour: limits.aiRequestsPerHour },
      canWrite: can(role, "page.write"),
      canPublish: can(role, "page.publish"),
      canBill: can(role, "org.billing"),
      requireApproval: org.requireApproval ?? false,
    };
  },
});

/** Creates an organization, allocates a non-overlapping page range and makes the caller owner. */
export const create = mutation({
  args: { name: v.string(), category: v.optional(v.string()) },
  returns: v.id("organizations"),
  handler: async (ctx, { name, category }) => {
    const userId = await requireUserId(ctx);
    const clean = name.trim().replace(/\s+/g, " ");
    if (clean.length < 2 || clean.length > 60) fail("invalid", "The name must be 2 to 60 characters.");

    const existing = await ctx.db.query("members").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    if (existing.filter((m) => m.role === "owner").length >= MAX_ORGS_PER_USER) {
      fail("limit", `You can own at most ${MAX_ORGS_PER_USER} organizations.`);
    }

    let slug = slugify(clean);
    for (let i = 2; await ctx.db.query("organizations").withIndex("by_slug", (q) => q.eq("slug", slug)).unique(); i++) {
      slug = `${slugify(clean).slice(0, 36)}-${i}`;
    }

    // Convex mutations are serializable transactions, so this read-then-insert cannot race (D1).
    const orgs = await ctx.db.query("organizations").collect();
    const range = allocateRange(
      orgs.map((o) => [o.rangeStart, o.rangeEnd] as const),
      PLAN_LIMITS.free.rangeSize,
    );
    if (!range) fail("full", "All page ranges are taken. Please contact support.");

    const orgId = await ctx.db.insert("organizations", {
      name: clean,
      slug,
      plan: "free",
      rangeStart: range[0],
      rangeEnd: range[1],
      helpPage: range[0],
      utcOffsetMinutes: 60,
      ...(category ? { category: category.slice(0, 30) } : {}),
    });
    await ctx.db.insert("members", { orgId, userId, role: "owner" });
    return orgId;
  },
});

/** Mock checkout for the hackathon: switches the plan. The limits themselves are real. */
export const changePlan = mutation({
  args: { orgId: v.id("organizations"), plan },
  returns: v.null(),
  handler: async (ctx, { orgId, plan: next }) => {
    const { org } = await requireOrgAccess(ctx, orgId, "org.billing");
    if (org.plan !== next) {
      const published = await ctx.db.query("pages").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "published")).collect();
      if (published.length > PLAN_LIMITS[next as Plan].publishedPages) {
        fail("limit", `Archive some pages first: the ${next} plan allows ${PLAN_LIMITS[next as Plan].publishedPages} published pages.`);
      }
      await ctx.db.patch(orgId, { plan: next });
    }
    return null;
  },
});

/** Owner-only. With approval on, editors can send pages for review but only the owner can publish (D8). */
export const setRequireApproval = mutation({
  args: { orgId: v.id("organizations"), requireApproval: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { orgId, requireApproval }) => {
    await requireOrgAccess(ctx, orgId, "org.update");
    await ctx.db.patch(orgId, { requireApproval });
    return null;
  },
});
