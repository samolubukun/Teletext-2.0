# Implementation Plan: publisher-dashboard

- [x] 1. Permission table and status machine as pure modules (D2, D7)
- [x] 2. Range allocator (D1); no database lock needed on Convex
- [x] 3. Hexclave sign-in, organization creation, role checks in `convex/lib/access.ts`
- [ ] 3a. `convex-test` suite: two orgs, owner / editor / viewer / outsider (D3, security)
- [x] 4. Page list and editor shell with live preview
- [x] 5. Templates (Notice, Results table, Alert, Timetable, FAQ, Events)
- [x] 6. Validation panel using renderer warnings
- [x] 7. Publish flow, plan limits, fact confirmation, mock upgrade (D4)
- [ ] 8. Version history UI and restore (D5)
- [ ] 9. Scheduled publish and expiry with `ctx.scheduler.runAt` (D6)
- [x] 10. Fastext editor
- [ ] 10a. QR code and printable poster
- [ ] 10b. Mosaic logo tool
- [ ] 11. Analytics page (Pro)
- [ ] 12. Report-a-page and moderation queue
- [ ] 13. Playwright demo path: sign in, paste, condense, publish, read
