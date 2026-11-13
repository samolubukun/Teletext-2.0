// Fixed-window rate limit for public writes. One row per key; the row is reset when its window ends.
import { registerHit, withinLimit } from "@teletext/core";
import type { MutationCtx } from "../_generated/server";

/** Registers a hit and returns true when it is within `limit` hits per `windowMs`. */
export async function hit(ctx: MutationCtx, key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const row = await ctx.db.query("rateLimits").withIndex("by_key", (q) => q.eq("key", key)).unique();
  const next = registerHit(row ? { windowStart: row.windowStart, count: row.count } : null, now, windowMs);
  if (row) await ctx.db.patch(row._id, next);
  else await ctx.db.insert("rateLimits", { key, ...next });
  return withinLimit(next, limit);
}

/** True when `key` has already used up `limit` hits in the current period. Reads only, so it can be used before work that may fail. */
export async function isOverLimit(ctx: MutationCtx, key: string, limit: number, windowMs: number): Promise<boolean> {
  const row = await ctx.db.query("rateLimits").withIndex("by_key", (q) => q.eq("key", key)).unique();
  if (!row || !(Date.now() - row.windowStart < windowMs)) return false;
  return row.count >= limit;
}
