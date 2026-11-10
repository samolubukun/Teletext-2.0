// Stage 1 data model. Mirrors the product doc (Appendix C2), adapted to Convex:
// - No SQL constraints: uniqueness (slug, page number) and range checks are enforced in mutations.
// - No row-level security: org-scoped functions go through the orgQuery/orgMutation wrappers.
// - Stage 2 tables (stacks, stack_tables, ...) are added only when Stage 2 starts.
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const plan = v.union(v.literal("free"), v.literal("pro"), v.literal("org"));
export const role = v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer"));
export const pageStatus = v.union(
  v.literal("draft"),
  v.literal("review"),
  v.literal("published"),
  v.literal("archived"),
);
export const fastextColor = v.union(
  v.literal("red"),
  v.literal("green"),
  v.literal("yellow"),
  v.literal("blue"),
);

export default defineSchema({
  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    plan,
    rangeStart: v.number(),
    rangeEnd: v.number(),
    /** Convex storage id of the mosaic logo source image, if any. */
    logoStorageId: v.optional(v.id("_storage")),
  })
    .index("by_slug", ["slug"])
    .index("by_rangeStart", ["rangeStart"]),

  members: defineTable({
    orgId: v.id("organizations"),
    /** Hexclave user id (identity.subject). */
    userId: v.string(),
    role,
  })
    .index("by_org_user", ["orgId", "userId"])
    .index("by_user", ["userId"]),

  pages: defineTable({
    orgId: v.id("organizations"),
    number: v.number(),
    title: v.string(),
    status: pageStatus,
    currentVersionId: v.optional(v.id("pageVersions")),
    isLive: v.boolean(),
    publishAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_number", ["number"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_status_number", ["status", "number"]),

  pageVersions: defineTable({
    pageId: v.id("pages"),
    version: v.number(),
    /** Input blocks (what the editor edits). Validated with Zod against @teletext/core types. */
    blocks: v.any(),
    /** Page[] output of render(), stored so public reads never render. */
    rendered: v.any(),
    createdBy: v.string(),
  }).index("by_page_version", ["pageId", "version"]),

  fastextLinks: defineTable({
    pageId: v.id("pages"),
    color: fastextColor,
    targetNumber: v.number(),
    label: v.string(),
  }).index("by_page_color", ["pageId", "color"]),

  dataSources: defineTable({
    pageId: v.id("pages"),
    type: v.union(v.literal("sheet"), v.literal("rss")),
    config: v.any(),
    lastSyncedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  }).index("by_page", ["pageId"]),

  pageViews: defineTable({
    pageNumber: v.number(),
    deviceClass: v.union(v.literal("mobile"), v.literal("desktop"), v.literal("other")),
  }).index("by_page", ["pageNumber"]),

  reports: defineTable({
    pageNumber: v.number(),
    reason: v.string(),
    status: v.union(v.literal("open"), v.literal("closed")),
  }).index("by_status", ["status"]),
});
