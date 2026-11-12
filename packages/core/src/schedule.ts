// Scheduled publishing and expiry (publisher-dashboard D6). Pure: the current time is always an argument.
//
// A page in "draft" or "review" with a publishAt time is scheduled: it becomes "published" at that time.
// A "published" page with an expiresAt time becomes "archived" at that time.
import type { PageStatus } from "./workflow";

/** Furthest ahead a time can be scheduled. */
export const MAX_SCHEDULE_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;

export type Schedulable = {
  status: PageStatus;
  /** Epoch milliseconds. null or undefined = not set. */
  publishAt?: number | null;
  expiresAt?: number | null;
};

export type ScheduleProblem = { field: "publishAt" | "expiresAt"; message: string; fix: string };

export type DueAction = "publish" | "archive";

const isTime = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && Number.isInteger(n);

/**
 * Fails closed: an expiry that is set but is not a time after `now` (including NaN) counts as expired,
 * so corrupt data can never keep a page public. (Found by property S3: a NaN expiry never expired.)
 */
function hasExpired(expiresAt: number | null | undefined, now: number): boolean {
  return expiresAt != null && !(expiresAt > now);
}

/** Checks a schedule the publisher wants to set. Empty list = valid. */
export function validateSchedule(input: Schedulable, now: number): ScheduleProblem[] {
  const problems: ScheduleProblem[] = [];
  const { status, publishAt, expiresAt } = input;
  const limit = now + MAX_SCHEDULE_AHEAD_MS;

  if (publishAt != null) {
    if (status !== "draft" && status !== "review") {
      problems.push({
        field: "publishAt",
        message: `A ${status} page cannot be scheduled for publishing.`,
        fix: status === "published" ? "It is already public. Set an expiry time instead." : "Move the page to draft first.",
      });
    }
    if (!isTime(publishAt)) {
      problems.push({ field: "publishAt", message: "The publish time is not a valid date.", fix: "Pick a date and time again." });
    } else if (publishAt <= now) {
      problems.push({ field: "publishAt", message: "The publish time is in the past.", fix: "Pick a time in the future, or publish now." });
    } else if (publishAt > limit) {
      problems.push({ field: "publishAt", message: "The publish time is more than a year away.", fix: "Pick a nearer date." });
    }
  }

  if (expiresAt != null) {
    if (status === "archived") {
      problems.push({ field: "expiresAt", message: "An archived page cannot expire.", fix: "Move the page to draft first." });
    }
    if (!isTime(expiresAt)) {
      problems.push({ field: "expiresAt", message: "The expiry time is not a valid date.", fix: "Pick a date and time again." });
    } else if (expiresAt <= now) {
      problems.push({ field: "expiresAt", message: "The expiry time is in the past.", fix: "Pick a time in the future." });
    } else if (expiresAt > limit) {
      problems.push({ field: "expiresAt", message: "The expiry time is more than a year away.", fix: "Pick a nearer date." });
    } else if (publishAt != null && isTime(publishAt) && expiresAt <= publishAt) {
      problems.push({ field: "expiresAt", message: "The page would expire before it is published.", fix: "Pick an expiry time after the publish time." });
    }
  }
  return problems;
}

/** What should happen to this page right now, if anything. */
export function dueAction(page: Schedulable, now: number): DueAction | null {
  if ((page.status === "draft" || page.status === "review") && page.publishAt != null && page.publishAt <= now) return "publish";
  if (page.status === "published" && hasExpired(page.expiresAt, now)) return "archive";
  return null;
}

/** Applies every due action. Idempotent, and a page can only move forward: draft/review -> published -> archived. */
export function settle(page: Schedulable, now: number): Schedulable {
  let current: Schedulable = { ...page };
  for (let i = 0; i < 2; i++) {
    const action = dueAction(current, now);
    if (action === "publish") current = { ...current, status: "published", publishAt: null };
    else if (action === "archive") current = { ...current, status: "archived", expiresAt: null };
    else break;
  }
  return current;
}

/** Whether readers may see the page at time `now`. Expired pages are never visible, even if the job is late. */
export function isVisible(page: Pick<Schedulable, "status" | "expiresAt">, now: number): boolean {
  return page.status === "published" && !hasExpired(page.expiresAt, now);
}
