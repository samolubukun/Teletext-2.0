# Design Document: publisher-dashboard

## Overview

Next.js client pages under `(dashboard)` use Convex hooks; only this route group mounts the Hexclave and
Convex providers, so the public reader stays small. The browser gets a Convex token from
`hexclave.getConvexClientAuth`; Convex verifies the Hexclave JWT (`convex/auth.config.ts`).

## Architecture

- `convex/lib/access.ts`: `requireOrgAccess(ctx, orgId, action)` loads the membership and checks the
  pure permission table from `@teletext/core`. Every org-scoped function calls it. There is no row-level
  security in Convex, so this is the single choke point.
- `convex/orgs.ts`: create (range allocation via `allocateRange`), list, get, mock plan change.
- `convex/pages.ts`: list, get, create, save (validates blocks with Zod, renders, stores version),
  setStatus (state machine, plan limit, confirmation), setLive.
- `convex/public.ts`: unauthenticated reads of published pages only.
- Convex mutations are serializable transactions, so allocating a range and checking page-number
  uniqueness inside one mutation cannot race. No lock is needed.
- The AI call runs in `/api/ai/condense` (Next.js route) and is authorized by Convex (`aiUsage.authorize`).

## Correctness Properties

| # | Property | Status |
| --- | --- | --- |
| D1 | Over any sequence of sign-ups, allocated ranges never overlap and stay inside the allowed numbers | tested (pure allocator) |
| D2 | Only the allowed status moves succeed | tested |
| D3 | A page number outside the organization's range is always rejected | implemented in `pages.create`; open: convex-test |
| D4 | After any sequence of publish and archive actions, the published count never exceeds the plan limit | tested (pure rule); open: end-to-end |
| D5 | Restoring version N then reading the page gives exactly the content of version N | tested (convex-test): restore copies version N into a new version; permissions and cross-page lookups checked |
| D6 | An expired page is never returned by the public API | tested: core S1-S4 (10,000 runs) and convex-test with fake timers; the /api/pages route also checks expiresAt, so a late job cannot leave an expired page readable |
| D7 | For every role and action pair, the permission function matches the permission table | tested |

## Security notes

Two organizations and three users (owner, editor, viewer) plus an outsider must be tested with
`convex-test`: the outsider reads nothing, the viewer cannot write, an editor cannot touch another
organization. This is the main open risk on the dashboard.
