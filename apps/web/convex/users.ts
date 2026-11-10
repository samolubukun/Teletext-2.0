import { query } from "./_generated/server";
import { v } from "convex/values";

/** Returns the signed-in Hexclave user as Convex sees it, or null. Used to verify auth wiring. */
export const whoami = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ subject: v.string(), email: v.optional(v.string()) }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return { subject: identity.subject, email: identity.email };
  },
});
