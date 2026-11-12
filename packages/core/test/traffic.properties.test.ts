import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  REPORT_NOTE_MAX,
  classifyDevice,
  cleanReportNote,
  dayKey,
  dayKeyDaysAgo,
  registerHit,
  summarizeViews,
  withinLimit,
  type DeviceClass,
  type RateState,
  type ViewRow,
} from "../src/traffic";
import { RUNS } from "./arbitraries";

const anyText = fc.oneof(
  fc.string({ maxLength: 300 }),
  fc.string({ unit: "binary", maxLength: 200 }),
  fc.string({ unit: "grapheme", maxLength: 200 }),
  fc.constantFrom("", " ", "\u{1F600}", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "x".repeat(50_000)),
);

const row: fc.Arbitrary<ViewRow> = fc.record({
  day: fc.integer({ min: 20260101, max: 20261231 }),
  pageNumber: fc.integer({ min: 100, max: 899 }),
  mobile: fc.integer({ min: 0, max: 5000 }),
  desktop: fc.integer({ min: 0, max: 5000 }),
  other: fc.integer({ min: 0, max: 5000 }),
});

describe("traffic (traffic-and-moderation T1-T6)", () => {
  it("T1: classifies every string as mobile, desktop or other", () => {
    fc.assert(
      fc.property(anyText, (ua) => {
        const c: DeviceClass = classifyDevice(ua);
        expect(["mobile", "desktop", "other"]).toContain(c);
      }),
      { numRuns: RUNS },
    );
  });

  it("T1 example: phones, laptops and bots", () => {
    expect(classifyDevice("Mozilla/5.0 (Linux; Android 13; Tecno) Mobile Safari")).toBe("mobile");
    expect(classifyDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120")).toBe("desktop");
    expect(classifyDevice("Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe("other");
    expect(classifyDevice("")).toBe("other");
  });

  it("T2: dayKey is a valid yyyymmdd and never goes backwards", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4_000_000_000_000 }), fc.integer({ min: 0, max: 400 * 86_400_000 }), (t, delta) => {
        const k = dayKey(t);
        const month = Math.floor(k / 100) % 100;
        const day = k % 100;
        expect(month).toBeGreaterThanOrEqual(1);
        expect(month).toBeLessThanOrEqual(12);
        expect(day).toBeGreaterThanOrEqual(1);
        expect(day).toBeLessThanOrEqual(31);
        expect(dayKey(t + delta)).toBeGreaterThanOrEqual(k);
        expect(dayKeyDaysAgo(t, 0)).toBe(k);
      }),
      { numRuns: RUNS },
    );
  });

  it("T2: out-of-range and non-finite times give 0; example", () => {
    for (const bad of [NaN, Infinity, -Infinity, 9e15, -9e15]) expect(dayKey(bad)).toBe(0);
    expect(dayKey(Date.UTC(2026, 10, 12, 23, 59, 59))).toBe(20261112);
    expect(dayKey(Date.UTC(2026, 10, 13, 0, 0, 0))).toBe(20261113);
    expect(dayKeyDaysAgo(Date.UTC(2026, 10, 12), 6)).toBe(20261106);
  });

  it("T3: totals agree everywhere and row order does not matter", () => {
    fc.assert(
      fc.property(fc.array(row, { maxLength: 60 }), (rows) => {
        const s = summarizeViews(rows, 1000);
        const sum = rows.reduce((a, r) => a + r.mobile + r.desktop + r.other, 0);
        expect(s.total).toBe(sum);
        expect(s.byDevice.mobile + s.byDevice.desktop + s.byDevice.other).toBe(sum);
        expect(s.byDay.reduce((a, d) => a + d.views, 0)).toBe(sum);
        expect(s.topPages.reduce((a, p) => a + p.views, 0)).toBe(sum);
        expect(summarizeViews([...rows].reverse(), 1000)).toEqual(s);
      }),
      { numRuns: RUNS },
    );
  });

  it("T3: junk counters (negative, NaN, fractions) never make a total negative or NaN", () => {
    const junk = fc.record({
      day: fc.integer({ min: 1, max: 20261231 }),
      pageNumber: fc.integer({ min: 100, max: 899 }),
      mobile: fc.oneof(fc.double({ noDefaultInfinity: false }), fc.integer()),
      desktop: fc.double(),
      other: fc.integer(),
    });
    fc.assert(
      fc.property(fc.array(junk, { maxLength: 30 }), (rows) => {
        const s = summarizeViews(rows);
        expect(Number.isInteger(s.total)).toBe(true);
        expect(s.total).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: RUNS },
    );
  });

  it("T4: days ascend, top pages are sorted and capped", () => {
    fc.assert(
      fc.property(fc.array(row, { maxLength: 60 }), fc.integer({ min: 0, max: 8 }), (rows, n) => {
        const s = summarizeViews(rows, n);
        for (let i = 1; i < s.byDay.length; i++) expect(s.byDay[i]!.day).toBeGreaterThan(s.byDay[i - 1]!.day);
        expect(s.topPages.length).toBeLessThanOrEqual(n);
        for (let i = 1; i < s.topPages.length; i++) {
          const a = s.topPages[i - 1]!;
          const b = s.topPages[i]!;
          expect(a.views > b.views || (a.views === b.views && a.pageNumber < b.pageNumber)).toBe(true);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("T5: report notes are clean, short and stable", () => {
    fc.assert(
      fc.property(anyText, (raw) => {
        const once = cleanReportNote(raw);
        expect(once.length).toBeLessThanOrEqual(REPORT_NOTE_MAX);
        // eslint-disable-next-line no-control-regex
        expect(/[\u0000-\u001f\u007f]/.test(once)).toBe(false);
        expect(cleanReportNote(once)).toBe(once);
      }),
      { numRuns: RUNS },
    );
  });

  it("T6: exactly `limit` hits pass inside a window, then it blocks, then the window resets", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1000, max: 3_600_000 }), fc.integer({ min: 0, max: 1e12 }), (limit, windowMs, start) => {
        let state: RateState | null = null;
        const verdicts: boolean[] = [];
        for (let i = 0; i < limit + 3; i++) {
          // All hits land inside one window (a millisecond apart, at most 15 hits).
          state = registerHit(state, start + i, windowMs);
          verdicts.push(withinLimit(state, limit));
        }
        if (windowMs > limit + 3) {
          expect(verdicts.slice(0, limit).every(Boolean)).toBe(true);
          expect(verdicts.slice(limit).some(Boolean)).toBe(false);
        }
        const later = registerHit(state, start + windowMs + 5, windowMs);
        expect(later.count).toBe(1);
      }),
      { numRuns: RUNS },
    );
  });

  it("T6 example: a clock that goes backwards starts a fresh window", () => {
    expect(registerHit({ windowStart: 1000, count: 4 }, 10, 60_000)).toEqual({ windowStart: 10, count: 1 });
  });
});
