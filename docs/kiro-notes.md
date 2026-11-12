# Kiro notes (running log for the write-up)

Three lines a day: what Kiro did well, what it got wrong, what changed in a steering doc or spec.

## Tue 10 Nov 2026

**Setup**
- Wrote 7 steering docs adapted to Next.js 16 + Convex + Hexclave (Stack Auth was renamed Hexclave) + Gemini.
- Wrote the `page-format-and-renderer` spec with 15 correctness properties *before* the code.
- Hooks: Core tests (on save in packages/core), Boundary guard (core stays pure), Spec sync (requirements.md saved).
- The boundary guard was proven with a deliberate violation (`Date.now()` + `Math.random()` in a probe file): it failed with exit 1, then the probe was deleted.

**Decision: our own screen renderer instead of @techandsoftware/teletext**
- While installing, found that `@techandsoftware/teletext` and `teletext-service` are AGPL-3.0 and
  `image-to-sextants` is GPL-2.0. The repo is MIT. The page model already separates the display
  adapter (design decision 8), so swapping the display library cost nothing.

**Property tests that found real bugs (keep for the write-up and video)**
1. **P8 (heading never last on a sub-page)** failed after 7 runs. Shrunk counterexample: three
   double-height headings, the first one ~150 characters long, then a one-word paragraph. A heading
   that wraps to many double-height rows cannot be kept with its content on one sub-page.
   Fix: headings longer than 2 double-height lines (or 3 normal lines) are shown as normal text with a
   `heading-too-long` warning. A unit test with hand-written headings would never have tried a
   150-character heading.
2. **Yoruba tone marks**: the example test for "\u1EB9k\u00E1\u00E0b\u1ECD\u0300" failed because a *separate*
   combining accent (U+0300) after a letter was counted as an unknown symbol and reported as
   "removed emoji". Fix: normalize to NFC first and drop standalone combining marks as a simplification.
3. **Golden fixture review**: the school notice snapshot split the phone number "0800 000 0000"
   across two lines. Added digit-group gluing to the wrapper; the first version had a bug (it tested
   the joined string instead of the last word), caught because the snapshot did *not* change.

**Numbers so far**: 44 tests in packages/core, 1,000 runs per property (P1-P15, R1-R5, D1, D2, D4, D7).

**Tooling friction**
- `npx convex dev` hangs in the agent shell (interactive prompts). `CONVEX_AGENT_MODE=anonymous`
  in a background process created a local deployment and generated `convex/_generated`.

## Wed 11 Nov 2026 - Gate B passed (13 days early)

- Signed in with Hexclave, created an org (pages 200-249), pasted a fake school notice, condensed it
  with Gemini, fact guard checked 14 values, published page 201, read it at /p/201. 1,423 bytes.
- Models: gemini-3.5-flash-lite primary, gemini-3.1-flash-lite fallback. In 2 of 3 live runs the primary
  was fine; once it returned 503 "high demand" and the fallback answered. Keep the fallback.
- gemini-3.8-flash was listed for the key but returned 503, so it is not the default.

**Bugs the real run found (none of these were caught by the unit tests)**
1. Fact guard glued labels on separate lines ("Where / Main Hall / Fees") into one fake name.
2. Fact guard flagged "Principal Adaeze Okafor" because the source said "Mrs Adaeze Okafor". Titles are
   now ignored when comparing names.
3. The time regex ate the sentence's full stop: "8am." instead of "8am".
4. **The fact guard cannot see changed meaning.** The AI turned "between 9am and 3pm" into
   "9am and 3pm". Both times exist in the source, so the guard passed it. The fix is in the prompt
   (condense-v2: ranges stay ranges), not in code. Write-up point: a value-level guard and a
   meaning-level prompt rule are two different layers.
5. Reader search treated "200" as a keyword. A three-digit entry now opens that page.

**Prompt versions**: condense-v1 -> condense-v2 (ranges, conditions, sender line, label length).
Evaluation harness (20 documents) is still to do; record the score here when it exists.

## Wed 11 Nov 2026 - repo pushed, CI found a test bug

- Pushed to https://github.com/samolubukun/Teletext-2.0 (public, MIT detected). History scanned: no API key,
  no private planning document in any commit.
- **CI caught a bug in a property test, on a different random seed than my local runs.** P4 failed after 165
  cases (seed -514409881). Shrunk counterexample: one heading whose text is a single Unicode hyphen.
  The renderer was right (it keeps "-" as content). My test helper stripped hyphens *before* deciding
  whether the input was empty, so it expected the "No content yet." page. Lesson for the write-up:
  a randomised test is only as good as its oracle; a fixed local seed hides this, CI's fresh seed found it.
  The counterexample is now a permanent regression test.
