# Implementation Plan: offline-pwa

- [x] 1. Manifest and icons (`manifest.webmanifest`, `icon.svg`, `icon-maskable.svg`)
- [x] 2. Service worker with shell cache and page cache (`public/sw.js`)
- [ ] 3. Page cache policy as a pure module with properties O1 and O2
- [x] 4. Strategies per route type, "Updated" time and "OFFLINE COPY" badge
- [x] 5. "Save this range for offline" (progress indicator still open)
- [ ] 6. Update prompt flow
- [ ] 7. Playwright offline tests (go offline, reload, navigate) covering O3
- [ ] 8. Lighthouse CI check in GitHub Actions
- [ ] 9. Verify install and offline behaviour on a real phone (the service worker only runs in production builds)
