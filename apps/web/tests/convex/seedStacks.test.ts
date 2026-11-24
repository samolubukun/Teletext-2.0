/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { demoStacks } from "../../convex/lib/demoStacks";

const modules = import.meta.glob(["../../convex/**/*.ts", "../../convex/**/*.js"]);

describe("Greenfield High demo stacks", () => {
  it("every demo definition passes the schema and validator", () => {
    expect(() => demoStacks()).not.toThrow();
    expect(demoStacks().map((s) => s.definition.template)).toEqual(["lookup", "form", "quiz"]);
  });

  it("seeds three published stacks, once, and keeps them after claimDemo", async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(internal.seed.run, {});
    expect(first.stacks).toBe(3);
    expect((await t.mutation(internal.seed.run, {})).stacks).toBe(0);

    await t.mutation(internal.seed.claimDemo, { userId: "judge-1" });
    const orgId = await t.run(async (ctx) => (await ctx.db.query("organizations").withIndex("by_slug", (q) => q.eq("slug", "greenfield-high")).unique())?._id);
    expect(orgId).toBeDefined();
    const stacks = await t.run(async (ctx) => (orgId ? ctx.db.query("stacks").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect() : []));
    expect(stacks.map((s) => s.name).sort()).toEqual(["Parent Inquiry & Absence Form", "School Library Trivia Quiz", "Term 1 Exam Results Lookup"]);
    expect(stacks.every((s) => s.published)).toBe(true);
  });

  it("serves the seeded lookup rows and shows the seeded inbox", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.run, {});
    const stacks = await t.run(async (ctx) => ctx.db.query("stacks").collect());
    const lookup = stacks.find((s) => s.name.startsWith("Term 1"));
    const form = stacks.find((s) => s.name.startsWith("Parent"));
    if (!lookup || !form) throw new Error("Seeded stacks are missing.");
    expect(await t.mutation(api.stacks.lookup, { stackId: lookup._id, lookupId: "1001", pin: "1234", visitorHash: "v1" })).toEqual({ ok: true, values: { name: "Ada Bello", grade: "A", score: "92%", remarks: "Distinction in Sciences" } });
    expect(await t.mutation(api.stacks.lookup, { stackId: lookup._id, lookupId: "1001", pin: "0000", visitorHash: "v2" })).toMatchObject({ ok: false, code: "not_found" });
    const rows = await t.run(async (ctx) => ctx.db.query("lookupRows").collect());
    expect(rows).toHaveLength(3);
    expect(JSON.stringify(rows)).not.toContain("1234");
    const inbox = await t.run(async (ctx) => ctx.db.query("submissions").withIndex("by_stack", (q) => q.eq("stackId", form._id)).collect());
    expect(inbox.map((s) => [s.reference, s.status]).sort()).toEqual([["TT-3C7E81", "done"], ["TT-9A4F12", "open"]]);
  });
});