- CI also caught a setup mistake: Hexclave refuses a project id that is not a well-formed UUID, so the build job
  needs a real-looking placeholder.
- Added: live header clock in the reader, README, specs for reader-app / offline-pwa / publisher-dashboard /
  ai-condenser, hooks (AI tests, secret guard, style guard), `npm run pre-submit`, `docs/kiro-checklist.md`.
- Blocked: Kiro does not let the agent write `.kiro/settings/` (MCP config). Pasted by hand instead.

## Thu 12 Nov 2026 - permission tests and the AI evaluation harness

- Added `convex-test` suite (9 tests): two orgs, owner / editor / viewer / outsider, signed-out callers, range and
  plan-limit rules, public read of drafts. All pass first time, so no bug found there; the value is the proof that
  the server, not the UI, enforces roles.
- Added the evaluation harness: 20 fake sources in `packages/ai/src/eval-cases.ts`, each with must-keep values and
  optional meaning-level phrases. Offline tests check the cases themselves (every must-keep value is in its source)
  and the extractive-fallback baseline (invents nothing). Live run: `npm run eval --workspace @teletext/ai`.

**Scores (gemini-3.5-flash-lite, live)**

| Prompt | Values kept | Invented values | Phrase checks passed | Fallbacks |
| --- | --- | --- | --- | --- |
| condense-v2 | 100% | 1 | 95.2% (1 of 21 missed) | 0 of 20 |
| condense-v3 | 100% | 0 | 95.2% (1 of 21 missed) | 0 of 20 |

- v2 failures the harness found: "at least 70 percent" lost "at least" (the value guard cannot see this, the phrase
  check did), and "a ruler" became "1 ruler", which the guard flagged as an invented "1".
- v3 adds two prompt rules (keep qualifiers; never turn words into digits). The invented "1" is gone.
- Still open: in v3 the `exception` case misses its "except|but" phrase, and the missing phrase changes between runs
  (model output is not deterministic). The phrase checks are regexes, so some misses may be valid rewordings.
  Next step: read the actual drafts for the missed cases before changing the prompt or the regex.

## Thu 12 Nov 2026 - Playwright reader tests and axe

- Added `playwright.config.ts` and `tests/e2e/reader.spec.ts`: 12 tests on desktop and on a Pixel 7 profile (24 runs, all green).
  They cover page 100, typing 412, the typed-digits header, fastext keys and buttons, out-of-range and missing pages,
  the 5 KB payload and cache header, API validation, clean mode, search, offline reading with the OFFLINE COPY badge, and
  axe (WCAG 2 A/AA, serious and critical) on `/` and `/p/412`. Run: `npm run e2e` (needs `npm run seed --workspace @teletext/web` once).
- **Real bug found by the first run:** `/p/412` rendered two readers. The `Suspense` fallback in `app/p/[number]/[[...sub]]/page.tsx`
  was a full `<Reader initialNumber={100} />`, so two copies mounted (duplicate screen-reader text, and the fallback could
  rewrite the address bar to `/`). Fixed with an empty placeholder. Unit tests could never see this; the strict-mode locator error did.
- **Test lesson:** Playwright's `context.setOffline(true)` does not stop requests made by the service worker itself, so the
  worker still reached the server and no OFFLINE COPY badge appeared. The service worker was fine. The test now aborts
  `/api/pages/**` with `context.route` plus `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1`.
- axe found no serious or critical issues on the reader (only those two pages and those two rule tags were checked).
- Open: the server log shows `InvariantError: cookies must not be used within a Client Component` while the production
  build serves pages. The reader works, but the source is probably the dashboard routes (Hexclave). Not investigated yet.

## Thu 12 Nov 2026 - tidy before deploy

- **Steering vs code:** `tech.md` and `ai-usage.md` said Gemini is called "only from Convex actions", but it runs in the
  Next.js route `/api/ai/condense`. Updated the docs to match the code (and said why). `tech.md` also still named the AGPL
  `@techandsoftware/teletext` display library, which we replaced with our own renderer on 10 Nov; fixed that line too.
  Lesson for the write-up: steering docs drift from the code as decisions change, and a reader will notice.
- **The `cookies()` InvariantError:** it appears only during `next build` (static page generation), never at runtime. Source:
  Hexclave's SDK (`@hexclave/next` `lib/cookie.js` calls `cookies()` from `next/headers`). Not our code, and the build
  exits 0. Added a Playwright check that `/dashboard` loads signed out with no page error or "Application error" text
  (26 tests green now). Left as known build-log noise rather than patching the SDK.
- Deployment will use the existing Convex dev deployment (decision: simplest for a hackathon demo). `docs/deploy.md` rewritten for that.

