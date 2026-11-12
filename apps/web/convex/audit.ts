// Owner-only view of the audit log.
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireOrgAccess } from "./lib/access";

const MAX_LISTED = 100;

export const list = query({
  args: { orgId: v.id("organizations") },
  returns: v.array(v.object({ at: v.number(), action: v.string(), detail: v.string(), byYou: v.boolean(), by: v.string() })),
  handler: async (ctx, { orgId }) => {
    const { userId } = await requireOrgAccess(ctx, orgId, "members.manage");
    const rows = await ctx.db.query("auditLog").withIndex("by_org_at", (q) => q.eq("orgId", orgId)).order("desc").take(MAX_LISTED);
    const members = await ctx.db.query("members").withIndex("by_org", (q) => q.eq("orgId", orgId)).take(60);
    const labels = new Map(members.map((m) => [m.userId, m.label ?? `Member ...${m.userId.slice(-4)}`]));
    return rows.map((r) => ({
      at: r.at,
      action: r.action,
      detail: r.detail,
      byYou: r.actorId === userId,
      by: r.actorId === "scheduler" ? "Scheduler" : (labels.get(r.actorId) ?? "Former member"),
    }));
  },
});
