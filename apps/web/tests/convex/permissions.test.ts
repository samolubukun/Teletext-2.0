/// <reference types="vite/client" />
// Permission scenarios (publisher-dashboard D3, security rules): two organizations, owner / editor /
// viewer in org A, one outsider. Fake user ids only.
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

const modules = import.meta.glob(["../../convex/**/*.ts", "../../convex/**/*.js"]);

type T = ReturnType<typeof convexTest>;

const asOwner = (t: T) => t.withIdentity({ subject: "user_owner_a" });
const asEditor = (t: T) => t.withIdentity({ subject: "user_editor_a" });
const asViewer = (t: T) => t.withIdentity({ subject: "user_viewer_a" });
const asOutsider = (t: T) => t.withIdentity({ subject: "user_outsider" });
const asOwnerB = (t: T) => t.withIdentity({ subject: "user_owner_b" });

async function rejectsWith(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toThrow(new RegExp(code));
}

describe("convex permissions", () => {
  let t: T;
  let orgA: Id<"organizations">;
  let orgB: Id<"organizations">;
  let pageA: Id<"pages">;

  beforeEach(async () => {
    t = convexTest(schema, modules);
    orgA = await asOwner(t).mutation(api.orgs.create, { name: "Greenfield High" });
    orgB = await asOwnerB(t).mutation(api.orgs.create, { name: "Lakeside Clinic" });
    await t.run(async (ctx) => {
      await ctx.db.insert("members", { orgId: orgA, userId: "user_editor_a", role: "editor" });
      await ctx.db.insert("members", { orgId: orgA, userId: "user_viewer_a", role: "viewer" });
    });
    const org = await asOwner(t).query(api.orgs.get, { orgId: orgA });
    pageA = await asOwner(t).mutation(api.pages.create, { orgId: orgA, number: org.rangeStart, title: "Term dates" });
  });

  it("allocates non-overlapping ranges to the two organizations", async () => {
    const a = await asOwner(t).query(api.orgs.get, { orgId: orgA });
    const b = await asOwnerB(t).query(api.orgs.get, { orgId: orgB });
    expect(a.rangeEnd < b.rangeStart || b.rangeEnd < a.rangeStart).toBe(true);
  });

  it("signed-out callers are rejected", async () => {
    await rejectsWith(t.query(api.pages.list, { orgId: orgA }), "unauthenticated");
    await rejectsWith(t.mutation(api.pages.create, { orgId: orgA, number: 200, title: "x" }), "unauthenticated");
  });

  it("an outsider cannot read, write or publish in org A", async () => {
    await rejectsWith(asOutsider(t).query(api.pages.list, { orgId: orgA }), "forbidden");
    await rejectsWith(asOutsider(t).query(api.pages.get, { pageId: pageA }), "forbidden");
    await rejectsWith(asOutsider(t).query(api.orgs.get, { orgId: orgA }), "forbidden");
    await rejectsWith(asOutsider(t).mutation(api.pages.save, { pageId: pageA, blocks: [], fastext: [] }), "forbidden");
    await rejectsWith(asOutsider(t).mutation(api.pages.setStatus, { pageId: pageA, to: "published" }), "forbidden");
  });

  it("the owner of org B cannot touch org A", async () => {
    await rejectsWith(asOwnerB(t).query(api.pages.list, { orgId: orgA }), "forbidden");
    await rejectsWith(asOwnerB(t).mutation(api.pages.setLive, { pageId: pageA, isLive: true }), "forbidden");
    await rejectsWith(asOwnerB(t).mutation(api.orgs.changePlan, { orgId: orgA, plan: "pro" }), "forbidden");
  });

  it("a viewer can read but cannot write, publish or change the plan", async () => {
    expect(await asViewer(t).query(api.pages.list, { orgId: orgA })).toHaveLength(1);
    const detail = await asViewer(t).query(api.pages.get, { pageId: pageA });
    expect(detail.canWrite).toBe(false);
    await rejectsWith(asViewer(t).mutation(api.pages.create, { orgId: orgA, number: detail.number + 1, title: "x" }), "forbidden");
    await rejectsWith(asViewer(t).mutation(api.pages.save, { pageId: pageA, blocks: [], fastext: [] }), "forbidden");
    await rejectsWith(asViewer(t).mutation(api.pages.setStatus, { pageId: pageA, to: "published" }), "forbidden");
    await rejectsWith(asViewer(t).mutation(api.pages.setLive, { pageId: pageA, isLive: true }), "forbidden");
    await rejectsWith(asViewer(t).mutation(api.orgs.changePlan, { orgId: orgA, plan: "pro" }), "forbidden");
  });

  it("an editor can write and publish but cannot change the plan", async () => {
    const detail = await asEditor(t).query(api.pages.get, { pageId: pageA });
    const result = await asEditor(t).mutation(api.pages.save, {
      pageId: pageA,
      blocks: [{ type: "heading", level: 1, text: "TERM DATES" }, { type: "paragraph", text: "School opens on Mon 12 Nov." }],
      fastext: detail.fastext,
    });
    expect(result.errors).toBe(0);
    await asEditor(t).mutation(api.pages.setStatus, { pageId: pageA, to: "published" });
    await rejectsWith(asEditor(t).mutation(api.orgs.changePlan, { orgId: orgA, plan: "pro" }), "forbidden");
  });

  it("the owner can publish and change the plan; the public sees only published pages", async () => {
    const before = await t.query(api.public.page, { number: (await asOwner(t).query(api.pages.get, { pageId: pageA })).number });
    expect(before).toBeNull();
    await asOwner(t).mutation(api.pages.setStatus, { pageId: pageA, to: "published" });
    await asOwner(t).mutation(api.orgs.changePlan, { orgId: orgA, plan: "pro" });
    const { number } = await asOwner(t).query(api.pages.get, { pageId: pageA });
    expect(await t.query(api.public.page, { number })).not.toBeNull();
  });

  it("page numbers are unique and must be inside the organization's range", async () => {
    const { number, rangeEnd } = await asOwner(t).query(api.pages.get, { pageId: pageA });
    await rejectsWith(asOwner(t).mutation(api.pages.create, { orgId: orgA, number, title: "dup" }), "taken");
    await rejectsWith(asOwner(t).mutation(api.pages.create, { orgId: orgA, number: rangeEnd + 1, title: "out" }), "range");
  });

  it("the free plan limits published pages", async () => {
    const org = await asOwner(t).query(api.orgs.get, { orgId: orgA });
    const limit = org.limits.publishedPages;
    let last: Id<"pages"> | null = null;
    for (let i = 0; i <= limit; i++) {
      const id: Id<"pages"> = i === 0 ? pageA : await asOwner(t).mutation(api.pages.create, { orgId: orgA, number: org.rangeStart + i, title: `P${i}` });
      last = id;
      if (i < limit) await asOwner(t).mutation(api.pages.setStatus, { pageId: id, to: "published" });
    }
    if (!last) throw new Error("no page created");
    await rejectsWith(asOwner(t).mutation(api.pages.setStatus, { pageId: last, to: "published" }), "plan_limit");
  });
});
