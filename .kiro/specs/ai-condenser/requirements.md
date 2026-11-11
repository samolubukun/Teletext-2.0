# Requirements Document: ai-condenser

## Introduction

Publishers paste text; Gemini returns a structured draft; the fact guard shows exactly which values are
backed by the source. A human always reviews before publishing.

## Requirements

### Requirement 1: Draft

1. WHEN a publisher submits source text, THE condenser SHALL return structured blocks (title, key facts, short body, suggested fastext labels), never finished teletext rows.
2. THE AI response SHALL be JSON matching the Zod schema. WHEN it does not, THE condenser SHALL retry once with the validation errors, then fall back to a plain extract of whole source sentences and tell the publisher.
3. THE condenser SHALL pass blocks through `render()` so the preview is exact.
4. THE condenser SHALL accept at most 20,000 characters of source and say so when longer.

### Requirement 2: Fact guard

1. THE guard SHALL extract all numbers, dates, times, money amounts, phone numbers, percentages and names from the source and the draft.
2. Every such value in the draft SHALL be matched to a source sentence after normalization (`2,500` = `N2500`; `2pm` = `14:00`; titles such as Mrs and Principal are ignored in names).
3. Unmatched values SHALL be flagged as "not in your source" and highlighted.
4. THE editor SHALL show, for each matched value, the source sentence it came from.
5. THE guard SHALL report dropped facts (values in the source missing from the draft) with an "Add back" action.
6. Publishing a draft with unmatched values SHALL need an explicit "I checked these" confirmation.

### Requirement 3: Safety and cost

1. THE Gemini key SHALL live only in server environment variables.
2. Requests SHALL be rate limited per organization by plan, with a clear message when the limit is hit.
3. Personal data uploaded for Stage 2 tables or submissions SHALL never be sent to the AI service.
4. WHEN the primary model fails (for example a 503), THE condenser SHALL try the fallback model before giving up.

### Requirement 4: Limits of the guard (stated honestly)

The guard checks values, not meaning. A draft can change a range into two times, or drop a condition,
without any value changing. The prompt rules (ranges stay ranges, keep conditions) and the human review
cover this.
