# Requirements Document: offline-pwa

## Introduction

Pages the reader has viewed keep working without a network, and a cached page is never mistaken for a
live one.

## Requirements

### Requirement 1: Installable

1. THE app SHALL be installable (manifest, icons, standalone display) and pass the Lighthouse PWA checks.

### Requirement 2: Caching

1. THE service worker SHALL cache the app shell and page 100 on first load.
2. Every page the reader views SHALL be cached for offline use.
3. A "Save this range for offline" action SHALL download the 50 page numbers around the current page.
4. Strategies: app shell cache first with background refresh; `/api/pages/*` network first with a short timeout and cache fallback.
5. THE cache SHALL have a size limit and remove the least recently used pages first.

### Requirement 3: Honesty about freshness

1. Every page SHALL show "Updated hh:mm"; a copy served without the network SHALL show an "OFFLINE COPY" badge.
2. WHEN offline and a page is not cached, THE reader SHALL say so clearly and point to the index.
3. WHEN a new version of the app is available, THE app SHALL tell the reader and update on request, never in the middle of reading.
4. Interactive stacks (Stage 2) that need the server SHALL say "This page needs a connection" when offline.
