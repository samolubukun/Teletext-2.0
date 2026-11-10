// Called by the Next.js route /api/ai/condense with the user's Convex auth token.
// Convex verifies the Hexclave JWT, checks the role and counts the request against the plan limit.
import { PLAN_LIMITS } from "@teletext/core";
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { fail, requireOrgAccess } from "./lib/access";

const HOUR = 60 * 60 * 1000;

export const authorize = mutation({
  args: { orgId: v.id("organizations") },
  returns: v.object({ publisher: v.string() }),
  handler: async (ctx, { orgId }) => {
    const { org } = await requireOrgAccess(ctx, orgId, "ai.use");
    const limit = PLAN_LIMITS[org.plan].aiRequestsPerHour;
    const recent = await ctx.db
      .query("aiUsage")
      .withIndex("by_org", (q) => q.eq("orgId", orgId).gt("_creationTime", Date.now() - HOUR))
      .take(limit + 1);
    if (recent.length >= limit) fail("rate_limit", `Your plan allows ${limit} AI drafts per hour. Try again later.`);
    await ctx.db.insert("aiUsage", { orgId });
    return { publisher: org.name };
  },
});
