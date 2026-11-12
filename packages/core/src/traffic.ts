// Page views, report-a-page and public-write rate limits. Pure: callers pass time in.

export type DeviceClass = "mobile" | "desktop" | "other";
export const DEVICE_CLASSES: readonly DeviceClass[] = ["mobile", "desktop", "other"];

/** Coarse device class from a User-Agent string. Total: any string gives one of three answers. */
export function classifyDevice(userAgent: string): DeviceClass {
  const ua = userAgent.slice(0, 400);
  if (/bot|crawl|spider|slurp|curl|wget|headless/i.test(ua)) return "other";
  if (/mobi|android|iphone|ipod/i.test(ua)) return "mobile";
  if (/windows nt|macintosh|x11|cros|linux/i.test(ua)) return "desktop";
  return "other";
}

const DAY_MS = 86_400_000;
const MAX_DATE_MS = 8.64e15;

/** UTC calendar day as a number like 20261112. Out-of-range or non-finite input gives 0. */
export function dayKey(ms: number): number {
  if (!Number.isFinite(ms) || Math.abs(ms) > MAX_DATE_MS) return 0;
  const d = new Date(ms);
  return d.getUTCFullYear() * 10_000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/** The day key `days` days before `nowMs` (the first day of a range that ends today). */
export function dayKeyDaysAgo(nowMs: number, days: number): number {
  return dayKey(nowMs - Math.max(0, Math.floor(days)) * DAY_MS);
}

export type ViewRow = { day: number; pageNumber: number; mobile: number; desktop: number; other: number };
export type ViewSummary = {
  total: number;
  byDevice: Record<DeviceClass, number>;
  /** Ascending by day. */
  byDay: { day: number; views: number }[];
  /** Descending by views, then ascending by page number. */
  topPages: { pageNumber: number; views: number }[];
};

/** A counter is a non-negative whole number. Capped so that sums of corrupt rows stay finite and exact. */
const MAX_COUNT = 1e12;
function count(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.min(MAX_COUNT, Math.floor(n)) : 0;
}

/** Totals, per-day series, device split and top pages from daily counter rows. Order of rows does not matter. */
export function summarizeViews(rows: readonly ViewRow[], topN = 5): ViewSummary {
  const byDevice: Record<DeviceClass, number> = { mobile: 0, desktop: 0, other: 0 };
  const days = new Map<number, number>();
  const pages = new Map<number, number>();
  for (const r of rows) {
    const m = count(r.mobile);
    const d = count(r.desktop);
    const o = count(r.other);
    const sum = m + d + o;
    byDevice.mobile += m;
    byDevice.desktop += d;
    byDevice.other += o;
    days.set(r.day, (days.get(r.day) ?? 0) + sum);
    pages.set(r.pageNumber, (pages.get(r.pageNumber) ?? 0) + sum);
  }
  return {
    total: byDevice.mobile + byDevice.desktop + byDevice.other,
    byDevice,
    byDay: [...days].map(([day, views]) => ({ day, views })).sort((a, b) => a.day - b.day),
    topPages: [...pages]
      .map(([pageNumber, views]) => ({ pageNumber, views }))
      .sort((a, b) => b.views - a.views || a.pageNumber - b.pageNumber)
      .slice(0, Math.max(0, Math.floor(topN))),
  };
}

export const REPORT_REASONS = ["wrong", "outdated", "offensive", "spam", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_REASON_LABELS: Readonly<Record<ReportReason, string>> = {
  wrong: "Wrong information",
  outdated: "Out of date",
  offensive: "Offensive or unsafe",
  spam: "Spam or scam",
  other: "Something else",
};
export const REPORT_NOTE_MAX = 200;

export function isReportReason(value: string): value is ReportReason {
  return (REPORT_REASONS as readonly string[]).includes(value);
}

/** Strips control characters, collapses whitespace, trims and caps the length. Idempotent. */
export function cleanReportNote(note: string): string {
  // eslint-disable-next-line no-control-regex
  return note.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, REPORT_NOTE_MAX).trim();
}

export type RateState = { windowStart: number; count: number };

/** Registers one hit. A new period starts when the old one is `windowMs` old. Fixed periods, so it needs one row per key. */
export function registerHit(prev: RateState | null, nowMs: number, windowMs: number): RateState {
  if (prev === null || !(nowMs - prev.windowStart < windowMs) || nowMs < prev.windowStart) return { windowStart: nowMs, count: 1 };
  return { windowStart: prev.windowStart, count: prev.count + 1 };
}

/** True when the hit that produced `state` is within the limit. */
export function withinLimit(state: RateState, limit: number): boolean {
  return state.count <= limit;
}
