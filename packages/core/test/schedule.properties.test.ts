import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_SCHEDULE_AHEAD_MS, dueAction, isVisible, settle, validateSchedule, type Schedulable } from "../src/schedule";
import { PAGE_STATUSES, type PageStatus } from "../src/workflow";
import { RUNS } from "./arbitraries";

const NOW = 1_800_000_000_000;
const status: fc.Arbitrary<PageStatus> = fc.constantFrom(...PAGE_STATUSES);
// Aggressive times: boundaries around now and the one-year limit, negatives, huge numbers, floats, NaN, Infinity.
const time: fc.Arbitrary<number | null | undefined> = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.constantFrom(NOW - 1, NOW, NOW + 1, NOW + MAX_SCHEDULE_AHEAD_MS - 1, NOW + MAX_SCHEDULE_AHEAD_MS, NOW + MAX_SCHEDULE_AHEAD_MS + 1, 0, -1, Number.MAX_SAFE_INTEGER, NaN, Infinity, -Infinity, NOW + 0.5),
  fc.integer({ min: NOW - 10_000_000, max: NOW + 10_000_000 }),
  fc.integer({ min: NOW, max: NOW + MAX_SCHEDULE_AHEAD_MS + 5 }),
);
const page: fc.Arbitrary<Schedulable> = fc.record({ status, publishAt: time, expiresAt: time });
const nowArb = fc.integer({ min: NOW - 5_000_000, max: NOW + 5_000_000 });

describe("schedule (publisher-dashboard D6)", () => {
  it("S1: validateSchedule accepts exactly the schedules that are future, within a year, in order and allowed for the status", () => {
    const isInt = (n: number | null | undefined): n is number => typeof n === "number" && Number.isInteger(n);
    fc.assert(
      fc.property(page, (p) => {
        const publishOk = p.publishAt == null || ((p.status === "draft" || p.status === "review") && isInt(p.publishAt) && p.publishAt > NOW && p.publishAt <= NOW + MAX_SCHEDULE_AHEAD_MS);
        const expiryOk =
          p.expiresAt == null ||
          (p.status !== "archived" &&
            isInt(p.expiresAt) &&
            p.expiresAt > NOW &&
            p.expiresAt <= NOW + MAX_SCHEDULE_AHEAD_MS &&
            !(p.publishAt != null && isInt(p.publishAt) && p.expiresAt <= p.publishAt));
        expect(validateSchedule(p, NOW).length === 0).toBe(publishOk && expiryOk);
      }),
      { numRuns: RUNS },
    );
  });

  it("S1b: every problem has a plain message and a fix", () => {
    fc.assert(
      fc.property(page, (p) => {
        for (const problem of validateSchedule(p, NOW)) {
          expect(problem.message.length).toBeGreaterThan(5);
          expect(problem.fix.length).toBeGreaterThan(5);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("S2: settle is idempotent and only moves a page forward (draft/review -> published -> archived)", () => {
    const rank: Record<PageStatus, number> = { draft: 0, review: 0, published: 1, archived: 2 };
    fc.assert(
      fc.property(page, nowArb, (p, now) => {
        const once = settle(p, now);
        expect(settle(once, now)).toEqual(once);
        expect(rank[once.status]).toBeGreaterThanOrEqual(rank[p.status]);
        if (dueAction(p, now) === null) expect(once).toEqual(p);
        expect(dueAction(once, now)).toBeNull();
      }),
      { numRuns: RUNS },
    );
  });

  it("S3: an expired page is never visible, whatever its status and whether or not the job ran", () => {
    fc.assert(
      fc.property(page, nowArb, (p, now) => {
        if (p.expiresAt != null && !(p.expiresAt > now)) expect(isVisible(p, now)).toBe(false);
        // After settling, a page whose expiry has passed is not published any more.
        const after = settle(p, now);
        if (p.expiresAt != null && !(p.expiresAt > now) && after.status !== "archived") expect(after.status).not.toBe("published");
        // A page that is still published after settling has no expiry in the past.
        if (after.status === "published") expect(after.expiresAt == null || after.expiresAt > now).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it("S4: only published pages that have not expired are visible", () => {
    fc.assert(
      fc.property(page, nowArb, (p, now) => {
        if (p.status !== "published") expect(isVisible(p, now)).toBe(false);
      }),
      { numRuns: RUNS },
    );
  });

  describe("examples", () => {
    it("a draft scheduled for the future is valid; in the past is not", () => {
      expect(validateSchedule({ status: "draft", publishAt: NOW + 60_000 }, NOW)).toEqual([]);
      expect(validateSchedule({ status: "draft", publishAt: NOW - 60_000 }, NOW)[0]?.field).toBe("publishAt");
    });

    it("a published page cannot be scheduled for publishing but can expire", () => {
      expect(validateSchedule({ status: "published", publishAt: NOW + 1000 }, NOW)[0]?.message).toContain("published");
      expect(validateSchedule({ status: "published", expiresAt: NOW + 1000 }, NOW)).toEqual([]);
    });

    it("expiry must come after the publish time", () => {
      const p = validateSchedule({ status: "draft", publishAt: NOW + 5000, expiresAt: NOW + 4000 }, NOW);
      expect(p.map((x) => x.field)).toEqual(["expiresAt"]);
    });

    it("settle publishes a due draft and archives an expired page", () => {
      expect(settle({ status: "draft", publishAt: NOW - 1 }, NOW)).toEqual({ status: "published", publishAt: null });
      expect(settle({ status: "published", expiresAt: NOW }, NOW)).toEqual({ status: "archived", expiresAt: null });
      expect(settle({ status: "draft", publishAt: NOW + 1 }, NOW).status).toBe("draft");
    });

    it("a draft whose publish and expiry have both passed ends archived, never published", () => {
      expect(settle({ status: "draft", publishAt: NOW - 20, expiresAt: NOW - 10 }, NOW).status).toBe("archived");
    });

    it("regression (found by S3): a NaN expiry fails closed instead of living forever", () => {
      // Shrunk counterexample: a draft past its publish time with expiresAt NaN ended up published and never expired.
      const bad = { status: "draft" as const, publishAt: 1799990000000, expiresAt: Number.NaN };
      expect(settle(bad, 1799995000000).status).toBe("archived");
      expect(isVisible({ status: "published", expiresAt: Number.NaN }, NOW)).toBe(false);
      expect(dueAction({ status: "published", expiresAt: Number.NaN }, NOW)).toBe("archive");
    });

    it("isVisible: published and not expired", () => {
      expect(isVisible({ status: "published", expiresAt: NOW + 1 }, NOW)).toBe(true);
      expect(isVisible({ status: "published", expiresAt: NOW }, NOW)).toBe(false);
      expect(isVisible({ status: "published" }, NOW)).toBe(true);
      expect(isVisible({ status: "archived" }, NOW)).toBe(false);
    });
  });
});
