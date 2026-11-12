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

  describe("version history (D5)", () => {
    const first = [{ type: "heading", level: 1, text: "TERM DATES" }, { type: "paragraph", text: "School opens on Mon 12 Nov." }];
    const second = [{ type: "heading", level: 1, text: "TERM DATES" }, { type: "paragraph", text: "School opens on Tue 13 Nov." }];

    async function twoSaves() {
      const detail = await asOwner(t).query(api.pages.get, { pageId: pageA });
      const a = await asOwner(t).mutation(api.pages.save, { pageId: pageA, blocks: first, fastext: detail.fastext });
      const b = await asOwner(t).mutation(api.pages.save, { pageId: pageA, blocks: second, fastext: detail.fastext });
      return { detail, a, b };
    }

    it("D5: restoring version N makes the page content exactly the content of version N, as a new version", async () => {
      const { a, b } = await twoSaves();
      const restored = await asEditor(t).mutation(api.pages.restore, { pageId: pageA, version: a.version });
      expect(restored.version).toBe(b.version + 1);
      expect(restored.blocks).toEqual(first);
      const now = await asOwner(t).query(api.pages.get, { pageId: pageA });
      expect(now.blocks).toEqual(first);
      expect(now.version).toBe(b.version + 1);
      const list = await asOwner(t).query(api.pages.versions, { pageId: pageA });
      expect(list[0]).toMatchObject({ version: b.version + 1, isCurrent: true });
      expect(list.filter((v) => v.isCurrent)).toHaveLength(1);
      // History is never rewritten: the old versions are all still there.
      expect(list.map((v) => v.version)).toContain(a.version);
      expect(list.map((v) => v.version)).toContain(b.version);
    });

    it("a published page shows the restored content to the public", async () => {
      const { a } = await twoSaves();
      await asOwner(t).mutation(api.pages.setStatus, { pageId: pageA, to: "published" });
      const { number } = await asOwner(t).query(api.pages.get, { pageId: pageA });
      await asOwner(t).mutation(api.pages.restore, { pageId: pageA, version: a.version });
      const pub = await t.query(api.public.page, { number });
      expect(JSON.stringify(pub?.pages)).toContain("Mon 12 Nov");
      expect(JSON.stringify(pub?.pages)).not.toContain("Tue 13 Nov");
    });

    it("viewers and outsiders can neither restore nor (outsiders) list versions", async () => {
      const { a } = await twoSaves();
      await rejectsWith(asViewer(t).mutation(api.pages.restore, { pageId: pageA, version: a.version }), "forbidden");
      await rejectsWith(asOutsider(t).mutation(api.pages.restore, { pageId: pageA, version: a.version }), "forbidden");
      await rejectsWith(asOwnerB(t).mutation(api.pages.restore, { pageId: pageA, version: a.version }), "forbidden");
      await rejectsWith(asOutsider(t).query(api.pages.versions, { pageId: pageA }), "forbidden");
      expect(await asViewer(t).query(api.pages.versions, { pageId: pageA })).not.toHaveLength(0);
    });

    it("an unknown version number is rejected, and a version of another page cannot be restored", async () => {
      await twoSaves();
      await rejectsWith(asOwner(t).mutation(api.pages.restore, { pageId: pageA, version: 999 }), "not_found");
      const orgRow = await asOwner(t).query(api.orgs.get, { orgId: orgA });
      const other = await asOwner(t).mutation(api.pages.create, { orgId: orgA, number: orgRow.rangeStart + 1, title: "Other" });
      // Page A has 3 versions (create + 2 saves). Give the other page 6, so version 6 exists ONLY on the other page.
      let latestOther = 0;
      for (let i = 0; i < 5; i++) latestOther = (await asOwner(t).mutation(api.pages.save, { pageId: other, blocks: first, fastext: [] })).version;
      expect(latestOther).toBe(6);
      const versionsOfA = (await asOwner(t).query(api.pages.versions, { pageId: pageA })).map((v) => v.version);
      expect(versionsOfA).not.toContain(latestOther);
      await rejectsWith(asOwner(t).mutation(api.pages.restore, { pageId: pageA, version: latestOther }), "not_found");
    });
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
