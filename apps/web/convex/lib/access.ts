// Authorization for org-scoped functions. Convex has no row-level security, so every
// org-scoped query and mutation calls requireOrgAccess with the action it performs.
import { can, type Action, type Role } from "@teletext/core";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

export function fail(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

export async function requireUserId(ctx: { auth: QueryCtx["auth"] }): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) fail("unauthenticated", "Please sign in first.");
  return identity.subject;
}

export async function membership(ctx: Ctx, orgId: Id<"organizations">, userId: string): Promise<Doc<"members"> | null> {
  return await ctx.db
    .query("members")
    .withIndex("by_org_user", (q) => q.eq("orgId", orgId).eq("userId", userId))
    .unique();
}

export type OrgAccess = { userId: string; role: Role; org: Doc<"organizations"> };

export async function requireOrgAccess(ctx: Ctx, orgId: Id<"organizations">, action: Action): Promise<OrgAccess> {
  const userId = await requireUserId(ctx);
  const member = await membership(ctx, orgId, userId);
  // Same message for "not a member" and "not allowed", so outsiders learn nothing.
  if (!member || !can(member.role, action)) fail("forbidden", "You do not have permission to do that.");
  const org = await ctx.db.get(orgId);
  if (!org) fail("not_found", "Organization not found.");
  return { userId, role: member.role, org };
}

export async function requirePageAccess(ctx: Ctx, pageId: Id<"pages">, action: Action) {
  const page = await ctx.db.get(pageId);
  if (!page) fail("not_found", "Page not found.");
  const access = await requireOrgAccess(ctx, page.orgId, action);
  return { ...access, page };
}
