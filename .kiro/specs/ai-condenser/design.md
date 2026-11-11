# Design Document: ai-condenser

## Overview

`packages/ai` holds everything except the network call, which is injected (`ModelCall`). That keeps
orchestration, retries, fallback and the fact guard unit-testable with no network.

```
POST /api/ai/condense (Next.js route, Bearer token)
  -> Convex aiUsage.authorize   role check + hourly plan limit
  -> condense(source, withModelFallback([gemini-3.5-flash-lite, gemini-3.1-flash-lite], gemini))
       attempt 1 -> Zod parse -> ok? -> toBlocks -> factGuard
       attempt 2 (repair prompt with errors) -> ...
       both fail -> extractiveSummary (whole source sentences only)
```

- **Model call:** Gemini Interactions API (`client.interactions.create`) with `response_format`
  (`application/json` + JSON Schema), `store: false`, 20 s timeout, no SDK retries (we fall back instead).
- **Prompt:** `packages/ai/src/prompt.ts`, versioned (`condense-v2`). Rules are split into FACTS and STYLE.
- **Schema:** flat (`kind`, `text`, `items`, `pairs`) so Gemini's constrained decoding stays simple.
- **Fact guard:** regex rules in priority order (phone, ISO date, numeric date, "13 November", times,
  weekday, money, percent, number, then names). Matched spans are masked so a value is counted once.

## Correctness Properties

| # | Property | Status |
| --- | --- | --- |
| A1 | For any source and any draft built only from source values, unmatched is empty | tested |
| A2 | Inserting a number that is not in the source always makes it appear in unmatched | tested |
| A3 | Formatting variants of the same number compare equal | tested |
| A4 | 12-hour and 24-hour forms of the same time compare equal | tested |
| A5 | The fallback summary never contains a value that is not in the source | tested |
| A6 | Every draft returned to the editor passes the Zod schema and renders to valid pages | open |

## Evaluation harness (open)

`eval/condense.json` with 20 realistic sources and their must-keep facts; a script reports facts kept,
facts dropped, values invented and schema failures. Targets: zero invented values on all 20, at least 90 %
of must-keep facts kept. Record the score for every prompt version in `docs/kiro-notes.md`.

## Findings from real runs

Documented in `docs/kiro-notes.md`: label lines glued into fake names, titles swapped, a time regex eating a
full stop, and a range turned into "9am and 3pm" (not catchable by a value-level guard).
