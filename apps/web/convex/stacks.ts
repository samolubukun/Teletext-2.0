// Stage 2 stack persistence and the narrow public lookup boundary.
import { stackSchema, validateStack, type Stack } from "../../../packages/stacks/src/index";
import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { fail, requireOrgAccess } from "./lib/access";
import { hit, isOverLimit } from "./lib/rateLimit";

const enabled = () => process.env.STACKS_ENABLED !== "false";
function requireEnabled(): void { if (!enabled()) fail("disabled", "Stacks are not enabled."); }

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const rowInput = v.object({ lookupId: v.string(), pin: v.string(), values: v.any() });
const stackView = v.object({ stackId: v.id("stacks"), name: v.string(), published: v.boolean(), expiresAt: v.optional(v.number()), version: v.number(), updatedAt: v.number() });

function checkedDefinition(definition: unknown): Stack {
  const parsed = stackSchema.safeParse(definition);
  if (!parsed.success) fail("invalid_stack", "The stack definition is invalid.");
  const diagnostics = validateStack(parsed.data);
  if (diagnostics.length > 0) fail("invalid_stack", diagnostics[0]?.message ?? "The stack definition is invalid.");
  return parsed.data;
}

export const create = mutation({
  args: { orgId: v.id("organizations"), name: v.string(), definition: v.any(), rows: v.optional(v.array(rowInput)) },
  returns: v.id("stacks"),
  handler: async (ctx, { orgId, name, definition, rows }) => {
    requireEnabled();
    const { userId } = await requireOrgAccess(ctx, orgId, "page.write");
    const stack = checkedDefinition(definition);
    const existing = await ctx.db.query("stacks").withIndex("by_org_name", (q) => q.eq("orgId", orgId).eq("name", name)).first();
    if (existing) fail("taken", "A stack with that name already exists.");
    const stackId = await ctx.db.insert("stacks", { orgId, name: name.trim().slice(0, 80), published: false, updatedAt: Date.now() });
    const versionId = await ctx.db.insert("stackVersions", { stackId, version: 1, definition: stack, createdBy: userId, createdAt: Date.now() });
    await ctx.db.patch(stackId, { currentVersionId: versionId });
    if (rows) await saveRows(ctx, stackId, versionId, rows);
    return stackId;
  },
});

export const save = mutation({
  args: { stackId: v.id("stacks"), definition: v.any(), rows: v.optional(v.array(rowInput)) },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, { stackId, definition, rows }) => {
    requireEnabled();
    const stack = await ctx.db.get(stackId);
    if (!stack) fail("not_found", "Stack not found.");
    const { userId } = await requireOrgAccess(ctx, stack.orgId, "page.write");
    const parsed = checkedDefinition(definition);
    const latest = await ctx.db.query("stackVersions").withIndex("by_stack_version", (q) => q.eq("stackId", stackId)).order("desc").first();
    const version = (latest?.version ?? 0) + 1;
    const versionId = await ctx.db.insert("stackVersions", { stackId, version, definition: parsed, createdBy: userId, createdAt: Date.now() });
    await ctx.db.patch(stackId, { currentVersionId: versionId, published: false, updatedAt: Date.now() });
    if (rows) await saveRows(ctx, stackId, versionId, rows);
    return { version };
  },
});

export const list = query({
  args: { orgId: v.id("organizations") },
  returns: v.array(stackView),
  handler: async (ctx, { orgId }) => {
    requireEnabled();
    await requireOrgAccess(ctx, orgId, "page.read");
    const stacks = await ctx.db.query("stacks").withIndex("by_org", (q) => q.eq("orgId", orgId)).take(100);
    const result: Array<{ stackId: Id<"stacks">; name: string; published: boolean; expiresAt?: number; version: number; updatedAt: number }> = [];
    for (const stack of stacks) {
      const version = stack.currentVersionId ? await ctx.db.get(stack.currentVersionId) : null;
      result.push({ stackId: stack._id, name: stack.name, published: stack.published, ...(stack.expiresAt === undefined ? {} : { expiresAt: stack.expiresAt }), version: version?.version ?? 0, updatedAt: stack.updatedAt });
    }
    return result;
  },
});

export const publish = mutation({
  args: { stackId: v.id("stacks"), expiresAt: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { stackId, expiresAt }) => {
    requireEnabled();
    const stack = await ctx.db.get(stackId);
    if (!stack) fail("not_found", "Stack not found.");
    await requireOrgAccess(ctx, stack.orgId, "page.publish");
    if (!stack.currentVersionId) fail("invalid_stack", "Save the stack before publishing.");
    if (expiresAt !== undefined && expiresAt <= Date.now()) fail("invalid_expiry", "Expiry must be in the future.");
    await ctx.db.patch(stackId, { published: true, ...(expiresAt === undefined ? {} : { expiresAt }), updatedAt: Date.now() });
    return null;
  },
});

