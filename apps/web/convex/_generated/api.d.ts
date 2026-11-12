/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiUsage from "../aiUsage.js";
import type * as audit from "../audit.js";
import type * as crons from "../crons.js";
import type * as dataSources from "../dataSources.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_renderPage from "../lib/renderPage.js";
import type * as orgs from "../orgs.js";
import type * as pages from "../pages.js";
import type * as public_ from "../public.js";
import type * as reports from "../reports.js";
import type * as seed from "../seed.js";
import type * as team from "../team.js";
import type * as traffic from "../traffic.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiUsage: typeof aiUsage;
  audit: typeof audit;
  crons: typeof crons;
  dataSources: typeof dataSources;
  "lib/access": typeof lib_access;
  "lib/audit": typeof lib_audit;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/renderPage": typeof lib_renderPage;
  orgs: typeof orgs;
  pages: typeof pages;
  public: typeof public_;
  reports: typeof reports;
  seed: typeof seed;
  team: typeof team;
  traffic: typeof traffic;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