## Thu 12 Nov 2026 - live site checks

- Live: https://teletext-2-0.vercel.app. `E2E_BASE_URL=<url> npx playwright test` now runs the same specs against a deployed site.
- **Demo path passes live** (`tests/e2e/demo-path.live.spec.ts`, 1.1 min): sign in as the judge account through Hexclave's hosted page, see
  Greenfield High (pages 400-449), paste a fake notice, condense with the real Gemini call, publish, read it as an anonymous visitor, archive it.
  The test reuses one page titled "E2E demo path" so it never fills the range.
- Reader and axe specs pass live on desktop and Pixel 7 (26 tests after fixing one assertion).
- **Test bug, not an app bug:** the 5 KB test expected `s-maxage` in `Cache-Control`. Vercel's edge consumes it and shows clients
  `public, max-age=0`, reporting caching in `x-vercel-cache`. The test now checks that header when run live.
- **Setup gotchas worth remembering:** Hexclave's hosted sign-in page never fires `load`, so tests must wait for the form
  (`waitUntil: "commit"`). The trusted-domain field wants the host only, with no trailing space.

## Thu 12 Nov 2026 - Lighthouse found a real performance bug

- Lighthouse 12 on the live site (mobile profile, 4x CPU slowdown): **Performance 64**, Accessibility 100, Best Practices 100, SEO 100.
  FCP 0.8 s, LCP 1.4 s, but **Total Blocking Time 6,620 ms** and Speed Index 6.4 s. Transfer size was only 192 KiB, scripting 0.6 s.
  The main-thread breakdown showed **Style & Layout 12.2 s** on a page with 1,071 elements.
- Cause (found by measuring, not guessing): `--cell-w: calc(100cqw / 40)` on `.tt-screen` is an unregistered custom property,
  so each of the ~960 cells re-resolved the container-query unit itself. Removing the cqw made style recalculation about 35x cheaper in a
  Chrome probe; the probe was noisy, so Lighthouse is the real check.
- Fix: two `@property` registrations (`--cell-w`, `--cell-h` as `<length>`) in `globals.css`. Local production build: **Performance 93**,
  TBT 250 ms, Style & Layout 256 ms, Accessibility 100. Screenshots before and after look identical.
- Lesson for the write-up: all functional tests and axe were green while the page cost 6.6 s of main-thread blocking on a throttled CPU.
  Only a performance tool saw it. Real-device tests on cheap phones matter for exactly this reason.
- To verify after the Vercel redeploy: rerun `npx lighthouse@12 https://teletext-2-0.vercel.app/` and record the live score here.

### Correction: live Lighthouse after the fix (3 runs)

- The local 93 did **not** carry over. Live Performance after the fix: 69, 64, 67 (before: 64). Total Blocking Time 6,620 ms -> 1,130 / 2,740 / 1,210 ms.
  Style & Layout fell from 12 s to 0.5 s, so the CSS bug was real and is fixed, but the score barely moved. Accessibility, Best Practices and SEO stay at 100.
- Remaining cost: Speed Index 4.6-6.5 s. The reader paints nothing until JavaScript runs and `/api/pages/100` returns (HTML -> JS -> fetch -> render),
  and one 840 ms hydration task remains. Likely fix: server-render the first page into the HTML. **Decision (12 Nov): leave it.** Revisit only if time is left after the Kiro items.
- Lesson: one good local run is not a result. Run the live check several times before writing a number down.

## Thu 12 Nov 2026 - team invites and version history

- Added version history with restore (D5) and a Team feature: the owner creates a one-time invite code (editor or viewer, 7 days),
  the invited person enters it at `/dashboard/join`. 11 convex-test cases cover single use, hashed storage, one shared error for
  unknown / expired / revoked codes, owner-only management, cross-organization isolation, and "an owner can never be demoted or removed".
- Design choices: Convex only knows Hexclave user ids, not emails, so codes beat "invite by email". Only a SHA-256 hash is stored.
  Roles never include owner via invites. Expiry is compared in the mutation (`Date.now()` is fine there) and shown by the client, not filtered in a query.
- Known gap: no rate limit on `acceptInvite` guesses. A 12-character code from a 31-letter alphabet is about 59 bits, so guessing is not practical,
  but the security steering doc asks for rate limits on lookups; add one if time allows.
- Known lint debt (older code, not from today): `react-hooks/set-state-in-effect` in `Reader.tsx` and the editor page, and a plain `<a href="/dashboard">` in `Reader.tsx`. CI does not lint the web app yet.

## Thu 12 Nov 2026 - scheduled publishing, and three bugs from stronger properties (two only appeared at 10,000 runs)

