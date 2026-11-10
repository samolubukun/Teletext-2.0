# Requirements Document: page-format-and-renderer

## Introduction

The renderer turns structured content blocks into valid teletext pages: 40 columns by 24 rows,
with a header row, a body, and a fastext bar. It is the foundation of the reader, the editor
preview, the AI condenser and the Stage 2 stack cards. It lives in `packages/core` (pure
TypeScript, no browser, database, network, clock or randomness).

## Glossary

- **Block:** one unit of input content (heading, paragraph, bullet list, key-value rows, table, divider, mosaic image, link).
- **Cell:** one of the 40 positions in a row.
- **Spacing attribute (control code):** a code that changes color, height or flashing. In teletext it occupies a cell itself and shows as a blank.
- **Visible character:** a cell holding printable text.
- **Sub-page:** one screen of a longer page, shown as `1/3`, `2/3`, `3/3`.
- **Body:** rows 1 to 22. **Header:** row 0. **Fastext bar:** row 23.

## Requirements

### Requirement 1: Normalization

**User Story:** As a publisher, I want pasted text to be cleaned automatically, so that it displays correctly on the teletext screen.

#### Acceptance Criteria

1. WHEN text contains curly quotes, long dashes, non-breaking spaces or tabs, THE renderer SHALL replace them with the plain equivalents.
2. WHEN text contains emoji or symbols with no teletext equivalent, THE renderer SHALL remove them and record a warning.
3. WHEN text contains accented letters that are not in the supported character set (for example Yoruba letters such as the dotted e, o and s), THE renderer SHALL replace them with the closest base letter and record a warning listing what changed.
4. WHEN text contains repeated spaces or blank lines, THE renderer SHALL collapse them.
5. THE normalizer SHALL be idempotent: normalizing already normalized text changes nothing.

### Requirement 2: Line layout

**User Story:** As a reader, I want text to wrap neatly, so that nothing is cut off or hard to read.

#### Acceptance Criteria

1. THE renderer SHALL fit every row into exactly 40 cells, counting spacing attributes as cells.
2. THE renderer SHALL wrap text at word boundaries.
3. WHEN a single word is longer than the row can hold, THE renderer SHALL split it with a hyphen.
4. THE renderer SHALL keep a number together with its unit (for example `10 am`, `5 km`, `N2,500`) where possible.
5. THE renderer SHALL render a double-height heading across two rows and keep the row below it empty.
6. THE renderer SHALL apply the colors from the style guide: headings yellow, body white, links cyan, alerts red.

### Requirement 3: Block layout

**User Story:** As a publisher, I want lists, key-value rows and tables to lay out cleanly, so that structured information stays readable in 40 columns.

#### Acceptance Criteria

1. Bullet lists SHALL use a consistent bullet and a hanging indent so wrapped lines align.
2. Key-value rows SHALL align values in a column when they fit, and stack label above value when they do not.
3. Tables SHALL assign column widths from their content. WHEN a table cannot fit in 40 cells, THE renderer SHALL fall back to stacked key-value rows and record a warning.
4. Numbers in tables SHALL be right-aligned.
5. Mosaic blocks SHALL be validated to fit within the grid.

### Requirement 4: Pagination

**User Story:** As a reader, I want long content to be split into screens I can step through.

#### Acceptance Criteria

1. THE renderer SHALL fill at most 22 body rows per sub-page.
2. THE renderer SHALL NOT leave a heading as the last visible line of a sub-page.
3. WHEN a table is split, THE renderer SHALL repeat its header row on each sub-page.
4. THE renderer SHALL show the sub-page position (`1/3`) on every sub-page, and a "continued" marker where content continues.
5. Joining the visible text of all sub-pages SHALL give back the visible text of the input (after normalization), with nothing lost or added except markers.
6. Rendering the same input twice SHALL give identical output.

### Requirement 5: Header and fastext

**User Story:** As a reader, I want every page to show where I am and where I can go next.

#### Acceptance Criteria

1. Row 0 SHALL show the page number, the publisher name (shortened if needed) and the date and time.
2. Row 23 SHALL show up to four fastext links in red, green, yellow and blue, each with a short label.
3. WHEN a label is too long, THE renderer SHALL shorten it and keep the four labels within 40 cells.
4. WHEN no fastext links are supplied, THE renderer SHALL default to: red = index (100), green = previous, yellow = next, blue = help or contact page.

### Requirement 6: Validation

**User Story:** As a publisher, I want clear warnings about problems on my page, so that I can fix them before publishing.

#### Acceptance Criteria

1. THE validator SHALL check every page against the invariants and return errors (page unusable) and warnings (page usable but imperfect).
2. THE validator SHALL reject color pairs below the minimum contrast rule, for example identical foreground and background, or yellow text on a white background.
3. THE validator SHALL check page numbers: three digits, 100 to 899, inside the organization's range.
4. Every message SHALL be written in plain language with a suggested fix.

### Requirement 7: Output and performance

**User Story:** As a reader on a slow connection, I want pages to be tiny and fast to produce.

#### Acceptance Criteria

1. THE renderer SHALL output pages as structured JSON (rows of tokens plus metadata).
2. A separate adapter SHALL convert a page to the row strings and control bytes the display library needs.
3. A serialized page SHALL be under 5 KB.
4. Rendering a 10,000-character input SHALL take under 50 ms on a normal laptop.
5. Empty input SHALL produce one valid page that says "No content yet".
