// Page status machine (publisher-dashboard requirement 8, property D2).

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
