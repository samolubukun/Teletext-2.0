/// <reference types="vite/client" />
// Scheduled publishing and expiry (publisher-dashboard D6), with fake timers driving ctx.scheduler.runAt.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

const modules = import.meta.glob(["../../convex/**/*.ts", "../../convex/**/*.js"]);
type T = ReturnType<typeof convexTest>;

const START = Date.UTC(2026, 10, 12, 12, 0, 0);
const HOUR = 3_600_000;
const as = (t: T, subject: string) => t.withIdentity({ subject });

async function rejectsWith(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toThrow(new RegExp(code));
}

const content = [
  { type: "heading", level: 1, text: "CLOSED FRIDAY" },
  { type: "paragraph", text: "The office is closed on Fri 27 Nov." },
];

describe("scheduled publishing and expiry", () => {
  let t: T;
  let orgId: Id<"organizations">;
  let rangeStart: number;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    t = convexTest(schema, modules);
    orgId = await as(t, "owner").mutation(api.orgs.create, { name: "City Council" });
    rangeStart = (await as(t, "owner").query(api.orgs.get, { orgId })).rangeStart;
    await t.run(async (ctx) => {
      await ctx.db.insert("members", { orgId, userId: "editor", role: "editor" });
      await ctx.db.insert("members", { orgId, userId: "viewer", role: "viewer" });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A saved page with real content. */
  async function newPage(offset = 0, uncheckedFacts = 0) {
    const pageId = await as(t, "owner").mutation(api.pages.create, { orgId, number: rangeStart + offset, title: `Page ${offset}` });
    await as(t, "owner").mutation(api.pages.save, { pageId, blocks: content, fastext: [], uncheckedFacts });
    return pageId;
  }
  const detail = (pageId: Id<"pages">) => as(t, "owner").query(api.pages.get, { pageId });
  const publicView = (n: number) => t.query(api.public.page, { number: n });
  async function passTime(ms: number) {
    vi.advanceTimersByTime(ms);
    await t.finishInProgressScheduledFunctions();
  }

  it("D6: a draft scheduled for later is invisible, then published at that time", async () => {
    const pageId = await newPage();
    await as(t, "owner").mutation(api.pages.setSchedule, { pageId, publishAt: START + HOUR });
    expect((await detail(pageId)).publishAt).toBe(START + HOUR);
    expect(await publicView(rangeStart)).toBeNull();

    await passTime(HOUR - 1000);
    expect((await detail(pageId)).status).toBe("draft");
    await passTime(2000);
    const after = await detail(pageId);
    expect(after.status).toBe("published");
    expect(after.publishAt).toBeUndefined();
    expect(await publicView(rangeStart)).not.toBeNull();
  });

  it("D6: a published page expires at its time and then disappears from the public API", async () => {
    const pageId = await newPage();
    await as(t, "owner").mutation(api.pages.setStatus, { pageId, to: "published" });
    await as(t, "owner").mutation(api.pages.setSchedule, { pageId, expiresAt: START + 2 * HOUR });
    await passTime(HOUR);
    expect(await publicView(rangeStart)).not.toBeNull();
    await passTime(HOUR + 1000);
    const after = await detail(pageId);
    expect(after.status).toBe("archived");
    expect(after.expiresAt).toBeUndefined();
    expect(await publicView(rangeStart)).toBeNull();
  });

  it("a page can be scheduled to appear and then expire", async () => {
    const pageId = await newPage();
    await as(t, "owner").mutation(api.pages.setSchedule, { pageId, publishAt: START + HOUR, expiresAt: START + 3 * HOUR });
    await passTime(HOUR + 1000);
    expect((await detail(pageId)).status).toBe("published");
    await passTime(2 * HOUR);
    expect((await detail(pageId)).status).toBe("archived");
  });

  it("owners and editors can schedule; viewers and outsiders cannot", async () => {
    const pageId = await newPage();
    await as(t, "editor").mutation(api.pages.setSchedule, { pageId, publishAt: START + HOUR });
    await rejectsWith(as(t, "viewer").mutation(api.pages.setSchedule, { pageId, publishAt: START + 2 * HOUR }), "forbidden");
    await rejectsWith(as(t, "stranger").mutation(api.pages.setSchedule, { pageId, publishAt: START + 2 * HOUR }), "forbidden");
    await rejectsWith(t.mutation(api.pages.setSchedule, { pageId, publishAt: START + 2 * HOUR }), "unauthenticated");
    expect((await detail(pageId)).publishAt).toBe(START + HOUR);
  });

  it("rejects times in the past, expiry before publish, publish for a published page, and anything on an archived page", async () => {
    const pageId = await newPage();
    await rejectsWith(as(t, "owner").mutation(api.pages.setSchedule, { pageId, publishAt: START - 1000 }), "schedule");
    await rejectsWith(as(t, "owner").mutation(api.pages.setSchedule, { pageId, publishAt: START + 2 * HOUR, expiresAt: START + HOUR }), "schedule");
    await rejectsWith(as(t, "owner").mutation(api.pages.setSchedule, { pageId, publishAt: Number.NaN }), "schedule");
    await as(t, "owner").mutation(api.pages.setStatus, { pageId, to: "published" });
    await rejectsWith(as(t, "owner").mutation(api.pages.setSchedule, { pageId, publishAt: START + HOUR }), "schedule");
    await as(t, "owner").mutation(api.pages.setStatus, { pageId, to: "archived" });
    await rejectsWith(as(t, "owner").mutation(api.pages.setSchedule, { pageId, expiresAt: START + HOUR }), "schedule");
  });

  it("null clears a schedule, and the cleared job does nothing when it fires", async () => {
    const pageId = await newPage();
    await as(t, "owner").mutation(api.pages.setSchedule, { pageId, publishAt: START + HOUR });
    await as(t, "owner").mutation(api.pages.setSchedule, { pageId, publishAt: null });
    expect((await detail(pageId)).publishAt).toBeUndefined();
    await passTime(2 * HOUR);
    expect((await detail(pageId)).status).toBe("draft");
  });

  it("a stale job from an earlier schedule does not publish early after rescheduling", async () => {
    const pageId = await newPage();
    await as(t, "owner").mutation(api.pages.setSchedule, { pageId, publishAt: START + HOUR });
    await as(t, "owner").mutation(api.pages.setSchedule, { pageId, publishAt: START + 5 * HOUR });
    await passTime(HOUR + 1000);
    expect((await detail(pageId)).status).toBe("draft");
    await passTime(4 * HOUR);
    expect((await detail(pageId)).status).toBe("published");
  });

  it("AI values that are not in the source must be confirmed when scheduling, not at 3 am", async () => {
    const pageId = await newPage(0, 2);
    await rejectsWith(as(t, "owner").mutation(api.pages.setSchedule, { pageId, publishAt: START + HOUR }), "facts");
    await as(t, "owner").mutation(api.pages.setSchedule, { pageId, publishAt: START + HOUR, confirmFacts: true });
    await passTime(HOUR + 1000);
    expect((await detail(pageId)).status).toBe("published");
  });

  it("a page edited after scheduling with new unchecked values does not publish; the owner is told why", async () => {
    const pageId = await newPage();
    await as(t, "owner").mutation(api.pages.setSchedule, { pageId, publishAt: START + HOUR });
    await as(t, "owner").mutation(api.pages.save, { pageId, blocks: content, fastext: [], uncheckedFacts: 3 });
    await passTime(HOUR + 1000);
    const after = await detail(pageId);
    expect(after.status).toBe("draft");
    expect(after.scheduleNote).toContain("did not happen");
    expect(after.publishAt).toBeUndefined();
    expect(await publicView(rangeStart)).toBeNull();
  });

  it("the plan limit is checked when the job runs", async () => {
    const org = await as(t, "owner").query(api.orgs.get, { orgId });
    const limit = org.limits.publishedPages;
    const target = await newPage(limit + 1);
    await as(t, "owner").mutation(api.pages.setSchedule, { pageId: target, publishAt: START + HOUR });
    for (let i = 0; i < limit; i++) {
      const id = await newPage(i);
      await as(t, "owner").mutation(api.pages.setStatus, { pageId: id, to: "published" });
    }
    await passTime(HOUR + 1000);
    const after = await detail(target);
    expect(after.status).toBe("draft");
    expect(after.scheduleNote).toContain("plan");
  });

  it("publishing or archiving by hand clears the schedule that no longer applies", async () => {
    const pageId = await newPage();
    await as(t, "owner").mutation(api.pages.setSchedule, { pageId, publishAt: START + HOUR, expiresAt: START + 3 * HOUR });
    await as(t, "owner").mutation(api.pages.setStatus, { pageId, to: "published" });
    let d = await detail(pageId);
    expect(d.publishAt).toBeUndefined();
    expect(d.expiresAt).toBe(START + 3 * HOUR);
    await as(t, "owner").mutation(api.pages.setStatus, { pageId, to: "archived" });
    d = await detail(pageId);
    expect(d.expiresAt).toBeUndefined();
    await passTime(5 * HOUR);
    expect((await detail(pageId)).status).toBe("archived");
  });

  it("a page whose expiry time has already passed cannot be published by hand", async () => {
    const pageId = await newPage();
    await t.run(async (ctx) => ctx.db.patch(pageId, { expiresAt: START - 1000 }));
    await rejectsWith(as(t, "owner").mutation(api.pages.setStatus, { pageId, to: "published" }), "expired");
  });
});
