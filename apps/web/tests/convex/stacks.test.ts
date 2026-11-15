/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

const modules = import.meta.glob(["../../convex/**/*.ts", "../../convex/**/*.js"]);
type T = ReturnType<typeof convexTest>;
const as = (t: T, subject: string) => t.withIdentity({ subject });
const stack: unknown = { version: 1, id: "results", title: "RESULTS", template: "lookup", startCard: "home", tables: { results: { columns: ["student_id", "pin_hash", "name"] } }, cards: [{ id: "home", page: 412, title: "RESULTS", blocks: [], fields: [{ id: "sid", label: "ID", type: "text", maxLength: 20 }, { id: "pin", label: "PIN", type: "secret", maxLength: 8 }], buttons: [{ key: "green", label: "LOOKUP", script: "lookup results by student_id = sid and pin_hash = pin into row" }] }] };

async function rejects(promise: Promise<unknown>, code: string) { await expect(promise).rejects.toThrow(new RegExp(code)); }

describe("Stage 2 stacks", () => {
  let t: T; let orgA: Id<"organizations">; let orgB: Id<"organizations">; let stackId: Id<"stacks">;
  beforeEach(async () => {
    t = convexTest(schema, modules);
    orgA = await as(t, "owner-a").mutation(api.orgs.create, { name: "Greenfield High" });
    orgB = await as(t, "owner-b").mutation(api.orgs.create, { name: "Lakeside Clinic" });
    await t.run(async (ctx) => { await ctx.db.insert("members", { orgId: orgA, userId: "editor-a", role: "editor" }); await ctx.db.insert("members", { orgId: orgA, userId: "viewer-a", role: "viewer" }); });
    stackId = await as(t, "owner-a").mutation(api.stacks.create, { orgId: orgA, name: "Exam", definition: stack, rows: [{ lookupId: "1001", pin: "1234", values: { name: "Ada" } }] });
  });

  it("enforces org roles and prevents cross-org access", async () => {
    expect((await as(t, "viewer-a").query(api.stacks.list, { orgId: orgA })).length).toBe(1);
    await rejects(as(t, "viewer-a").mutation(api.stacks.save, { stackId, definition: stack }), "forbidden");
    await rejects(as(t, "owner-b").query(api.stacks.list, { orgId: orgA }), "forbidden");
    await rejects(as(t, "outsider").query(api.stacks.list, { orgId: orgA }), "forbidden");
    expect(await as(t, "owner-b").query(api.stacks.list, { orgId: orgB })).toEqual([]);
  });

  it("returns only safe values after publish and hides failed or expired rows", async () => {
    expect(await t.mutation(api.stacks.lookup, { stackId, lookupId: "1001", pin: "1234", visitorHash: "ip-a" })).toMatchObject({ code: "not_found" });
    await as(t, "owner-a").mutation(api.stacks.publish, { stackId, expiresAt: Date.now() + 60_000 });
    expect(await t.mutation(api.stacks.lookup, { stackId, lookupId: "1001", pin: "wrong", visitorHash: "ip-a" })).toMatchObject({ code: "not_found" });
    expect(await t.mutation(api.stacks.lookup, { stackId, lookupId: "1001", pin: "1234", visitorHash: "ip-b" })).toEqual({ ok: true, values: { name: "Ada" } });
    const rows = await t.run(async (ctx) => ctx.db.query("lookupRows").collect());
    expect(JSON.stringify(rows)).not.toContain("1234");
    expect(rows[0]?.pinHash).toMatch(/^[0-9a-f]{64}$/);
    await t.run(async (ctx) => { await ctx.db.patch(stackId, { expiresAt: Date.now() - 1 }); });
    expect(await t.mutation(api.stacks.lookup, { stackId, lookupId: "1001", pin: "1234", visitorHash: "ip-c" })).toMatchObject({ code: "not_found" });
  });
});
