import fc from "fast-check";
import type { Block, FastextLink } from "../src/types";

export const RUNS = Number(process.env.FC_RUNS ?? 1000);
export const NOW = "2026-11-10T13:32:00.000Z";
export const CTX = { number: 412, publisher: "Greenfield High", now: NOW, utcOffsetMinutes: 60 } as const;

const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const alnum = [...letters, ..."0123456789".split("")];

/** Plain words (letters only), 1-12 characters. */
export const word = fc.string({ unit: fc.constantFrom(...letters), minLength: 1, maxLength: 12 });
/** Words up to the paragraph width: never split by the wrapper (P3). */
export const fittingWord = fc.string({ unit: fc.constantFrom(...letters), minLength: 1, maxLength: 39 });
export const longWord = fc.string({ unit: fc.constantFrom(...alnum), minLength: 40, maxLength: 200 });

export const sentence = fc.array(fc.oneof({ weight: 8, arbitrary: word }, { weight: 1, arbitrary: longWord }), { minLength: 1, maxLength: 40 }).map((w) => w.join(" "));

/** Aggressive text: emoji, mixed scripts, control characters, curly quotes, very long words. */
export const messyText = fc.oneof(
  sentence,
  fc.string({ maxLength: 300 }),
  fc.string({ unit: "binary", maxLength: 200 }),
  fc.string({ unit: "grapheme", maxLength: 200 }),
  fc.constantFrom(
    "",
    "   ",
    "\u{1F600}\u{1F389}\u{1F44D}\u{1F3FD}",
    "\u201CQuoted\u201D \u2014 text\u2026",
    "\u1EB9\u1ECD\u1E63 Yor\u00F9b\u00E1 \u00E0w\u1ECDn",
    "\u0645\u0631\u062D\u0628\u0627 \u05E9\u05DC\u05D5\u05DD",
    "Fees: \u20A62,500 by 10 am on Fri 13 Nov",
    "x".repeat(200),
  ),
);

export const color = fc.constantFrom("red", "green", "yellow", "blue") as fc.Arbitrary<FastextLink["color"]>;

export const headingBlock: fc.Arbitrary<Block> = fc.record({
  type: fc.constant("heading" as const),
  text: messyText,
  level: fc.constantFrom(1 as const, 2 as const),
});

export const textBlock: fc.Arbitrary<Block> = fc.oneof(
  fc.record({ type: fc.constant("paragraph" as const), text: messyText, tone: fc.constantFrom("normal" as const, "alert" as const) }),
  fc.record({ type: fc.constant("bullets" as const), items: fc.array(messyText, { maxLength: 8 }) }),
);

export const anyBlock: fc.Arbitrary<Block> = fc.oneof(
  headingBlock,
  textBlock,
  fc.record({
    type: fc.constant("keyvalue" as const),
    rows: fc.array(fc.record({ label: messyText, value: messyText }), { maxLength: 8 }),
  }),
  fc.record({
    type: fc.constant("table" as const),
    header: fc.option(fc.array(fc.string({ maxLength: 15 }), { minLength: 1, maxLength: 12 }), { nil: undefined }),
    rows: fc.array(fc.array(fc.string({ maxLength: 15 }), { maxLength: 12 }), { maxLength: 30 }),
  }),
  fc.constant({ type: "divider" as const }),
  fc.record({ type: fc.constant("mosaic" as const), rows: fc.array(fc.string({ maxLength: 50 }), { maxLength: 25 }) }),
  fc.record({ type: fc.constant("link" as const), label: messyText, page: fc.integer({ min: 0, max: 1200 }) }),
);

export const blocks = fc.array(anyBlock, { maxLength: 20 });

export const fastextLinks = fc.array(
  fc.record({ color, label: fc.string({ maxLength: 30 }), page: fc.integer({ min: 0, max: 1000 }) }),
  { maxLength: 8 },
);
