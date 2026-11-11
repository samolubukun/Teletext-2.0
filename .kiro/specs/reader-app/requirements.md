# Requirements Document: reader-app

## Introduction

The public reader: type a page number, get a page. Keyboard first, touch friendly, accessible, fast.
It never loads the auth SDK or the Convex client; it reads pages from `GET /api/pages/[number]`.

## Glossary

- **Entry buffer:** the digits typed so far (0 to 3), shown in the header as `P4__`.
- **Screen:** one sub-page of a page, shown as `n/total`.
- **Fastext:** the four coloured buttons (red, green, yellow, blue) at the bottom of a page.

## Requirements

### Requirement 1: Page entry

**User Story:** As a reader, I want to type a page number and see that page, so that I can get information without menus.

1. WHEN the reader presses a digit, THE reader SHALL show it in the header as `P4__`, `P41_`, `P412`.
2. WHEN three digits are entered, THE reader SHALL load that page. Backspace SHALL remove the last digit; Escape SHALL clear the entry.
3. WHEN the number is below 100 or above 899, THE reader SHALL show a friendly "No such page" page with a link to 100 and SHALL NOT call the network.
4. WHEN a page does not exist or has expired, THE reader SHALL show "Page not found" with fastext links to 100 and the previous page, never a blank screen or a raw error.
5. WHEN a three-digit number is typed into the search box, THE reader SHALL open that page instead of searching text.

### Requirement 2: Navigation

1. THE reader SHALL step through screens with the left and right arrow keys, swipe and on-screen buttons, and show `n/total`. Auto-rotate SHALL be off by default with a Hold control.
2. Up and Down arrows SHALL go to the next and previous page number.
3. Red, green, yellow and blue links SHALL work by click, tap and the keys R, G, Y, B.
4. On touch devices an on-screen keypad (0 to 9, back, index) SHALL be available.
5. Backspace with an empty entry buffer SHALL go back to the previously viewed page and screen.
6. `/p/412` and `/p/412/2` SHALL open that page and screen directly.

### Requirement 3: Look and feel

1. THE reader SHALL offer Classic (retro look with a soft glow and scanlines), Clean (plain high-contrast text) and Ticker (headlines scrolling). THE reader SHALL remember the choice.
2. THE header SHALL show a live clock in the reader's own time zone; "Updated hh:mm" SHALL show when the page was last saved.
3. Page 100 SHALL list organizations by category on one screen. A search box SHALL find pages by keyword and show results as a teletext page.

### Requirement 4: Accessibility

1. Font size, high-contrast palette, colour-blind-safe palette and reduced motion (no flashing, no scrolling ticker) SHALL be available and remembered. THE reader SHALL honour the system "reduce motion" setting by default.
2. Every page SHALL also exist as a hidden, structured text version; a live region SHALL announce page changes; fastext buttons SHALL be listed with their keys and targets.
3. THE reader SHALL be fully usable with the keyboard alone, with a visible focus style.
4. Colour SHALL never be the only signal: every coloured button has a text label.

### Requirement 5: Live pages and speed

1. Live pages SHALL refresh on a timer and note how many lines changed (unless reduced motion is on).
2. A page SHALL be under 5 KB and the first screen SHALL appear in under one second on a throttled 3G connection once the app shell is cached.
3. THE screen SHALL be drawn with plain HTML and CSS (no SVG mosaics), so it renders identically on Safari and iOS.