async function saveRows(ctx: MutationCtx, stackId: Id<"stacks">, versionId: Id<"stackVersions">, rows: Array<{ lookupId: string; pin: string; values: unknown }>): Promise<void> {
  for (const row of rows.slice(0, 500)) {
    await ctx.db.insert("lookupRows", { stackId, versionId, table: "results", lookupIdHash: await hash(row.lookupId.trim()), pinHash: await hash(row.pin), values: row.values });
  }
}

const lookupResult = v.union(v.object({ ok: v.literal(true), values: v.any() }), v.object({ ok: v.literal(false), code: v.union(v.literal("not_found"), v.literal("rate")), message: v.string() }));
const LOOKUP_MESSAGE = "The details could not be found.";
const WINDOW_MS = 10 * 60_000;

export const lookup = mutation({
  args: { stackId: v.id("stacks"), lookupId: v.string(), pin: v.string(), visitorHash: v.string() },
  returns: lookupResult,
  handler: async (ctx, { stackId, lookupId, pin, visitorHash }) => {
    requireEnabled();
    const stack = await ctx.db.get(stackId);
    if (!stack || !stack.published || (stack.expiresAt !== undefined && stack.expiresAt <= Date.now())) return { ok: false as const, code: "not_found" as const, message: LOOKUP_MESSAGE };
    const idHash = await hash(lookupId.trim());
    const idKey = `stack:${stackId}:id:${idHash}`;
    const ipKey = `stack:${stackId}:ip:${visitorHash.slice(0, 128)}`;
    if (await isOverLimit(ctx, idKey, 5, WINDOW_MS) || await isOverLimit(ctx, ipKey, 5, WINDOW_MS)) return { ok: false as const, code: "rate" as const, message: "Too many attempts. Please try again later." };
    const row = await ctx.db.query("lookupRows").withIndex("by_stack_lookup", (q) => q.eq("stackId", stackId).eq("table", "results").eq("lookupIdHash", idHash)).first();
    const pinHash = await hash(pin);
    if (!row || row.pinHash !== pinHash) {
      await hit(ctx, idKey, 5, WINDOW_MS);
      await hit(ctx, ipKey, 5, WINDOW_MS);
      return { ok: false as const, code: "not_found" as const, message: LOOKUP_MESSAGE };
    }
    return { ok: true as const, values: row.values };
  },
});

export const lookupRow = internalQuery({
  args: { stackId: v.id("stacks"), lookupIdHash: v.string() },
  returns: v.union(v.null(), v.object({ pinHash: v.string(), values: v.any() })),
  handler: async (ctx, { stackId, lookupIdHash }) => {
    const row = await ctx.db.query("lookupRows").withIndex("by_stack_lookup", (q) => q.eq("stackId", stackId).eq("table", "results").eq("lookupIdHash", lookupIdHash)).first();
    return row ? { pinHash: row.pinHash, values: row.values } : null;
  },
});

/** Public metadata and card definition for a published stack. Lookup rows are never returned. */
export const published = query({
  args: { stackId: v.id("stacks") },
  returns: v.union(v.null(), v.object({ stackId: v.id("stacks"), name: v.string(), definition: v.any(), expiresAt: v.optional(v.number()) })),
  handler: async (ctx, { stackId }) => {
    requireEnabled();
    const stack = await ctx.db.get(stackId);
    if (!stack || !stack.published) return null;
    const version = stack.currentVersionId ? await ctx.db.get(stack.currentVersionId) : null;
    return version ? { stackId: stack._id, name: stack.name, definition: version.definition, expiresAt: stack.expiresAt } : null;
  },
});

export const get = query({
  args: { stackId: v.id("stacks") },
  returns: v.object({ stackId: v.id("stacks"), orgId: v.id("organizations"), name: v.string(), published: v.boolean(), definition: v.any(), version: v.number() }),
  handler: async (ctx, { stackId }) => {
    requireEnabled();
    const stack = await ctx.db.get(stackId);
    if (!stack) fail("not_found", "Stack not found.");
    await requireOrgAccess(ctx, stack.orgId, "page.read");
    const version = stack.currentVersionId ? await ctx.db.get(stack.currentVersionId) : null;
    if (!version) fail("invalid_stack", "Stack has no saved definition.");
    return { stackId: stack._id, orgId: stack.orgId, name: stack.name, published: stack.published, definition: version.definition, version: version.version };
  },
});
