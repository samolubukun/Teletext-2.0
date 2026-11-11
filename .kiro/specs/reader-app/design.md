# Design Document: reader-app

## Overview

`Reader.tsx` is a client component. It holds the loaded page, the entry buffer, history and settings.
Page entry and screen stepping are pure functions in `@teletext/core` (`entry`, `stepSubpage`) so they can
be property-tested without a browser.

## Architecture

```
keyboard / keypad / swipe -> entry(state, key) -> { state, go?, invalid? }
                                  |                      |
                         header "P4__"            goTo(number) -> fetch /api/pages/:n
                                                         |
                       Convex fetchQuery (server)  <-----+   Cache-Control: s-maxage=60, SWR 600
                                                         |
                                       SerializedPage[] -> TeletextScreen (HTML grid)
```

- **Our own screen renderer** (`TeletextScreen.tsx`): rows are block lines of inline-block cells so copy and
  paste gives one line per row; mosaic characters are drawn with a CSS grid of six squares. The AGPL
  `@techandsoftware/teletext` library was rejected for licence reasons.
- **System pages** (index 100, not found, invalid number, offline, search) are rendered by the same
  `render()` as published pages, so they obey every renderer invariant.
- **Live clock** replaces header cells 24-33 (date) and 35-39 (time) on the client only.

## Correctness Properties

| # | Property | Status |
| --- | --- | --- |
| R1 | For any sequence of keys, the entry buffer is always 0 to 3 digits | tested |
| R2 | A page load is triggered exactly when the third digit is entered and never otherwise | tested |
| R3 | Backspace on an empty buffer does nothing and does not throw | tested |
| R4 | The loaded number is the typed digits; numbers outside 100-899 never reach the network | tested (reducer) |
| R5 | Sub-page index stays between 1 and total for any sequence of next and previous presses | tested |
| R6 | History back returns exactly to the previous page and screen | open: history is inline state, not yet a pure module |
| R7 | Settings round-trip: save then load gives the same settings | open |

## Error Handling

Network failure shows the offline page; 404 shows "Page not found"; 400 cannot happen from the UI.
A corrupt settings value falls back to defaults (Zod `safeParse`).
