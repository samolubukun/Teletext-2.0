# Design: page views, analytics, report-a-page, moderation, audit log

Package code: `packages/core/src/traffic.ts` (pure). Convex: `traffic.ts`, `reports.ts`, `audit.ts`, `lib/rateLimit.ts`, `lib/audit.ts`.

## Decisions

1. Views are counted by a beacon from the reader to `POST /api/view` (a Next.js route), so cached page reads stay cached and the reader still never loads the Convex client. The route calls a public Convex mutation.
2. Counters, not rows: one `viewCounts` row per (page number, UTC day) with mobile, desktop and other counters. No IP or user agent is stored, only the coarse device class.
3. Public writes (views, reports) are rate limited by a salted SHA-256 of the visitor IP, computed in the route (`RATE_LIMIT_SALT`). A public Convex mutation cannot see the IP, so the hash is an argument. An attacker can vary the hash, so each write also has a global cap per page and hour, enforced inside the mutation.
4. Reports belong to the organization that owns the page. Owners and editors of that organization see them and either dismiss them or archive the page (take it offline). There is no platform-wide admin in Stage 1.
5. Analytics need the plan flag `analytics` (Pro and Organization). The server checks it, not the UI.
6. Audit log: an append-only `auditLog` row for each sensitive action (publish, status change, restore, schedule, invite, role change, removal, plan change, report resolution). The owner reads it. Rows hold the actor id, never email or page text.
7. A day cutoff is passed from the client (`sinceDay`), because queries must not call `Date.now()`.

## Correctness properties (written before the code)

| Id | Property |
| --- | --- |
| T1 | `classifyDevice` returns one of mobile, desktop, other for every string, including 50,000 characters, emoji and empty |
| T2 | `dayKey` of every finite in-range time is a valid yyyymmdd and never decreases as time increases; out-of-range input gives 0 |
| T3 | `summarizeViews`: total equals the sum of the device split, the per-day series and the per-page counts; row order does not change the result |
| T4 | `byDay` is strictly ascending; `topPages` is sorted by views then page number and has at most N entries |
| T5 | `cleanReportNote` is idempotent, at most 200 characters, and has no control characters |
| T6 | `registerHit`: exactly `limit` hits inside one window are within the limit and the next one is not; a hit after the window starts a new count of 1 |
| T7 | Convex: a visitor can add at most one view per page per minute; over-limit reports are rejected; only a published page can be reported |
| T8 | Convex: reports are visible only to members of the page's organization; an outsider or viewer cannot resolve one; archiving from a report takes the page offline at once |
| T9 | Convex: analytics are refused on the free plan and never include another organization's pages |
| T10 | Convex: every sensitive mutation writes an audit row, and only the owner can read the log |
