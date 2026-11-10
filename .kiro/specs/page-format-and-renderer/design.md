# Design Document: page-format-and-renderer

## Overview

`packages/core` (`@teletext/core`) converts `Block[]` into `Page[]` plus warnings. It is pure
TypeScript and is imported by the Next.js app (editor preview, reader adapter), by Convex
functions (render on save and publish), by `packages/ai` (condenser preview) and by
`packages/stacks` (card rendering).

## Architecture

### Pipeline

```
Block[]  ->  normalize  ->  layout (wrap, align)  ->  paginate  ->  decorate  ->  validate  ->  Page[] + Warning[]
```

Every stage is a pure function. No stage reads the clock or random numbers. The header time
comes from a `now` value passed in by the caller, which keeps rendering deterministic and testable.

### Where it runs

| Caller | Use |
| --- | --- |
| Convex mutation `pages.saveDraft` / `pages.publish` | Renders blocks and stores `rendered` on the version, so public reads never render |
| Next.js dashboard editor | Live preview on every keystroke (client side) |
| Next.js reader adapter | `toDisplayRows(page)` for `@techandsoftware/teletext` |
| `packages/ai` | Renders AI drafts before showing them |

## Components and Interfaces

### Core types (TypeScript)

Implemented in `packages/core/src/types.ts`.

```ts
type Color = 'black'|'red'|'green'|'yellow'|'blue'|'magenta'|'cyan'|'white';

type Block =
  | { type: 'heading'; text: string; level: 1 | 2 }
  | { type: 'paragraph'; text: string; tone?: 'normal' | 'alert' }
  | { type: 'bullets'; items: string[] }
  | { type: 'keyvalue'; rows: { label: string; value: string }[] }
  | { type: 'table'; header?: string[]; rows: string[][] }
  | { type: 'divider' }
  | { type: 'mosaic'; rows: string[] }
  | { type: 'link'; label: string; page: number };

type Token =
  | { kind: 'char'; ch: string }
  | { kind: 'ctl'; code: 'fg'|'bg'|'double'|'single'|'flash'|'steady'|'mosaic'|'text'; value?: Color };

type Row = Token[];            // exactly 40 tokens after decoration

type Page = {
  number: number;              // 100..899
  sub: number;                 // 1-based
  subCount: number;
  publisher: string;
  title: string;
  rows: Row[];                 // exactly 24 rows
  fastext: { color: 'red'|'green'|'yellow'|'blue'; label: string; page: number }[];
  updatedAt: string;           // ISO time passed in by the caller
};

type Warning = { level: 'error'|'warning'; code: string; message: string; fix?: string };

type RenderResult = { pages: Page[]; warnings: Warning[] };
```

### Public API

```ts
render(blocks: Block[], ctx: { number: number; publisher: string; now: string;
  fastext?: FastextLink[]; style?: StyleGuide }): RenderResult;

normalize(text: string): { text: string; warnings: Warning[] };
validatePage(page: Page, orgRange: [number, number]): Warning[];
toDisplayRows(page: Page): string[];   // adapter for the display library
isValidPageNumber(n: number): boolean; // done
isInRange(n: number, range: [number, number]): boolean; // done
```

### Key design decisions

1. **Control codes are tokens.** Because they take a cell, the wrapper measures width in tokens, never in characters. This avoids the most common teletext bug: lines that look short in text but overflow once colors are added.
2. **Attributes reset per row.** Colors do not carry across rows, so every row starts with its own color code when needed.
3. **Double-height rows consume two rows.** The paginator counts a double-height heading as two rows, and the row beneath is forced empty.
4. **Greedy wrapping first.** Start with simple greedy word wrap. Improve only if the tests and screenshots show a real problem.
5. **Pagination by rows, with keep-together rules.** Headings keep with the next two lines. Short tables stay on one sub-page when they fit.
6. **Warnings, not silent fixes.** Every change the renderer makes to the author's text (simplified letters, shortened labels, table fallback) is returned as a warning so the editor can show it.
7. **Style guide as data.** Colors per block type come from a `StyleGuide` object that mirrors `.kiro/steering/teletext-style.md`, so style rules can change without touching the algorithms.
8. **Display adapter is separate.** The page model does not depend on the display library, so the library can be swapped or wrapped. The adapter handles library details such as the 25-row screen and the Safari and iOS mosaic view.
9. **Rendered output is stored.** Convex stores `rendered` on each page version at save time, so the public read path is a single indexed lookup with no rendering.

## Data Models

### Allowed color pairs (minimum contrast rule)

On a black background, all seven non-black colors are allowed. Backgrounds other than black are
allowed only for headers and alert bars, using these pairs: white on blue, white on red, black on
yellow, black on cyan, black on white. Everything else is a validation error.

## Correctness Properties

Each property becomes a fast-check test with the generators noted. Test names start with the
property id.

| # | Property | Generators |
| --- | --- | --- |
| P1 | Every row has exactly 40 tokens | Random blocks of every type, random text including emoji, mixed scripts, very long words |
| P2 | Every page has exactly 24 rows, and body content uses rows 1 to 22 only | Same |
| P3 | No word is split unless it is longer than the available width | Random sentences and random long words |
| P4 | Joining the visible text of all sub-pages equals the normalized input text, ignoring markers | Random paragraphs and lists |
| P5 | `render(x)` equals `render(x)` (deterministic) | Any input |
| P6 | `normalize(normalize(t))` equals `normalize(t)` | Random strings, including control characters |
| P7 | Every color pair on a page is in the allowed list | Random blocks and tones |
| P8 | A heading is never the last visible line of a sub-page | Random block sequences, many headings |
| P9 | A double-height row is always followed by an empty row | Random headings |
| P10 | Every sub-page shows `n/total` and `n` is between 1 and `total` | Long inputs |
| P11 | Split tables repeat the header row on every sub-page | Random tables with many rows |
| P12 | Page numbers outside 100 to 899 are always rejected by the validator | Random integers and non-integers (implemented) |
| P13 | A serialized page is under 5 KB | Random inputs |
| P14 | `render` never throws, for any input, including empty and huge | Arbitrary strings up to 50,000 characters |
| P15 | Fastext always has at most four links, all labels fit in 40 cells | Random labels |

## Error Handling

The renderer never throws on bad content. It returns a page that says what is wrong in the
warnings, and still produces a valid page. Only a programmer error, such as an invalid `number`
in the context, throws.

## Testing Strategy

### Example-based tests (golden files)

Keep a `packages/core/fixtures/` folder with real inputs and the expected rendered pages as text
snapshots: a school notice, an exam results table, a clinic timetable, a transport alert, an FAQ,
and a very long article. Snapshot tests catch visual regressions that property tests miss.

### Edge cases to test on purpose

- Empty input, whitespace only, emoji only.
- A single 200-character word or URL.
- A table with 12 columns.
- A heading as the very last block.
- 50,000 characters of text (performance).
- Text with right-to-left letters (should degrade with a warning, not crash).
- A publisher name of 60 characters.
