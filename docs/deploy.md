# Deploy checklist (Vercel + existing Convex dev deployment + Hexclave)

Decision: the live site uses the **existing Convex dev deployment** (no separate production deployment, no deploy key).
This is fine for a hackathon demo. Trade-off: dev deployments have lower limits and are not meant for real traffic.
Every step marked **you** needs your own login.

## 1. Push the Convex functions once (you)
From `apps/web`, make sure the dev deployment has the latest functions:
```powershell
cd apps/web
npx convex dev --once
```
Also confirm the Convex dashboard (dev deployment) has the environment variable `HEXCLAVE_PROJECT_ID`
(same value as `NEXT_PUBLIC_HEXCLAVE_PROJECT_ID` in `.env.local`). If you ever change Convex code, run the command again.

## 2. Vercel project (you)
1. Import the GitHub repo `samolubukun/Teletext-2.0` at vercel.com/new.
2. **Root Directory:** `apps/web`. Keep "Include source files outside of the Root Directory" ON, so the workspace
   packages (`packages/core`, `packages/ai`) are available.
3. **Install command:** `cd ../.. && npm install --no-audit --no-fund`
4. **Build command:** `npm run build` (the default; do not use `convex deploy`).
5. Environment variables (copy the values from `apps/web/.env.local`):
   | Name | Notes |
   | --- | --- |
   | `NEXT_PUBLIC_CONVEX_URL` | the dev deployment URL |
   | `NEXT_PUBLIC_CONVEX_SITE_URL` | from `.env.local` |
   | `NEXT_PUBLIC_HEXCLAVE_PROJECT_ID` | Hexclave project id |
   | `GEMINI_API_KEY` | mark Sensitive. Never prefix with `NEXT_PUBLIC_`. |
   | `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` | same as `.env.local` |
   | `RATE_LIMIT_SALT` | mark Sensitive. Any long random string. Without it, reader views and reports are refused in production. |
   Do not copy `CONVEX_DEPLOYMENT` (only the CLI needs it).
6. Deploy and note the URL.

## 3. Hexclave (you)
Add the Vercel URL as an allowed domain in the Hexclave dashboard (the config file cannot hold domains).
Check that Google sign-in and email + password both work on the live URL.

## 4. Seed the data (you)
The dev deployment may already be seeded (the e2e tests rely on it). If page 412 is missing:
```powershell
cd apps/web
npm run seed --workspace @teletext/web
```
All seed data is fake.

## 5. Demo login for judges (you)
1. Open `<vercel url>/dashboard` and sign up with a throwaway email and password (for example `judge@example.com`).
   Do not reuse a real password.
2. Copy that user's id from the Hexclave dashboard > Users.
3. Make that user the owner of the demo school:
   ```powershell
   cd apps/web
   npx convex run seed:claimDemo '{"userId":"PASTE_ID_HERE"}'
   ```
4. Put the email and password in the README table and in the Devpost form.

## 6. Verify the live site
- Reader: open `/p/412`, type `4` `1` `2`, press `R`.
- Browser dev tools > Network > "Slow 4G": page 412 should appear in under a second.
- Dashboard: sign in with the demo login, paste text, condense, publish, read it at `/p/<number>`.
- Lighthouse on `/`: record the PWA and Performance scores in `docs/kiro-notes.md`.

## Known open items
- **Offline deep links:** reloading `/p/412` while offline probably shows page 100, because the cached shell is `/`. Unverified.
- **Build log noise:** `next build` prints `InvariantError: cookies must not be used within a Client Component`.
  It comes from Hexclave's SDK (`lib/cookie.js` calls `cookies()` from `next/headers`) while static pages are generated.
  The build still succeeds and a Playwright check confirms `/dashboard` loads without an application error.
  Watch the Vercel build log once; if the build fails there, report the exact message.
