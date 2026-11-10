# Technical rules

## Stack
- npm workspaces monorepo. Node 22+.
- apps/web: Next.js 16 (App Router, `cacheComponents` on) + TypeScript strict + Tailwind 4 for the dashboard.
  The teletext screen uses its own CSS, not Tailwind.
- Backend and database: Convex (apps/web/convex). Auth: Hexclave (formerly Stack Auth), `@hexclave/next`.
- AI: Google Gemini via the `@google/genai` SDK, called only from Convex actions.
- Zod for every external input. Vitest + fast-check for tests. Playwright for end-to-end.
- Teletext display: @techandsoftware/teletext (+ teletext-service, teletext-fonts).
- Hosting: Vercel (Next.js) + Convex cloud. Build command deploys Convex: `npx convex deploy --cmd "npm run build"`.

## Read the docs first
- Next.js 16 differs from older versions. Before writing Next.js code, read the relevant guide in
  `node_modules/next/dist/docs/`. Heed deprecations (for example `middleware` is now `proxy`).
- Hexclave changes quickly. Check https://docs.hexclave.com before using an SDK API.

## Structure
- packages/core: pure TypeScript. No DOM, no database, no network, no clock (`Date.now`, `new Date()`
  without an argument), no randomness (`Math.random`). Time and ids are passed in as arguments.
- packages/ai: prompts, Zod schemas, fact guard, evaluation harness. Pure where possible.
- packages/stacks: Stage 2. Pure interpreter. Never imported by Stage 1 code.
- apps/web/convex: schema, queries, mutations, actions, crons. Thin: call the packages.
- apps/web/src: UI and Next.js route handlers. Thin: call Convex and the packages.
- Workspace packages export TypeScript source (`main: ./src/index.ts`); Next.js and the Convex bundler compile them.

## Convex rules
- Every public query/mutation that touches organization data uses the `orgQuery` / `orgMutation`
  wrappers (convex-helpers custom functions). They read `ctx.auth.getUserIdentity()`, load the
  membership and check the role with the pure permission table from packages/core. Never hand-roll auth checks.
- Convex has no row-level security and no unique constraints. Enforce uniqueness (page numbers,
  slugs) inside the mutation using an index lookup. Mutations are transactional, so no locks are needed.
- Every function declares `args` and `returns` validators.
- Use `internalQuery` / `internalMutation` / `internalAction` for anything not called by a client
  (crons, scheduled jobs, AI calls).
- Network calls (Gemini, Google Sheets, RSS) only in actions. Use `"use node"` only when a Node API is required.
- Do not use `Date.now()` inside queries for filtering (it breaks caching and reactivity). Use
  `ctx.scheduler.runAt` to flip status at publish and expiry times.
- Use indexes (`withIndex`) instead of `.filter()` on large tables.

## Public reader rules
- The reader does not load the Convex client or the Hexclave SDK. It fetches
  `GET /api/pages/[number]` (a Next.js route handler that calls Convex `fetchQuery`)
  with `Cache-Control` headers, so the edge and the service worker can cache pages.
- Only dashboard routes (the `(dashboard)` route group) mount the Hexclave and Convex providers.

## Code rules
- No `any`. No non-null assertions without a comment explaining why it is safe.
- Validate every external input with Zod (requests, AI output, uploads, stack files).
- Small functions named for what they do. Prefer pure functions.
- Commit messages: type(scope): message, for example feat(core): paginate tables.
- Never commit secrets. Use environment variables and .env.example.
