# Teletext content and visual rules

## Grid
- 40 columns x 24 rows. Row 0 header, rows 1-22 body, row 23 fastext bar.
- Color and style codes are spacing attributes: each one occupies a cell and shows as a blank.
  ALWAYS count them toward the 40. Measure width in tokens, never in string length.
- Attributes do not carry across rows. Each row starts with its own color code when needed.
- A double-height line uses two rows; the row below stays empty.
- The display library screen is 40 x 25. Our pages use 24 rows; row 24 stays unused.

## Colors (on black)
- Headings: yellow. Body: white. Links and page numbers: cyan.
- Success: green. Warnings: yellow. Alerts: red (flashing only for urgent alerts, max one per page).
- Fastext bar: red, green, yellow, blue, each with a short label.
- Allowed non-black backgrounds (headers and alert bars only): white on blue, white on red,
  black on yellow, black on cyan, black on white. Nothing else.

## Writing
- One idea per page. Headline max 38 visible characters, uppercase.
- Short sentences. Active voice. Plain words.
- Dates like "Mon 12 Nov". Times in 24-hour format like 14:30. Money like N2,500.
- ASCII-safe characters only. No emoji. No curly quotes or long dashes.
- Put the most important fact in the first two body lines.
- Never invent facts. Numbers, dates, names and places must come from the source.
- Demo content uses fake people, fake IDs and fake phone numbers only.

## Navigation
- Every page has at least a link to 100 (index).
- Long content becomes sub-pages marked 1/3, 2/3, 3/3.
- Default fastext: red = 100 index, green = previous, yellow = next, blue = help/contact.
