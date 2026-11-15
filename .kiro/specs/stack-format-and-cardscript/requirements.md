# Requirements: Stack format and CardScript

## Goal

Stage 2 adds HyperCard-style interactive stacks without changing Stage 1. A stack is a group of linked 40x24 teletext cards. Cards can collect fields, navigate with fastext buttons, show messages, run bounded logic, request a server-side lookup, or submit a form.

## Requirements

### R1: Feature isolation
- Stage 1 must not import `packages/stacks`.
- Stack behavior is unavailable when `STACKS_ENABLED` is not enabled on the server.
- A malformed or unsupported stack must never prevent ordinary pages from loading.

### R2: Stack schema
- A stack has version, id, title, template, start card, cards and table metadata.
- A stack has at most 40 cards, 10 tables, 6 fields per card and 4 buttons per card.
- A card has a unique id, a page number, blocks, fields, buttons and optional enter script.
- A field is `text`, `number`, `secret` or `choice`, with a maximum length.
- A button has a permitted key, label and CardScript of at most 600 characters.
- A table has at most 500 rows and 12 columns in its metadata representation.

### R3: Script safety
- Only the commands and expressions in `cardscript.md` are accepted.
- No eval, arbitrary JavaScript, network, files, recursion or unbounded loops.
- Every target card exists, every referenced table and column exists, and every card has an exit.
- One event executes at most 200 steps and returns a clean error if the limit is reached.

### R4: Pure interpreter
- `run(stack, state, event)` is deterministic and performs no I/O.
- Navigation and messages are returned as effects.
- Lookup and form submission are returned as server effects. The interpreter never sees table data or PINs.
- The interpreter never throws for malformed runtime input.

### R5: Lookup effect
- A lookup effect contains organization-scoped table and equality conditions, destination variable and target card context.
- A supplied PIN is identified as a secret condition and must be checked by the server against `pin_hash`, never by plaintext equality in the browser.

### R6: diagnostics
- Parse and validation errors include a useful message and character position where available.
- The editor can show schema and script errors without executing a script.

## Acceptance examples

1. A valid lookup stack parses and validates.
2. A script with `go to card result` returns a navigate effect.
3. A script with `lookup results by student_id = sid into row` returns a lookup effect and never reads a table.
4. Unknown commands, unknown cards, unbounded loops and scripts over 600 characters are rejected.
5. A script that exceeds 200 steps returns an error state rather than hanging.
