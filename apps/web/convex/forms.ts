// Server-side form effects for Stage 2. The browser receives only a reference, never the inbox.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { fail, requireOrgAccess } from "./lib/access";
import { hit, isOverLimit } from "./lib/rateLimit";

const formResult = v.object({ ok: v.literal(true), reference: v.string() });
const WINDOW = 10 * 60_000;

function reference(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `TT-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export const submit = mutation({
  args: { stackId: v.id("stacks"), formId: v.string(), fields: v.record(v.string(), v.string()), visitorHash: v.string() },
  returns: formResult,
  handler: async (ctx, { stackId, formId, fields, visitorHash }) => {
    const stack = await ctx.db.get(stackId);
    if (!stack || !stack.published || (stack.expiresAt !== undefined && stack.expiresAt <= Date.now())) fail("not_found", "This form is not available.");
    if (!/^[0-9a-f]{16,64}$/.test(visitorHash)) fail("invalid", "This form could not be checked.");
    const key = `form:${stackId}:${visitorHash}`;
    if (await isOverLimit(ctx, key, 5, WINDOW)) fail("rate", "Too many submissions. Please try again later.");
    await hit(ctx, key, 5, WINDOW);
    const clean = Object.fromEntries(Object.entries(fields).slice(0, 6).map(([k, value]) => [k.slice(0, 40), value.slice(0, 300)]));
    const ref = reference();
    await ctx.db.insert("submissions", { stackId, formId: formId.slice(0, 40), fields: clean, reference: ref, status: "open", createdAt: Date.now() });
    return { ok: true as const, reference: ref };
  },
});

export const list = query({
  args: { stackId: v.id("stacks") },
  returns: v.array(v.object({ submissionId: v.id("submissions"), formId: v.string(), fields: v.any(), reference: v.string(), status: v.union(v.literal("open"), v.literal("done")), createdAt: v.number() })),
  handler: async (ctx, { stackId }) => {
    const stack = await ctx.db.get(stackId);
    if (!stack) fail("not_found", "Stack not found.");
    await requireOrgAccess(ctx, stack.orgId, "page.read");
    const rows = await ctx.db.query("submissions").withIndex("by_stack", (q) => q.eq("stackId", stackId)).order("desc").take(100);
    return rows.map((row) => ({ submissionId: row._id, formId: row.formId, fields: row.fields, reference: row.reference, status: row.status, createdAt: row.createdAt }));
  },
});

export const markDone = mutation({
  args: { submissionId: v.id("submissions") },
  returns: v.null(),
  handler: async (ctx, { submissionId }) => {
    const row = await ctx.db.get(submissionId);
    if (!row) fail("not_found", "Submission not found.");
    const stack = await ctx.db.get(row.stackId);
    if (!stack) fail("not_found", "Stack not found.");
    await requireOrgAccess(ctx, stack.orgId, "page.write");
    await ctx.db.patch(submissionId, { status: "done" });
    return null;
  },
});
