import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { entry, EMPTY_ENTRY, stepSubpage, type EntryKey, type EntryState } from "../src/entry";
import { ACTIONS, PERMISSIONS, ROLES, can } from "../src/permissions";
import { PLAN_LIMITS, canPublishMore, type Plan } from "../src/plans";
import { allocateRange, rangesOverlap, ALLOCATION_START } from "../src/ranges";
import { PAGE_STATUSES, canTransition, type PageStatus } from "../src/workflow";
import { RUNS } from "./arbitraries";

const key: fc.Arbitrary<EntryKey> = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom(..."0123456789").map((digit): EntryKey => ({ type: "digit", digit })) },
  { weight: 1, arbitrary: fc.constant<EntryKey>({ type: "backspace" }) },
  { weight: 1, arbitrary: fc.constant<EntryKey>({ type: "clear" }) },
  { weight: 1, arbitrary: fc.string({ maxLength: 2 }).map((digit): EntryKey => ({ type: "digit", digit })) },
);

describe("reader entry (reader-app R1-R5)", () => {
  it("R1-R4: buffer stays 0-3 digits; loads fire only on a valid third digit", () => {
    fc.assert(
      fc.property(fc.array(key, { maxLength: 60 }), (keys) => {
        let state: EntryState = EMPTY_ENTRY;
        let typed = "";
        for (const k of keys) {
          const before = state.digits;
          const r = entry(state, k);
          expect(r.state.digits.length).toBeLessThanOrEqual(3);
          expect(/^[0-9]*$/.test(r.state.digits)).toBe(true);
          if (k.type === "digit" && /^[0-9]$/.test(k.digit)) typed = before + k.digit;
          const completed = k.type === "digit" && /^[0-9]$/.test(k.digit) && before.length === 2;
          if (r.go !== undefined) {
            expect(completed).toBe(true);
            expect(r.go).toBe(Number(typed));
            expect(r.go >= 100 && r.go <= 899).toBe(true);
          }
          if (completed) expect(r.go !== undefined || r.invalid !== undefined).toBe(true);
          else expect(r.go).toBeUndefined();
          state = r.state;
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("R3: backspace on an empty buffer does nothing", () => {
    expect(entry(EMPTY_ENTRY, { type: "backspace" }).state).toEqual(EMPTY_ENTRY);
  });

  it("R5: sub-page index stays within 1..total", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 99 }), fc.array(fc.integer({ min: -5, max: 5 }), { maxLength: 50 }), (total, steps) => {
        let sub = 1;
        for (const d of steps) {
          sub = stepSubpage(sub, total, d);
          expect(sub).toBeGreaterThanOrEqual(1);
          expect(sub).toBeLessThanOrEqual(total);
        }
      }),
      { numRuns: RUNS },
    );
  });
});

describe("dashboard logic (publisher-dashboard D1, D2, D4, D7)", () => {
  it("D1: allocated ranges never overlap and stay inside 200-899", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(50, 100, 200, 7, 1), { maxLength: 40 }), (sizes) => {
        const taken: [number, number][] = [];
        for (const size of sizes) {
          const r = allocateRange(taken, size);
          if (r === null) continue;
          expect(r[1] - r[0] + 1).toBe(size);
          expect(r[0]).toBeGreaterThanOrEqual(ALLOCATION_START);
          expect(r[1]).toBeLessThanOrEqual(899);
          for (const t of taken) expect(rangesOverlap(t, r)).toBe(false);
          taken.push(r);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("D2: only the allowed status moves succeed", () => {
    const allowed = new Set(["draft>review", "review>draft", "review>published", "published>archived", "archived>draft"]);
    fc.assert(
      fc.property(fc.constantFrom(...PAGE_STATUSES), fc.constantFrom(...PAGE_STATUSES), (from: PageStatus, to: PageStatus) => {
        expect(canTransition(from, to, { requireApproval: true })).toBe(allowed.has(`${from}>${to}`));
        expect(canTransition(from, to)).toBe(allowed.has(`${from}>${to}`) || (from === "draft" && to === "published"));
      }),
      { numRuns: 200 },
    );
  });

  it("D4: the published count never exceeds the plan limit", () => {
    fc.assert(
      fc.property(fc.constantFrom<Plan>("free", "pro", "org"), fc.array(fc.boolean(), { maxLength: 700 }), (plan, ops) => {
        let published = 0;
        for (const publish of ops) {
          if (publish && canPublishMore(plan, published)) published++;
          if (!publish && published > 0) published--;
          expect(published).toBeLessThanOrEqual(PLAN_LIMITS[plan].publishedPages);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("D7: can() matches the permission table", () => {
    const expected: Record<string, string[]> = {
      owner: [...ACTIONS],
      editor: ["org.read", "page.read", "page.write", "page.publish", "ai.use"],
      viewer: ["org.read", "page.read"],
    };
    for (const role of ROLES) {
      for (const action of ACTIONS) expect(can(role, action)).toBe(expected[role]?.includes(action));
      expect([...PERMISSIONS[role]].sort()).toEqual([...(expected[role] ?? [])].sort());
    }
  });
});
