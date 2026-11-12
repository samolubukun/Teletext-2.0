// Stage 1 data model (product doc Appendix C2, adapted to Convex):
// - No SQL constraints: uniqueness (slug, page number) and range checks live in mutations.
// - No row-level security: org-scoped functions call requireOrgAccess (convex/lib/access.ts).
// - Stage 2 tables (stacks, ...) are added only when Stage 2 starts.
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const plan = v.union(v.literal("free"), v.literal("pro"), v.literal("org"));
export const role = v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer"));
export const pageStatus = v.union(v.literal("draft"), v.literal("review"), v.literal("published"), v.literal("archived"));
export const fastextLink = v.object({
  color: v.union(v.literal("red"), v.literal("green"), v.literal("yellow"), v.literal("blue")),
  label: v.string(),
  page: v.number(),
});

export default defineSchema({
  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    plan,
    rangeStart: v.number(),
    rangeEnd: v.number(),
    /** Page used by the blue HELP fastext button. Defaults to the first page of the range. */
    helpPage: v.optional(v.number()),
    requireApproval: v.optional(v.boolean()),
    /** Minutes east of UTC for page headers (Nigeria = 60). */
    utcOffsetMinutes: v.optional(v.number()),
    category: v.optional(v.string()),
  })
    .index("by_slug", ["slug"])
    .index("by_rangeStart", ["rangeStart"]),

  members: defineTable({
    orgId: v.id("organizations"),
    /** Hexclave user id (identity.subject). */
    userId: v.string(),
    role,
    /** Name or email from the sign-in token when the member joined, so the owner can recognise them. */
    label: v.optional(v.string()),
  })
    .index("by_org_user", ["orgId", "userId"])
    .index("by_user", ["userId"])
    .index("by_org", ["orgId"]),

  /** One-time team invites. Only a SHA-256 hash of the code is stored, never the code. */
  invites: defineTable({
    orgId: v.id("organizations"),
    role: v.union(v.literal("editor"), v.literal("viewer")),
    codeHash: v.string(),
    createdBy: v.string(),
    expiresAt: v.number(),
  })
    .index("by_codeHash", ["codeHash"])
    .index("by_org", ["orgId"]),

  pages: defineTable({
    orgId: v.id("organizations"),
    number: v.number(),
    title: v.string(),
    status: pageStatus,
    currentVersionId: v.optional(v.id("pageVersions")),
    isLive: v.boolean(),
    publishAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    /** Set when a scheduled job could not do its work, so the owner sees why (cleared on the next schedule change). */
    scheduleNote: v.optional(v.string()),
    updatedAt: v.number(),
    /** Visible text of the current version, for reader search. */
    searchText: v.string(),
  })
    .index("by_number", ["number"])
    .index("by_org", ["orgId", "number"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_status_number", ["status", "number"])
    .searchIndex("search_text", { searchField: "searchText", filterFields: ["status"] }),

  pageVersions: defineTable({
    pageId: v.id("pages"),
    version: v.number(),
    /** Input blocks (what the editor edits), validated with blocksSchema from @teletext/core. */
    blocks: v.any(),
    /** SerializedPage[] from render(), so public reads never render. */
    rendered: v.any(),
    fastext: v.array(fastextLink),
    errorCount: v.number(),
    warningCount: v.number(),
    /** AI values not found in the source that the publisher has not confirmed yet. */
    uncheckedFacts: v.number(),
    createdBy: v.string(),
  }).index("by_page_version", ["pageId", "version"]),

  aiUsage: defineTable({ orgId: v.id("organizations") }).index("by_org", ["orgId"]),

  pageViews: defineTable({
    pageNumber: v.number(),
    deviceClass: v.union(v.literal("mobile"), v.literal("desktop"), v.literal("other")),
  }).index("by_page", ["pageNumber"]),

  /** Reader reports. orgId is the owner of the page when it was reported; rows from before it existed have none. */
  reports: defineTable({
    pageNumber: v.number(),
    reason: v.string(),
    status: v.union(v.literal("open"), v.literal("closed")),
    orgId: v.optional(v.id("organizations")),
    note: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    resolution: v.optional(v.union(v.literal("dismissed"), v.literal("archived"))),
  })
    .index("by_status", ["status"])
    .index("by_org_status", ["orgId", "status"]),

  /** Daily view counters per page. No IP, no user agent: only a coarse device class. */
  viewCounts: defineTable({
    orgId: v.id("organizations"),
    pageNumber: v.number(),
    /** UTC day as yyyymmdd. */
    day: v.number(),
    mobile: v.number(),
    desktop: v.number(),
    other: v.number(),
  })
    .index("by_page_day", ["pageNumber", "day"])
    .index("by_org_day", ["orgId", "day"]),

  /** Fixed-window counters for public writes. The key holds only salted hashes. */
  rateLimits: defineTable({ key: v.string(), windowStart: v.number(), count: v.number() }).index("by_key", ["key"]),

  /** Append-only record of sensitive actions. Holds user ids and page numbers, never page text. */
  auditLog: defineTable({
    orgId: v.id("organizations"),
    actorId: v.string(),
    action: v.string(),
    detail: v.string(),
    at: v.number(),
  }).index("by_org_at", ["orgId", "at"]),
});
