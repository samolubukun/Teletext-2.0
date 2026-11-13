import { describe, expect, it } from "vitest";
import { normalize } from "../src/normalize";
import { render } from "../src/render";
import { pageText, serializePage, toDisplayRows } from "../src/serialize";
import { wrapText } from "../src/wrap";
import type { Block } from "../src/types";
import { CTX } from "./arbitraries";

describe("normalize examples", () => {
  it("replaces smart punctuation silently", () => {
    const r = normalize("\u201CHi\u201D \u2014 it\u2019s here\u2026");
    expect(r.text).toBe('"Hi" - it\'s here...');
    expect(r.warnings).toEqual([]);
  });
  it("simplifies accented letters with a warning (Yoruba)", () => {
    const r = normalize("\u1EB9k\u00E1\u00E0b\u1ECD\u0300");
    expect(r.text).toBe("ekaabo");
    expect(r.warnings.map((w) => w.code)).toEqual(["chars-simplified"]);
  });
  it("removes emoji with a warning", () => {
    const r = normalize("Party \u{1F389} time \u{1F44D}\u{1F3FD}");
    expect(r.text).toBe("Party time");
    expect(r.warnings.map((w) => w.code)).toEqual(["chars-removed"]);
  });
  it("maps the naira sign to N", () => {
    expect(normalize("\u20A62,500").text).toBe("N2,500");
  });
  it("collapses spaces and blank lines, and converts tabs and NBSP", () => {
    expect(normalize("  a\t\tb\u00A0 c \n\n\n\n d  ").text).toBe("a b c\n\nd");
  });
});

describe("wrapText examples", () => {
  it("keeps a number with its unit", () => {
    const lines = wrapText("Doors open at the main hall from 10 am", 35);
    expect(lines.some((l) => l.includes("10 am"))).toBe(true);
  });
  it("splits a word longer than the line with hyphens", () => {
    const lines = wrapText("x".repeat(90), 39);
    expect(lines).toEqual(["x".repeat(38) + "-", "x".repeat(38) + "-", "x".repeat(14)]);
  });
});

describe("render examples", () => {
  it("empty input gives one page that says No content yet", () => {
    const { pages } = render([], CTX);
    expect(pages).toHaveLength(1);
    expect(pageText(pages[0]!)).toEqual(["No content yet."]);
  });

  it("throws only on a programmer error (invalid page number)", () => {
    expect(() => render([], { ...CTX, number: 950 })).toThrow();
  });

  it("header shows number, publisher, date and time in the publisher's time zone", () => {
    const rows = toDisplayRows(render([{ type: "paragraph", text: "Hi" }], CTX).pages[0]!);
    expect(rows[0]).toBe(" P412 GREENFIELD H      Tue 10 Nov 14:32");
    expect(rows[0]).toHaveLength(40);
  });

  it("default fastext bar", () => {
    const rows = toDisplayRows(render([{ type: "paragraph", text: "Hi" }], CTX).pages[0]!);
    expect(rows[23]).toBe(" INDEX     BACK      NEXT      HELP     ");
  });

  it("falls back to a list when a table is too wide", () => {
    const { warnings } = render(
      [{ type: "table", header: ["Student name", "Subject", "Grade", "Teacher"], rows: [["Ada Lovelace-Byron", "Mathematics", "A", "Mrs Okafor-Adeyemi"]] }],
      CTX,
    );
    expect(warnings.map((w) => w.code)).toContain("table-too-wide");
  });

  it("a long article becomes several sub-pages with a continued marker", () => {
    const text = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} explains one more thing.`).join(" ");
    const { pages } = render([{ type: "paragraph", text }], CTX);
    expect(pages.length).toBeGreaterThan(1);
    expect(toDisplayRows(pages[0]!)[22]?.trim()).toBe("MORE >>>");
    expect(toDisplayRows(pages[0]!)[0]).toContain(`1/${pages.length}`);
  });

  it("renders 10,000 characters in under 50 ms", () => {
    const text = "Results are available from Monday at the school office. ".repeat(180).slice(0, 10_000);
    render([{ type: "paragraph", text }], CTX); // warm up
    // The limit stays 50 ms. We take the fastest of 7 runs because one slow run on a busy machine (other tests,
    // a build, a virus scan) says nothing about the code; if the code is too slow, every run is slow.
    let best = Infinity;
    for (let i = 0; i < 7; i++) {
      const t0 = performance.now();
      render([{ type: "paragraph", text }], CTX);
      best = Math.min(best, performance.now() - t0);
    }
    expect(best).toBeLessThan(50);
  });
});

const SCHOOL_NOTICE: Block[] = [
  { type: "heading", level: 1, text: "TERM 1 EXAM RESULTS" },
  { type: "paragraph", text: "Results are now available." },
  {
    type: "keyvalue",
    rows: [
      { label: "Check results:", value: "page 413" },
      { label: "Collect reports:", value: "Fri 13 Nov" },
      { label: "Time:", value: "09:00 - 15:00" },
      { label: "Place:", value: "Main hall" },
    ],
  },
  { type: "paragraph", text: "Questions? Call the office: 0800 000 0000" },
];

const RESULTS_TABLE: Block[] = [
  { type: "heading", level: 2, text: "JSS3 MATHS RESULTS" },
  { type: "table", header: ["ID", "Name", "Grade", "Score"], rows: [["1001", "A. Bello", "A", "86"], ["1002", "C. Eze", "B", "74"], ["1003", "F. Musa", "C", "61"]] },
];

const TRANSPORT_ALERT: Block[] = [
  { type: "heading", level: 1, text: "ROUTE 12 - LIVE" },
  { type: "table", header: ["Stop", "Next", "Status"], rows: [["Central", "14:40", "On time"], ["Market Rd", "14:46", "Delayed 5 min"], ["Hospital", "14:55", "On time"]] },
  { type: "paragraph", tone: "alert", text: "ALERT: Road works on Park Ave. Route 12 uses Mill St until Fri." },
];

describe("golden fixtures", () => {
  for (const [name, fixture] of Object.entries({ SCHOOL_NOTICE, RESULTS_TABLE, TRANSPORT_ALERT })) {
    it(`${name} renders as expected`, () => {
      const { pages, warnings } = render(fixture, CTX);
      expect(warnings).toEqual([]);
      expect(pages.map(toDisplayRows)).toMatchSnapshot();
      expect(pages.map((p) => JSON.stringify(serializePage(p)).length).every((n) => n < 5120)).toBe(true);
    });
  }
});
