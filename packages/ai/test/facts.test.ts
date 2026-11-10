import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { extractValues, factGuard, normalizeNumber, normalizeTime } from "../src/facts";
import { extractiveSummary } from "../src/fallback";
import { blocksToText } from "../src/schema";
import { condense } from "../src/condense";

const RUNS = Number(process.env.FC_RUNS ?? 1000);

const fact = fc.oneof(
  fc.integer({ min: 1, max: 28 }).chain((d) => fc.constantFrom("Nov", "December", "Jan").map((m) => `${d} ${m}`)),
  fc.integer({ min: 1, max: 12 }).chain((h) => fc.constantFrom("am", "pm").map((p) => `${h}${p}`)),
  fc.tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 })).map(([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`),
  fc.integer({ min: 100, max: 999_999 }).map((n) => `N${n.toLocaleString("en-US")}`),
  fc.integer({ min: 1, max: 9999 }).map(String),
  fc.constantFrom("Mrs Adaeze Okafor", "Greenfield High", "Sunrise Clinic", "Main Hall"),
);
const filler = fc.constantFrom("Results are out", "Please come early", "The office opens", "Bring your card", "Fees are due", "Classes resume");

/** A source made of sentences built from known facts, so the expected result is known in advance. */
const source = fc.array(fc.tuple(filler, fact), { minLength: 1, maxLength: 12 }).map((parts) => ({
  facts: parts.map(([, f]) => f),
  text: parts.map(([s, f]) => `${s} on ${f}.`).join(" "),
}));

describe("fact guard properties", () => {
  it("A1: a draft built only from source values has no unmatched values", () => {
    fc.assert(
      fc.property(source, fc.integer({ min: 0, max: 1000 }), (src, seed) => {
        const subset = src.facts.filter((_, i) => (seed >> i) % 2 === 0);
        const draft = subset.map((f, i) => `Item ${String.fromCharCode(65 + (i % 26))}: ${f}.`).join("\n");
        expect(factGuard(src.text, draft).unmatched.filter((v) => v.kind !== "name")).toEqual([]);
      }),
      { numRuns: RUNS },
    );
  });

  it("A2: inserting a number that is not in the source always flags it", () => {
    fc.assert(
      fc.property(source, fc.integer({ min: 10_000_000, max: 99_999_999 }), (src, invented) => {
        fc.pre(!src.text.includes(String(invented)));
        const draft = `${src.facts.join(". ")}. Call ${invented} today.`;
        const report = factGuard(src.text, draft);
        expect(report.unmatched.some((v) => v.raw.replace(/\D/g, "").includes(String(invented)))).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it("A3: formatting variants of the same number compare equal", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), (n) => {
        expect(normalizeNumber(n.toLocaleString("en-US"))).toBe(normalizeNumber(String(n)));
        expect(normalizeNumber(`${n}.00`)).toBe(String(n));
      }),
      { numRuns: RUNS },
    );
  });

  it("A4: 12-hour and 24-hour forms of the same time compare equal", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }), (h, m) => {
        const twelve = h % 12 === 0 ? 12 : h % 12;
        const meridiem = h < 12 ? "am" : "pm";
        expect(normalizeTime(twelve, m, meridiem)).toBe(normalizeTime(h, m));
        const a = extractValues(`at ${twelve}:${String(m).padStart(2, "0")} ${meridiem}`)[0]?.key;
        const b = extractValues(`at ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`)[0]?.key;
        expect(a).toBe(b);
      }),
      { numRuns: RUNS },
    );
  });

  it("A5: the fallback summary never contains a value that is not in the source", () => {
    fc.assert(
      fc.property(fc.oneof(source.map((s) => s.text), fc.string({ maxLength: 400 })), (text) => {
        const draft = blocksToText(extractiveSummary(text));
        expect(factGuard(text, draft).unmatched).toEqual([]);
      }),
      { numRuns: RUNS },
    );
  });
});

describe("fact guard examples", () => {
  const src = "Term 1 reports can be collected on Friday 13 November from 9am to 3pm in the Main Hall. Fees of N2,500 are due. Call 0800 000 0000.";

  it("matches reformatted values and keeps the source sentence", () => {
    const draft = "Collect reports: Fri 13 Nov\nTime: 09:00 - 15:00\nFees: N2500\nCall 0800 000 0000";
    const report = factGuard(src, draft);
    expect(report.unmatched).toEqual([]);
    const fee = report.matched.find((p) => p.draft.raw.includes("2500"));
    expect(fee?.source.sentence).toBe("Fees of N2,500 are due.");
  });

  it("flags an invented time and reports dropped facts", () => {
    const report = factGuard(src, "Collect reports on 13 Nov at 10am.");
    expect(report.unmatched.map((v) => v.key)).toEqual(["time:10:00"]);
    expect(report.dropped.map((v) => v.key)).toEqual(expect.arrayContaining(["num:2500", "phone:08000000000"]));
  });
});

describe("condense orchestration", () => {
  const good = JSON.stringify({
    title: "Term 1 reports",
    blocks: [{ kind: "keyvalue", text: "", items: [], pairs: [{ label: "Collect", value: "Fri 13 Nov" }] }],
    fastext: [{ label: "RESULTS", hint: "results table" }],
  });

  it("uses the first valid answer", async () => {
    const r = await condense("Reports on Friday 13 November.", async () => good);
    expect(r.usedFallback).toBe(false);
    expect(r.attempts).toBe(1);
    expect(r.blocks[0]).toEqual({ type: "heading", level: 1, text: "TERM 1 REPORTS" });
  });

  it("repairs once with the validation errors", async () => {
    const prompts: string[] = [];
    const r = await condense("Reports on Friday 13 November.", async ({ prompt }) => {
      prompts.push(prompt);
      return prompts.length === 1 ? '{"title": ""}' : good;
    });
    expect(r.attempts).toBe(2);
    expect(prompts[1]).toContain("not valid");
  });

  it("falls back to an extract after two failures", async () => {
    const r = await condense("Reports on Friday 13 November. Bring your card.", async () => "nope");
    expect(r.usedFallback).toBe(true);
    expect(r.facts.unmatched).toEqual([]);
  });
});
