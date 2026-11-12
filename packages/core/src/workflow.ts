// Page status machine (publisher-dashboard requirement 8, property D2) and the approval rule (D8).
import type { Role } from "./permissions";

export type PageStatus = "draft" | "review" | "published" | "archived";
export const PAGE_STATUSES: readonly PageStatus[] = ["draft", "review", "published", "archived"];

const BASE: Readonly<Record<PageStatus, readonly PageStatus[]>> = {
  draft: ["review"],
  review: ["draft", "published"],
  published: ["archived"],
  archived: ["draft"],
};

export type WorkflowOptions = {
  /** Organizations with two or more editors can require review before publishing. */
  requireApproval?: boolean;
};

export function allowedTransitions(from: PageStatus, options: WorkflowOptions = {}): PageStatus[] {
  const moves = [...BASE[from]];
  if (from === "draft" && !options.requireApproval) moves.push("published");
  return moves;
}

export function canTransition(from: PageStatus, to: PageStatus, options: WorkflowOptions = {}): boolean {
  return allowedTransitions(from, options).includes(to);
}

/**
 * Who may make a page public right now, by publishing or by scheduling (D8).
 * Viewers never can. With approval required only the owner can, so editors send pages for review.
 */
export function canPublishNow(role: Role, options: WorkflowOptions = {}): boolean {
  if (role === "viewer") return false;
  if (options.requireApproval) return role === "owner";
  return true;
}
