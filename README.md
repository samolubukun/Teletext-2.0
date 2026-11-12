# Teletext 2.0

**Publish to the public in two minutes, read in two seconds.**

A modern, offline-capable teletext service. Schools, clinics, bus unions and community groups paste a
notice, AI condenses it into 40x24 teletext pages with a **fact guard** that checks every number and
date against the source, and they publish. Readers type a page number and get the page instantly on any
phone, even on a slow connection.

Built for **Kiroween 2026** (category: Resurrection) by one developer, with Kiro.

| | |
|---|---|
| Live app | https://teletext-2-0.vercel.app |
| Demo video | _TODO: YouTube URL_ |
| Try the reader | open the app and type `4` `1` `2` |
| Publisher demo login | Sign in at `/dashboard` with email and password (not Google). Email `judge@example.com`, password `judge@example.com`. It owns the fake school "Greenfield High" (pages 400-449). Demo account only, all data is fake. |

## What it does

**Readers (free, no login)**
- Type a 3-digit page number (100 to 899). Arrow keys and swipe move between screens and pages.
- Red, green, yellow and blue **fastext** buttons (keys R, G, Y, B) jump to related pages.
- Authentic 40x24 teletext screen with colours, double-height headings and mosaic blocks; a live clock in the header.
- Classic, Clean (plain text) and Ticker modes; high-contrast and colour-blind-safe palettes; reduced motion;
  full screen-reader text layer; keyboard-only use.
- Installable PWA. Pages you have read work offline and are marked "OFFLINE COPY".
- Search by keyword, short links like `/p/412`, page 100 index, live pages that refresh every 60 seconds.

**Publishers (sign in with Google or email)**
- Create an organization and get your own range of page numbers.
- Three ways to make a page: **paste and condense with AI**, 6 templates (Notice, Results table, Alert,
  Timetable, FAQ, Events), or edit blocks by hand.
- Live preview from the exact same renderer the server uses, plus a validation panel with plain-language fixes.
- **Fact guard:** every number, date, time, amount and name in the AI draft is matched to a source sentence.
  Values that are not in the source are flagged red and must be confirmed before publishing.
- Draft, Review, Published and Archived states, roles (Owner, Editor, Viewer), plan limits enforced on the server.
- **Version history:** every save is a version; restoring copies an old one into a new version, so nothing is lost.
- **Scheduled publish and expiry:** pick a time and the page publishes or archives itself, with nobody signed in.
  Expired pages are never served, even if the job runs late.
- **Team:** the owner invites editors or viewers with one-time codes (7 days, single use, only a hash is stored),
  changes roles and removes members. Owners can never be removed.
- **QR poster:** a printable A4 poster per page with a QR code, the address and a big page number.

## Stack

Next.js 16 (App Router) - TypeScript strict - Convex (database and server functions) -
Hexclave (formerly Stack Auth) for sign-in - Google Gemini for condensing -
Vitest and fast-check for tests - Vercel for hosting.

## Repository layout

```
.kiro/                 specs, steering docs, hooks, MCP settings  (the Kiro part of the project)
apps/web/              Next.js app (reader, dashboard, API routes) and the Convex backend (convex/)
packages/core/         pure TypeScript: normalizer, layout, paginator, validator, page model
packages/ai/           fact guard, prompts, Gemini model fallback
docs/                  kiro-notes.md (running log), kiro-checklist.md
scripts/               boundary guard and pre-submit check
```

`packages/core` is deliberately pure: no browser, database, network, clock or randomness. That is what makes
it property-testable, and a hook plus `npm run check:boundary` enforce it.

## Run it locally

Requirements: Node 22+, a free [Convex](https://convex.dev) account, a [Hexclave](https://app.hexclave.com)
project and a [Gemini API key](https://aistudio.google.com/api-keys).

```bash
git clone https://github.com/samolubukun/Teletext-2.0.git
cd Teletext-2.0
npm install

cd apps/web
cp .env.example .env.local        # then fill in the values below
npx convex dev                    # first run creates your deployment and fills CONVEX_* values
npx convex env set HEXCLAVE_PROJECT_ID <your-hexclave-project-id>
npx @hexclave/cli@latest login
npx @hexclave/cli@latest config push --cloud-project-id <your-hexclave-project-id> --config-file ./hexclave.config.ts
npm run seed --workspace @teletext/web     # demo organizations and pages (all fake data)
cd ../..
npm run dev                       # http://localhost:3000
```

`apps/web/.env.local`:

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT` | written by `npx convex dev` |
| `NEXT_PUBLIC_HEXCLAVE_PROJECT_ID` | Hexclave dashboard |
| `GEMINI_API_KEY` | Google AI Studio. Server only; never prefix with `NEXT_PUBLIC_` |
| `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` | default `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite` |

Add `http://localhost:3000` (and your production URL) as a trusted domain in the Hexclave dashboard if sign-in
is refused.

## Tests

```bash
npm test                    # unit, property-based and Convex tests (core, ai, web)
FC_RUNS=10000 npm test      # the heavy run: 10,000 generated cases per property (core alone takes about 6 minutes)
npm run typecheck
npm run check:boundary      # packages/core must stay pure
npm run pre-submit          # license, .kiro, secrets and README checks
npm run e2e                 # Playwright reader, offline and axe tests against a local production build
npm run eval --workspace @teletext/ai   # AI condenser evaluation, 20 cases (needs GEMINI_LIVE=1 and GEMINI_API_KEY)
```

Run the end-to-end tests against a deployed site with `E2E_BASE_URL=https://your-site npx playwright test`.
The `*.live.spec.ts` files sign in with the demo account and exercise the full publish path, team invites, the QR poster
and a real scheduled publish and expiry.

- **Property-based tests (fast-check)** cover the renderer invariants (every row is exactly 40 cells, no word is
  split, pagination loses nothing, normalization is idempotent, and more), the reader's page-number entry,
  page-range allocation, the publish workflow, the permission table, the schedule rules and the fact guard.
- **Convex tests (`convex-test`)** cover permissions with two organizations and an owner, editor, viewer and outsider,
  version history, team invites and scheduling driven by fake timers.
- **AI evaluation:** 20 fake source documents with the facts that must survive; the score for each prompt version
  is recorded in `docs/kiro-notes.md`.

## How it was built with Kiro

See [`.kiro/`](.kiro) and [`docs/kiro-notes.md`](docs/kiro-notes.md).

- **Specs:** one per module, each with requirements, design, tasks, and correctness properties written
  before the code.
- **Steering:** product, teletext style rules, tech rules, testing, security, AI usage, CardScript.
- **Hooks:** core tests on save, boundary guard, spec sync, AI type-check and tests, style guard, secret guard.
- **Property-based testing:** found real bugs that example tests missed, including two that only appeared at 10,000 runs
  (see the notes).
- **MCP:** the Convex MCP server (`.kiro/settings/mcp.json`) is used to read the live schema and data, which found a
  bug in my own live test.

## Credits and licenses

- The teletext screen renderer is original (MIT). Libraries such as `@techandsoftware/teletext` are
  AGPL/GPL, so they were intentionally **not** used.
- Dependencies: Next.js, React, Convex, Hexclave (`@hexclave/next`), `@google/genai`, Zod, Tailwind CSS,
  Vitest, fast-check. Each keeps its own license.
- Teletext background: ETSI EN 300 706.
- All demo data (people, IDs, phone numbers) is fake.

## License

MIT. See [LICENSE](LICENSE).