- Built scheduled publish and expiry (D6). Pure rules first in `packages/core/src/schedule.ts` with properties S1-S4 written before the Convex code;
  then `pages.setSchedule` (owner and editor), the `applySchedule` job fired by `ctx.scheduler.runAt`, a Schedule card, and a guard in
  `/api/pages/[number]` so a late job cannot leave an expired page readable. 12 convex-test cases drive the scheduler with fake timers.
- **Bug 1 (found by S3, my own stronger property):** an `expiresAt` of `NaN` never counted as expired (every comparison with NaN is false), so a page
  could stay public forever. The UI cannot send NaN, but Convex accepts it and corrupt data must fail closed. Rule is now "set but not after now = expired".
  Shrunk case kept as a regression test. I only found it because my first S3 contained a tautology that I noticed and replaced with a real property.
- **Bug 2 (A5, only at FC_RUNS=10000, seed -1500802222):** source text `MOn`. The fallback summary uppercases its title, `MON`, and the fact guard reads
  that as Monday: the "never invents a value" fallback invented a weekday. Fix: keep the original case when uppercasing would change the values in the title.
  This failed at 10,000 runs and not at 1,000: the reason to run the big number before submission.
- **Bug 3 (P-E2, my new eval property, seed -1307602928):** `Aa AbA` produced the name `Aa Ab`, because the name regex had no word boundary after each word.
  A real fact-guard defect, found by a property written for a different purpose. Fixed with `\b`.
- Gate A evidence: all 57 core tests pass at FC_RUNS=10000 (357 s); ai package 26 tests pass at 10,000.
- Test lesson: after changing the public route, the first e2e run failed 2 of 26 on cold start and passed 26 of 26 on re-run; the assertion timeout is now 10 s.

## Thu 12 Nov 2026 - first real use of the Convex MCP server

- Connected `.kiro/settings/mcp.json` (Convex MCP, `npx convex mcp start`). From the agent I could list deployments, read the live schema,
  page through tables and run one-off read-only queries against the dev deployment, without opening the Convex dashboard.
- **What it found:** (1) confirmed `judge@example.com` is recorded as owner of Greenfield High; (2) the live demo-path test had been leaving a new archived
  page behind on every run (401, 402, 403). I had written in the notes that it reused one page. It looked the page up by title, but condensing renames the page
  to the AI's heading, so the lookup missed and it created another. The test now always uses page 449. Two live runs afterwards left exactly one page (449, archived),
  checked with a one-off query. Lesson: I stated a behaviour in the notes without checking the data; the MCP let me check it in seconds.
- **What it could not do:** the production deployment shows as read-only, and there is no delete tool, so the three leftover archived pages (401-403) stay in the
  demo school's list until a delete mutation exists. The one-off query tool is read-only, so it cannot fix data either.
- No Kiro Power for Convex, Vercel or GitHub showed up in the Powers list on this machine, so none is installed yet.

## Thu 12 Nov 2026 - QR poster, and live checks of Team, poster and scheduling

- **QR poster** (`/dashboard/[orgId]/pages/[pageId]/poster`): QR code (MIT `qrcode`, error correction H), big page number, address, print button, an ink-saving
  and a teletext theme. The tests decode a real QR image back with an independent decoder (`jsqr`, dev-only, Apache-2.0) and require the exact link.
  A probe measured how much damage the code survives: a block of 12% of the width wiped out at five positions still scans; 18% over the alignment pattern does not.
  My first damage test used an unlucky position and failed; I measured before deciding what to claim. ESLint also made me replace a setState-in-effect with `useSyncExternalStore`.
- **Live results on https://teletext-2-0.vercel.app:**
  - Team: the owner creates an invite code and revokes it (the invites table ended empty, checked through the Convex MCP).
  - Poster: the QR code on the real poster decodes to `https://teletext-2-0.vercel.app/p/449`.
  - Scheduling: a draft scheduled 2 minutes ahead appeared in the public API at its time with nobody clicking, then disappeared at its expiry time (5.6 min test).
    A first, failed run also proved the scheduler works without any browser: it left page 449 scheduled, and later the database showed it archived 10 ms after its
    `expiresAt`, with the schedule fields cleared.
- **Bug found by the live test:** the Schedule card was keyed on its own publish and expiry times, so every successful save remounted it and threw away the
  "Schedule saved" message. The save itself worked (the database had the times). Now keyed on status and failure note only. Unit tests could not see this; a real browser did.
- Test hygiene: the redirect to Hexclave's hosted sign-in can take over 30 s on a freshly deployed site, so the timeout is 90 s; revoking invites tolerates buttons that
  vanish as the list updates live.
- Postman: the Postman power was mentioned as available but is not installed in this Kiro; an API collection for `/api/pages` and `/api/search` would fit if it is added.
