# Teletext 2.0

**Publish to the public in two minutes, read in two seconds.**

A modern, offline-capable teletext service. Schools, clinics, bus unions and community groups paste a
notice, AI condenses it into 40x24 teletext pages with a **fact guard** that checks every number and
date against the source, and they publish. Readers type a page number and get the page instantly on any
phone, even on a slow connection.

Built for **Kiroween 2026** (category: Resurrection) by one developer, with Kiro.

| | |
|---|---|
| Live app | _TODO: Vercel URL_ |
| Demo video | _TODO: YouTube URL_ |
| Try the reader | open the app and type `4` `1` `2` |
| Publisher demo login | _TODO: email / password (shared with judges in the Devpost form)_ |

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
npm test                    # unit and property-based tests (core + ai)
FC_RUNS=10000 npm test      # the heavy run: 10,000 generated cases per property
npm run typecheck
npm run check:boundary      # packages/core must stay pure
npm run pre-submit          # license, .kiro, secrets and README checks
```

Property-based tests (fast-check) cover the renderer invariants (every row is exactly 40 cells, no word is
split, pagination loses nothing, normalization is idempotent, and more), the reader's page-number entry,
page-range allocation, the publish workflow, the permission table and the fact guard.

## How it was built with Kiro

See [`.kiro/`](.kiro) and [`docs/kiro-notes.md`](docs/kiro-notes.md).

- **Specs:** one per module, each with requirements, design, tasks, and correctness properties written
  before the code.
- **Steering:** product, teletext style rules, tech rules, testing, security, AI usage, CardScript.
- **Hooks:** core tests on save, boundary guard, spec sync.
- **Property-based testing:** found real bugs that example tests missed (see the notes).
- **MCP:** the Convex MCP server lets Kiro inspect tables and run functions on the deployment.

## Credits and licenses

- The teletext screen renderer is original (MIT). Libraries such as `@techandsoftware/teletext` are
  AGPL/GPL, so they were intentionally **not** used.
- Dependencies: Next.js, React, Convex, Hexclave (`@hexclave/next`), `@google/genai`, Zod, Tailwind CSS,
  Vitest, fast-check. Each keeps its own license.
- Teletext background: ETSI EN 300 706.
- All demo data (people, IDs, phone numbers) is fake.

## License

MIT. See [LICENSE](LICENSE).
