// Team management: one-time invite codes, role changes, removal.
// Only owners manage the team (permission "members.manage"). Invite codes are random, single use,
// expire after 7 days, and only their SHA-256 hash is stored.
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { fail, requireOrgAccess, requireUserId } from "./lib/access";

const assignableRole = v.union(v.literal("editor"), v.literal("viewer"));
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_OPEN_INVITES = 10;
const MAX_MEMBERS = 25;
// No 0/O/1/I/L, so a code read aloud or typed from a screenshot is hard to get wrong.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 12;
/** One message for unknown, used, revoked and expired codes, so a guesser learns nothing. */
const INVALID_INVITE = "This invite code is not valid. Ask the owner for a new one.";

function newCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

/** "abcd-efgh-jkmn" and "ABCDEFGHJKMN" are the same code. */
function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function hashCode(normalized: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Owner view: members (no user ids) and unused invites. Expiry is shown by the client, not filtered here. */
export const list = query({
  args: { orgId: v.id("organizations") },
  returns: v.object({
    members: v.array(
      v.object({
        memberId: v.id("members"),
        label: v.string(),
        role: v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer")),
        isYou: v.boolean(),
      }),
    ),
    invites: v.array(
      v.object({
        inviteId: v.id("invites"),
        role: assignableRole,
        expiresAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx, { orgId }) => {
    const { userId } = await requireOrgAccess(ctx, orgId, "members.manage");
    const members = await ctx.db.query("members").withIndex("by_org", (q) => q.eq("orgId", orgId)).take(MAX_MEMBERS + 5);
    const invites = await ctx.db.query("invites").withIndex("by_org", (q) => q.eq("orgId", orgId)).take(MAX_OPEN_INVITES + 5);
    return {
      members: members.map((m) => ({
        memberId: m._id,
        label: m.label ?? `Member ...${m.userId.slice(-4)}`,
        role: m.role,
        isYou: m.userId === userId,
      })),
      invites: invites.map((i) => ({ inviteId: i._id, role: i.role, expiresAt: i.expiresAt })),
    };
  },
});

/** Returns the plain code ONCE. It cannot be read again; lost codes are revoked and re-created. */
export const createInvite = mutation({
  args: { orgId: v.id("organizations"), role: assignableRole },
  returns: v.object({ code: v.string(), expiresAt: v.number() }),
  handler: async (ctx, { orgId, role }) => {
    const { userId } = await requireOrgAccess(ctx, orgId, "members.manage");
    const open = await ctx.db.query("invites").withIndex("by_org", (q) => q.eq("orgId", orgId)).take(MAX_OPEN_INVITES + 1);
    if (open.length >= MAX_OPEN_INVITES) fail("limit", `You can have at most ${MAX_OPEN_INVITES} open invites. Revoke one first.`);
    const code = newCode();
    const expiresAt = Date.now() + INVITE_TTL_MS;
    await ctx.db.insert("invites", { orgId, role, codeHash: await hashCode(normalizeCode(code)), createdBy: userId, expiresAt });
    return { code, expiresAt };
  },
});

export const revokeInvite = mutation({
  args: { inviteId: v.id("invites") },
  returns: v.null(),
  handler: async (ctx, { inviteId }) => {
    const invite = await ctx.db.get(inviteId);
    if (!invite) fail("not_found", "Invite not found.");
    await requireOrgAccess(ctx, invite.orgId, "members.manage");
    await ctx.db.delete(inviteId);
    return null;
  },
});

/** Any signed-in user can redeem a valid code. The invite is deleted, so a code works once. */
export const acceptInvite = mutation({
  args: { code: v.string() },
  returns: v.object({ orgId: v.id("organizations"), orgName: v.string() }),
  handler: async (ctx, { code }) => {
    const userId = await requireUserId(ctx);
    const normalized = normalizeCode(code);
    if (normalized.length !== CODE_LENGTH) fail("invalid_invite", INVALID_INVITE);
    const codeHash = await hashCode(normalized);
    const invite = await ctx.db.query("invites").withIndex("by_codeHash", (q) => q.eq("codeHash", codeHash)).unique();
    if (!invite || invite.expiresAt < Date.now()) fail("invalid_invite", INVALID_INVITE);
    const org = await ctx.db.get(invite.orgId);
    if (!org) fail("invalid_invite", INVALID_INVITE);

    const already = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) => q.eq("orgId", invite.orgId).eq("userId", userId))
      .unique();
    if (already) fail("already_member", `You are already in ${org.name}.`);
    const count = (await ctx.db.query("members").withIndex("by_org", (q) => q.eq("orgId", invite.orgId)).take(MAX_MEMBERS + 1)).length;
    if (count >= MAX_MEMBERS) fail("limit", "This team is full.");

    const identity = await ctx.auth.getUserIdentity();
    const label = (identity?.name ?? identity?.email ?? "").trim().slice(0, 80);
    await ctx.db.insert("members", { orgId: invite.orgId, userId, role: invite.role, ...(label ? { label } : {}) });
    await ctx.db.delete(invite._id);
    return { orgId: org._id, orgName: org.name };
  },
});

async function requireManageableMember(ctx: MutationCtx, memberId: Id<"members">) {
  const member = await ctx.db.get(memberId);
  if (!member) fail("not_found", "Member not found.");
  await requireOrgAccess(ctx, member.orgId, "members.manage");
  // Owners are never changed or removed here, so an organization can never end up without one.
  if (member.role === "owner") fail("owner", "Owners cannot be changed or removed.");
  return member;
}

export const setRole = mutation({
  args: { memberId: v.id("members"), role: assignableRole },
  returns: v.null(),
  handler: async (ctx, { memberId, role }) => {
    const member = await requireManageableMember(ctx, memberId);
    await ctx.db.patch(member._id, { role });
    return null;
  },
});

export const removeMember = mutation({
  args: { memberId: v.id("members") },
  returns: v.null(),
  handler: async (ctx, { memberId }) => {
    const member = await requireManageableMember(ctx, memberId);
    await ctx.db.delete(member._id);
    return null;
  },
});
