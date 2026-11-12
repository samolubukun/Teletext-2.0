# Design: data connectors (Google Sheet and RSS/Atom)

A publisher links one page to a public Google Sheet (CSV export) or a feed. A job fetches it, turns it into blocks, and saves a new version of that page. Publishing rules stay the same: the connector never publishes a draft, it only updates the content of a page the publisher already owns.

## Decisions

1. Parsing and URL checks are pure functions in `packages/core/src/sources.ts`. The Convex action only fetches.
2. Sheets need no API key: the sheet must be shared "anyone with the link can view", and we fetch the CSV export. Private sheets are out of scope and the dashboard says so.
3. Server-side fetch protection (SSRF): https only, no credentials, standard port, no IP literals, no internal-looking names, sheet links must be on `docs.google.com`. The response is cut at 200,000 bytes, redirects are not followed, the request times out after 10 s.
4. Plan limit `dataSources` (Free 0, Pro 3, Organization 20) is checked in the mutation that links a source.
5. A cron runs every 15 minutes and syncs sources that have not been synced for their interval (15 min). "Sync now" is allowed once per minute per source.
6. If nothing changed, no new version is written (no history spam). A failed sync keeps the old content and stores a short reason for the owner to see.
7. Only org members with `page.write` can link, unlink or sync. The action is internal; clients call a mutation that schedules it.
8. Nothing personal goes to any AI service. Connectors do not use AI at all.

## Correctness properties (written before the code)

| Id | Property |
| --- | --- |
| C1 | `parseCsv` never throws; every result has at most 40 rows, 8 columns and 200 characters per cell, for any input including 50,000 characters, emoji and stray quotes |
| C2 | CSV round trip: any grid of non-empty-row cells (with commas, quotes, line breaks) written with standard quoting parses back to the same grid |
| C3 | `parseFeed` never throws, returns at most N items, and no title contains markup |
| C4 | `validateSourceUrl` never throws; an accepted URL is https, has a public-looking host, no credentials and no odd port; hostile addresses (loopback, private ranges, metadata hosts, numeric hosts, look-alike hosts) are always refused |
| C5 | `sheetBlocks` and `feedBlocks` output always passes `blocksSchema`, and the heading is at most 38 characters |
| C6 | `shortDate` never throws and returns "" or a string like `Thu 12 Nov` |
| C7 | Convex: a free plan cannot link a source; a viewer cannot; an outsider cannot; another organization's page cannot be linked |
| C8 | Convex: syncing writes a new version only when the blocks changed; a failed fetch keeps the current version and records the reason |
| C9 | Convex: the sync never changes a page's status (a draft stays a draft) |
