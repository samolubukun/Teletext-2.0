# Design Document: offline-pwa

## Overview

`public/sw.js` is a hand-written service worker (no Workbox dependency) registered by the reader in
production builds only. Cached page responses are re-served with an `x-teletext-cache: offline` header,
which the reader turns into the "OFFLINE COPY" badge.

## Architecture

- `tt-shell-v1`: `/`, manifest, icon; navigations and `/_next/static/*` are served cache first and refreshed in the background.
- `tt-pages-v1`: `/api/pages/*` responses. Network first with a 4 s timeout. A cache hit while the network fails is marked offline; a miss returns 504 with `x-teletext-cache: miss-offline`.
- Eviction today: delete the oldest entries beyond 200 (insertion order, because a hit rewrites the entry).

## Correctness Properties

The cache policy should become a pure function `nextCacheState(state, event)` so these can be tested
without a browser.

| # | Property | Status |
| --- | --- | --- |
| O1 | The cache never exceeds the size limit after any sequence of page views | open |
| O2 | The least recently used page is always the one evicted | open |
| O3 | A page served from cache is always labelled as cached when the network is down | open (needs Playwright) |
| O4 | Saving a range stores exactly the published pages of that range | open |

## Known gaps

"Save range" fetches 50 numbers; unpublished numbers return 404 and are not stored, which matches O4 only
by accident of the API. An update prompt for new app versions is not built.
