// Plan limits (Appendix C7). Enforced on the server.

export type Plan = "free" | "pro" | "org";

export type PlanLimits = {
  publishedPages: number;
  rangeSize: number;
  dataSources: number;
  editors: number;
  scheduling: boolean;
  analytics: boolean;
  stacks: number;
  aiRequestsPerHour: number;
};

export const PLAN_LIMITS: Readonly<Record<Plan, PlanLimits>> = {
  free: { publishedPages: 10, rangeSize: 50, dataSources: 0, editors: 1, scheduling: false, analytics: false, stacks: 1, aiRequestsPerHour: 20 },
  pro: { publishedPages: 100, rangeSize: 100, dataSources: 3, editors: 3, scheduling: true, analytics: true, stacks: 5, aiRequestsPerHour: 100 },
  org: { publishedPages: 500, rangeSize: 200, dataSources: 20, editors: 20, scheduling: true, analytics: true, stacks: 50, aiRequestsPerHour: 500 },
};

export const PLAN_NAMES: Readonly<Record<Plan, string>> = { free: "Free", pro: "Pro", org: "Organization" };

/** D4: publishing is allowed only while the published count is below the plan limit. */
export function canPublishMore(plan: Plan, publishedCount: number): boolean {
  return publishedCount < PLAN_LIMITS[plan].publishedPages;
}
