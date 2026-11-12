/// <reference types="vite/client" />
// Views, analytics, reports, moderation and the audit log (traffic-and-moderation T7-T10). Fake user ids only.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

const modules = import.meta.glob(["../../convex/**/*.ts", "../../convex/**/*.js"]);
type T = ReturnType<typeof convexTest>;

const as = (t: T, subject: string) => t.withIdentity({ subject });
const hash = (n: number) => n.toString(16).padStart(32, "0");
const rejects = (p: Promise<unknown>, code: string) => expect(p).rejects.toThrow(new RegExp(code));

describe("views, reports, analytics and audit", () => {
  let t: T;
  let orgA: Id<"organizations">;
  let orgB: Id<"organizations">;
  let pageNumber: number;
  let pageId: Id<"pages">;

  const invite = async (role: "editor" | "viewer", user: string) => {
    const { code } = await as(t, "owner_a").mutation(api.team.createInvite, { orgId: orgA, role });
    await as(t, user).mutation(api.team.acceptInvite, { code });
  };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-12T10:00:00Z"));
    t = convexTest(schema, modules);
    orgA = await as(t, "owner_a").mutation(api.orgs.create, { name: "Greenfield High" });
    orgB = await as(t, "owner_b").mutation(api.orgs.create, { name: "Lakeside Clinic" });
    await invite("editor", "editor_a");
    await invite("viewer", "viewer_a");
    const free = await as(t, "owner_a").query(api.pages.freeNumbers, { orgId: orgA });
    pageNumber = free[0]!;
    pageId = await as(t, "owner_a").mutation(api.pages.create, { orgId: orgA, number: pageNumber, title: "Exam results" });
    await as(t, "owner_a").mutation(api.pages.setStatus, { pageId, to: "published" });
  });

  afterEach(() => vi.useRealTimers());

  const report = (n = pageNumber, reporter = 1, reason = "wrong", note?: string) =>
    t.mutation(api.reports.submit, { pageNumber: n, reason, reporterHash: hash(reporter), ...(note ? { note } : {}) });

  describe("reports (T7, T8)", () => {
    it("T7: only a published page can be reported; unknown reasons and bad hashes are refused", async () => {
      await rejects(report(pageNumber + 1), "not_found");
      await rejects(report(pageNumber, 1, "because"), "invalid");
      await rejects(t.mutation(api.reports.submit, { pageNumber, reason: "wrong", reporterHash: "zz" }), "invalid");
      await report();
      const open = await as(t, "owner_a").query(api.reports.list, { orgId: orgA });
      expect(open).toHaveLength(1);
      expect(open[0]).toMatchObject({ pageNumber, reasonLabel: "Wrong information" });
    });

    it("T7: the sixth report from one visitor in an hour is refused, and a new hour allows it again", async () => {
      for (let i = 0; i < 5; i++) await report(pageNumber, 7);
      await rejects(report(pageNumber, 7), "rate");
      await report(pageNumber, 8);
      vi.setSystemTime(new Date("2026-11-12T11:30:00Z"));
      await report(pageNumber, 7);
    });

    it("T7: notes are cleaned and capped", async () => {
      await report(pageNumber, 1, "other", `  bad\u0000   news ${"x".repeat(400)}`);
      const [r] = await as(t, "owner_a").query(api.reports.list, { orgId: orgA });
      expect(r?.note.length).toBeLessThanOrEqual(200);
      expect(r?.note.startsWith("bad news")).toBe(true);
    });

    it("T8: reports are visible only to members of the page's organization", async () => {
      await report();
      expect(await as(t, "viewer_a").query(api.reports.list, { orgId: orgA })).toHaveLength(1);
      await rejects(as(t, "owner_b").query(api.reports.list, { orgId: orgA }), "forbidden");
      await rejects(as(t, "stranger").query(api.reports.list, { orgId: orgA }), "forbidden");
      expect(await as(t, "owner_b").query(api.reports.list, { orgId: orgB })).toHaveLength(0);
    });

    it("T8: viewers and outsiders cannot resolve; the answer is the same for a missing report", async () => {
      await report();
      const [r] = await as(t, "owner_a").query(api.reports.list, { orgId: orgA });
      const id = r!.reportId;
      await rejects(as(t, "viewer_a").mutation(api.reports.resolve, { reportId: id, action: "dismiss" }), "forbidden");
      await rejects(as(t, "owner_b").mutation(api.reports.resolve, { reportId: id, action: "archive" }), "forbidden");
      await rejects(as(t, "stranger").mutation(api.reports.resolve, { reportId: id, action: "dismiss" }), "forbidden");
      expect(await as(t, "owner_a").query(api.reports.list, { orgId: orgA })).toHaveLength(1);
    });

    it("T8: dismiss closes one report and leaves the page public", async () => {
      await report();
      const [r] = await as(t, "editor_a").query(api.reports.list, { orgId: orgA });
      await as(t, "editor_a").mutation(api.reports.resolve, { reportId: r!.reportId, action: "dismiss" });
      expect(await as(t, "owner_a").query(api.reports.list, { orgId: orgA })).toHaveLength(0);
      expect(await t.query(api.public.page, { number: pageNumber })).not.toBeNull();
    });

    it("T8: archive takes the page offline at once and closes every report for it", async () => {
      await report(pageNumber, 1);
      await report(pageNumber, 2, "spam");
      const [r] = await as(t, "editor_a").query(api.reports.list, { orgId: orgA });
      await as(t, "editor_a").mutation(api.reports.resolve, { reportId: r!.reportId, action: "archive" });
      expect(await t.query(api.public.page, { number: pageNumber })).toBeNull();
      expect(await as(t, "owner_a").query(api.reports.list, { orgId: orgA })).toHaveLength(0);
    });
  });

  describe("views and analytics (T7, T9)", () => {
    const view = (n = pageNumber, visitor = 1, device: "mobile" | "desktop" | "other" = "mobile") =>
      t.mutation(api.traffic.recordView, { pageNumber: n, device, visitorHash: hash(visitor) });
    const since = 20261101;
    const upgrade = () => as(t, "owner_a").mutation(api.orgs.changePlan, { orgId: orgA, plan: "pro" });

    it("T7: the same visitor counts once a minute; other visitors and later minutes count", async () => {
      await upgrade();
      await view(pageNumber, 1);
      await view(pageNumber, 1);
      await view(pageNumber, 2, "desktop");
      vi.setSystemTime(new Date("2026-11-12T10:02:00Z"));
      await view(pageNumber, 1);
      const res = await as(t, "owner_a").query(api.traffic.summary, { orgId: orgA, sinceDay: since });
      expect(res.summary?.total).toBe(3);
      expect(res.summary?.byDevice).toEqual({ mobile: 2, desktop: 1, other: 0 });
      expect(res.summary?.topPages[0]).toMatchObject({ pageNumber, views: 3, title: "EXAM RESULTS" });
    });

    it("T7: unpublished, unknown and malformed views are ignored without error", async () => {
      await upgrade();
      await view(pageNumber + 1);
      await view(50);
      await t.mutation(api.traffic.recordView, { pageNumber, device: "mobile", visitorHash: "not-hex" });
      const res = await as(t, "owner_a").query(api.traffic.summary, { orgId: orgA, sinceDay: since });
      expect(res.summary?.total).toBe(0);
    });

    it("T9: the free plan is locked and the server returns no numbers", async () => {
      await view();
      const res = await as(t, "owner_a").query(api.traffic.summary, { orgId: orgA, sinceDay: since });
      expect(res).toEqual({ locked: true });
    });

    it("T9: another organization's analytics are refused and its views never leak in", async () => {
      await upgrade();
      await as(t, "owner_b").mutation(api.orgs.changePlan, { orgId: orgB, plan: "pro" });
      await view();
      await rejects(as(t, "owner_b").query(api.traffic.summary, { orgId: orgA, sinceDay: since }), "forbidden");
      const other = await as(t, "owner_b").query(api.traffic.summary, { orgId: orgB, sinceDay: since });
      expect(other.summary?.total).toBe(0);
    });

    it("T9: a bad start day is refused", async () => {
      await upgrade();
      await rejects(as(t, "owner_a").query(api.traffic.summary, { orgId: orgA, sinceDay: 12.5 }), "invalid");
    });
  });

  describe("audit log (T10)", () => {
    it("T10: publishing, plan changes and team changes are recorded; only the owner can read them", async () => {
      await as(t, "owner_a").mutation(api.orgs.changePlan, { orgId: orgA, plan: "pro" });
      await as(t, "owner_a").mutation(api.orgs.setRequireApproval, { orgId: orgA, requireApproval: true });
      const log = await as(t, "owner_a").query(api.audit.list, { orgId: orgA });
      const actions = log.map((r) => r.detail).join(" | ");
      expect(actions).toContain(`Page ${pageNumber}: draft to published`);
      expect(actions).toContain("Plan free to pro");
      expect(actions).toContain("Approval required: on");
      expect(actions).toContain("Invite created for editor");
      expect(log.every((r) => r.byYou || r.by.length > 0)).toBe(true);
      await rejects(as(t, "editor_a").query(api.audit.list, { orgId: orgA }), "forbidden");
      await rejects(as(t, "owner_b").query(api.audit.list, { orgId: orgA }), "forbidden");
    });

    it("T10: closing a report from the dashboard is logged, and the log never holds the reporter hash or note", async () => {
      await report(pageNumber, 3, "wrong", "secret-note-text");
      const [r] = await as(t, "owner_a").query(api.reports.list, { orgId: orgA });
      await as(t, "owner_a").mutation(api.reports.resolve, { reportId: r!.reportId, action: "archive" });
      const log = JSON.stringify(await as(t, "owner_a").query(api.audit.list, { orgId: orgA }));
      expect(log).toContain("taken offline");
      expect(log).not.toContain("secret-note-text");
      expect(log).not.toContain(hash(3));
    });
  });
});
