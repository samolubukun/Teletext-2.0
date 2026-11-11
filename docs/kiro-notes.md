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
