# Implementation Plan: traffic-and-moderation

- [x] 1. Properties T1-T10 written in design.md before the code
- [x] 2. Pure helpers in `packages/core/src/traffic.ts` (device class, day key, view summary, report note, rate window) with property tests T1-T6
- [x] 3. Convex: `viewCounts`, `rateLimits`, `auditLog` tables; `lib/rateLimit.ts`, `lib/audit.ts`
- [x] 4. Convex: `traffic.recordView`, `traffic.summary` (Pro and up), `reports.submit/list/resolve`, `audit.list`; audit rows from pages, orgs and team mutations
- [x] 5. Next.js routes `POST /api/view` and `POST /api/report` (Zod, salted IP hash, fail closed without `RATE_LIMIT_SALT`)
- [x] 6. Reader: view beacon and "Report page" form
- [x] 7. Dashboard: Reader reports card, Analytics card, Activity log card (owner)
- [x] 8. convex-test suite for T7-T10 (`apps/web/tests/convex/moderation.test.ts`)
- [x] 9. Embeddable widget `/embed/[number]` with an iframe snippet on the poster page
- [x] 10. Demo checkout page `/dashboard/[orgId]/billing` (no payment, card data never leaves the browser)
- [ ] 11. Set `RATE_LIMIT_SALT` on Vercel and deploy the Convex schema (see docs/deploy.md)
- [ ] 12. Playwright: report a page as a reader, see it in the dashboard, take the page offline
