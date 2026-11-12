/// <reference types="vite/client" />
// Live data sources (data-connectors C7-C9). The network is a stub; no real site is contacted.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

const modules = import.meta.glob(["../../convex/**/*.ts", "../../convex/**/*.js"]);
type T = ReturnType<typeof convexTest>;

const as = (t: T, subject: string) => t.withIdentity({ subject });
const rejects = (p: Promise<unknown>, code: string) => expect(p).rejects.toThrow(new RegExp(code));
const SHEET = "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit?usp=sharing";

function respond(body: string, init: ResponseInit = {}) {
  return new Response(body, { status: 200, ...init });
}

describe("data sources", () => {
  let t: T;
  let orgA: Id<"organizations">;
  let orgB: Id<"organizations">;
  let pageId: Id<"pages">;
  let otherPageId: Id<"pages">;
  let fetchStub: ReturnType<typeof vi.fn>;

  const settle = async () => {
    await vi.advanceTimersByTimeAsync(1000);
    await t.finishInProgressScheduledFunctions();
  };
  const sourceOf = (id: Id<"pages">) => as(t, "owner_a").query(api.dataSources.forPage, { pageId: id });
  const version = async (id: Id<"pages">) => (await as(t, "owner_a").query(api.pages.get, { pageId: id }));

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T10:00:00Z"));
    fetchStub = vi.fn();
    vi.stubGlobal("fetch", fetchStub);
    t = convexTest(schema, modules);
    orgA = await as(t, "owner_a").mutation(api.orgs.create, { name: "Metro Bus Union" });
    orgB = await as(t, "owner_b").mutation(api.orgs.create, { name: "Lakeside Clinic" });
    const nums = await as(t, "owner_a").query(api.pages.freeNumbers, { orgId: orgA });
    pageId = await as(t, "owner_a").mutation(api.pages.create, { orgId: orgA, number: nums[0]!, title: "Bus times" });
    const numsB = await as(t, "owner_b").query(api.pages.freeNumbers, { orgId: orgB });
    otherPageId = await as(t, "owner_b").mutation(api.pages.create, { orgId: orgB, number: numsB[0]!, title: "Clinic days" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const pro = () => as(t, "owner_a").mutation(api.orgs.changePlan, { orgId: orgA, plan: "pro" });

  describe("linking (C7)", () => {
    it("C7: the free plan cannot link a source", async () => {
      await rejects(as(t, "owner_a").mutation(api.dataSources.link, { pageId, kind: "sheet", url: SHEET }), "plan_limit");
    });

    it("C7: bad addresses are refused before anything is stored", async () => {
      await pro();
      for (const url of ["http://example.com/feed", "https://127.0.0.1/x", "https://metadata.google.internal/", "not a url"]) {
        await rejects(as(t, "owner_a").mutation(api.dataSources.link, { pageId, kind: "rss", url }), "invalid_url");
      }
      await rejects(as(t, "owner_a").mutation(api.dataSources.link, { pageId, kind: "sheet", url: "https://example.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz" }), "invalid_url");
      expect(await sourceOf(pageId)).toBeNull();
      expect(fetchStub).not.toHaveBeenCalled();
    });

    it("C7: outsiders and another organization cannot link or read a source", async () => {
      await pro();
      await rejects(as(t, "owner_b").mutation(api.dataSources.link, { pageId, kind: "sheet", url: SHEET }), "forbidden");
      await rejects(as(t, "stranger").mutation(api.dataSources.link, { pageId, kind: "sheet", url: SHEET }), "forbidden");
      await rejects(as(t, "owner_b").query(api.dataSources.forPage, { pageId }), "forbidden");
      void otherPageId;
    });

    it("C7: a viewer cannot link", async () => {
      await pro();
      const { code } = await as(t, "owner_a").mutation(api.team.createInvite, { orgId: orgA, role: "viewer" });
      await as(t, "viewer_a").mutation(api.team.acceptInvite, { code });
      await rejects(as(t, "viewer_a").mutation(api.dataSources.link, { pageId, kind: "sheet", url: SHEET }), "forbidden");
    });

    it("C7: the Pro plan allows 3 sources, the fourth page is refused", async () => {
      await pro();
      fetchStub.mockImplementation(() => Promise.resolve(respond("a,b\n1,2"))); // a Response body can be read only once
      const nums = await as(t, "owner_a").query(api.pages.freeNumbers, { orgId: orgA });
      const ids = [pageId];
      for (let i = 0; i < 3; i++) ids.push(await as(t, "owner_a").mutation(api.pages.create, { orgId: orgA, number: nums[i + 1]!, title: `P${i}` }));
      for (const id of ids.slice(0, 3)) await as(t, "owner_a").mutation(api.dataSources.link, { pageId: id, kind: "sheet", url: SHEET });
      await rejects(as(t, "owner_a").mutation(api.dataSources.link, { pageId: ids[3]!, kind: "sheet", url: SHEET }), "plan_limit");
      // Replacing the source of a page that already has one is not a new source.
      await as(t, "owner_a").mutation(api.dataSources.link, { pageId: ids[0]!, kind: "sheet", url: SHEET });
      await settle();
    });
  });

  describe("syncing (C8, C9)", () => {
    it("C8: a sheet becomes a table, a second identical sync writes no new version, a change writes one", async () => {
      await pro();
      fetchStub.mockImplementation(() => Promise.resolve(respond('Route,Time\n12,08:00\n"7, Express",09:15'))); // a Response body can be read only once
      await as(t, "owner_a").mutation(api.dataSources.link, { pageId, kind: "sheet", url: SHEET });
      await settle();
      expect(fetchStub).toHaveBeenCalledWith("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/export?format=csv", expect.objectContaining({ redirect: "manual" }));
      const first = await version(pageId);
      expect(first.blocks).toEqual([
        { type: "heading", level: 1, text: "BUS TIMES" },
        { type: "table", header: ["Route", "Time"], rows: [["12", "08:00"], ["7, Express", "09:15"]] },
      ]);
      expect((await sourceOf(pageId))?.lastStatus).toBe("ok");

      vi.advanceTimersByTime(2 * 60_000);
      await as(t, "owner_a").mutation(api.dataSources.syncNow, { pageId });
      await settle();
      expect((await version(pageId)).version).toBe(first.version);
      expect((await sourceOf(pageId))?.lastStatus).toBe("unchanged");

      fetchStub.mockImplementation(() => Promise.resolve(respond("Route,Time\n12,08:30"))); // a Response body can be read only once
      vi.advanceTimersByTime(2 * 60_000);
      await as(t, "owner_a").mutation(api.dataSources.syncNow, { pageId });
      await settle();
      expect((await version(pageId)).version).toBe(first.version + 1);
    });

    it("C8: a feed becomes a list of headlines", async () => {
      await pro();
      fetchStub.mockImplementation(() => Promise.resolve(respond("<rss><channel><item><title>Road works on Ring Road</title><pubDate>Thu, 12 Nov 2026 08:00:00 GMT</pubDate></item></channel></rss>"))); // a Response body can be read only once
      await as(t, "owner_a").mutation(api.dataSources.link, { pageId, kind: "rss", url: "https://news.example.org/feed.xml" });
      await settle();
      expect((await version(pageId)).blocks[1]).toEqual({ type: "bullets", items: ["Thu 12 Nov: Road works on Ring Road"] });
    });

    it("C8: a failed fetch keeps the old content and says why", async () => {
      await pro();
      fetchStub.mockResolvedValueOnce(respond("Route,Time\n12,08:00"));
      await as(t, "owner_a").mutation(api.dataSources.link, { pageId, kind: "sheet", url: SHEET });
      await settle();
      const good = await version(pageId);

      for (const failure of [
        () => Promise.reject(new Error("network down")),
        () => Promise.resolve(respond("", { status: 302, headers: { location: "https://accounts.google.com/" } })),
        () => Promise.resolve(respond("nope", { status: 500 })),
        () => Promise.resolve(respond("x".repeat(250_000))),
      ]) {
        fetchStub.mockImplementationOnce(failure);
        vi.advanceTimersByTime(2 * 60_000);
        await as(t, "owner_a").mutation(api.dataSources.syncNow, { pageId });
        await settle();
        const s = await sourceOf(pageId);
        expect(s?.lastStatus).toBe("error");
        expect(s?.lastNote?.length).toBeGreaterThan(5);
        expect((await version(pageId)).version).toBe(good.version);
      }
    });

    it("C8: text that is not a feed is reported, not published", async () => {
      await pro();
      fetchStub.mockImplementation(() => Promise.resolve(respond("<html><body>Hello</body></html>"))); // a Response body can be read only once
      await as(t, "owner_a").mutation(api.dataSources.link, { pageId, kind: "rss", url: "https://news.example.org/page" });
      await settle();
      expect((await sourceOf(pageId))?.lastNote).toMatch(/not an RSS or Atom feed/);
    });

    it("C9: syncing never changes the status of a draft or a published page", async () => {
      await pro();
      fetchStub.mockImplementation(() => Promise.resolve(respond("Route,Time\n12,08:00"))); // a Response body can be read only once
      await as(t, "owner_a").mutation(api.dataSources.link, { pageId, kind: "sheet", url: SHEET });
      await settle();
      expect((await version(pageId)).status).toBe("draft");
      await as(t, "owner_a").mutation(api.pages.setStatus, { pageId, to: "published" });
      fetchStub.mockImplementation(() => Promise.resolve(respond("Route,Time\n12,09:00"))); // a Response body can be read only once
      vi.advanceTimersByTime(2 * 60_000);
      await as(t, "owner_a").mutation(api.dataSources.syncNow, { pageId });
      await settle();
      const p = await version(pageId);
      expect(p.status).toBe("published");
      expect(JSON.stringify(p.blocks)).toContain("09:00");
    });

    it("syncNow is limited to once a minute, and unlink removes the source", async () => {
      await pro();
      fetchStub.mockImplementation(() => Promise.resolve(respond("a,b\n1,2"))); // a Response body can be read only once
      await as(t, "owner_a").mutation(api.dataSources.link, { pageId, kind: "sheet", url: SHEET });
      await settle();
      await rejects(as(t, "owner_a").mutation(api.dataSources.syncNow, { pageId }), "rate");
      await as(t, "owner_a").mutation(api.dataSources.unlink, { pageId });
      expect(await sourceOf(pageId)).toBeNull();
      await rejects(as(t, "owner_a").mutation(api.dataSources.syncNow, { pageId }), "not_found");
    });

    it("the cron starts a sync only for sources that were not tried in the last 14 minutes", async () => {
      await pro();
      fetchStub.mockImplementation(() => Promise.resolve(respond("a,b\n1,2"))); // a Response body can be read only once
      await as(t, "owner_a").mutation(api.dataSources.link, { pageId, kind: "sheet", url: SHEET });
      await settle();
      expect(fetchStub).toHaveBeenCalledTimes(1);
      const { internal } = await import("../../convex/_generated/api");
      await t.mutation(internal.dataSources.syncDue, {});
      await settle();
      expect(fetchStub).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(15 * 60_000);
      await t.mutation(internal.dataSources.syncDue, {});
      await settle();
      expect(fetchStub).toHaveBeenCalledTimes(2);
    });
  });
});
