import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { COLS, ROWS } from "../src/constants";
import { layoutBlocks, HEADING_KINDS } from "../src/layout";
import { normalize } from "../src/normalize";
import { paginate } from "../src/paginate";
import { render } from "../src/render";
import { pageText, serializePage, deserializePage } from "../src/serialize";
import { isAllowedPair } from "../src/style";
import { isBlankRow, rowText } from "../src/tokens";
import type { Block, Color } from "../src/types";
import { CTX, RUNS, anyBlock, blocks, fastextLinks, fittingWord, headingBlock, messyText, sentence, textBlock } from "./arbitraries";

const strip = (s: string) => s.replace(/[\s*-]/g, "");

function blockText(b: Block): string {
  switch (b.type) {
    case "heading":
    case "paragraph":
      return normalize(b.text).text;
    case "bullets":
      return b.items.map((i) => normalize(i).text).join(" ");
    default:
      return "";
  }
}

describe("renderer properties", () => {
  it("P1: every row has exactly 40 cells and nothing overflows", () => {
    fc.assert(
      fc.property(blocks, (bs) => {
        const { pages, warnings } = render(bs, CTX);
        expect(warnings.some((w) => w.code === "internal-overflow")).toBe(false);
        for (const page of pages) for (const row of page.rows) expect(row.length).toBe(COLS);
      }),
      { numRuns: RUNS },
    );
  });

  it("P2: every page has exactly 24 rows", () => {
    fc.assert(
      fc.property(blocks, (bs) => {
        for (const page of render(bs, CTX).pages) expect(page.rows.length).toBe(ROWS);
      }),
      { numRuns: RUNS },
    );
  });

  it("P3: no word is split unless it is longer than the line", () => {
    fc.assert(
      fc.property(fc.array(fittingWord, { minLength: 1, maxLength: 120 }), (words) => {
        const { pages } = render([{ type: "paragraph", text: words.join(" ") }], CTX);
        const seen = new Set(pages.flatMap((p) => pageText(p).flatMap((l) => l.split(/\s+/))));
        for (const w of words) expect(seen.has(w)).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it("P4: pagination loses and adds nothing (ignoring spacing, bullets and hyphens)", () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(headingBlock, textBlock), { maxLength: 15 }), (bs) => {
        const expected = strip(bs.map(blockText).join(" "));
        const { pages } = render(bs, CTX);
        const actual = strip(pages.flatMap(pageText).join(" "));
        expect(actual).toBe(expected || strip("No content yet."));
      }),
      { numRuns: RUNS },
    );
  });

  it("P5: rendering is deterministic", () => {
    fc.assert(
      fc.property(blocks, fastextLinks, (bs, links) => {
        expect(render(bs, { ...CTX, fastext: links })).toEqual(render(bs, { ...CTX, fastext: links }));
      }),
      { numRuns: RUNS },
    );
  });

  it("P7: every visible cell uses an allowed color pair", () => {
    fc.assert(
      fc.property(blocks, (bs) => {
        for (const page of render(bs, CTX).pages) {
          for (const row of page.rows) {
            let fgc: Color = "white";
            let bgc: Color = "black";
            for (const t of row) {
              if (t.kind === "ctl") {
                if (t.code === "fg" || t.code === "mosaic") fgc = t.value ?? "white";
                if (t.code === "bg") bgc = t.value ?? "black";
              } else if (t.ch !== " ") {
                expect(isAllowedPair(fgc, bgc)).toBe(true);
              }
            }
          }
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("P8: a heading is never the last line of a sub-page", () => {
    // Runs of at most 3 headings, each followed by real content.
    const section = fc.tuple(fc.array(headingBlock, { maxLength: 3 }), fc.oneof(
      sentence.map((text): Block => ({ type: "paragraph", text })),
      fc.array(sentence, { minLength: 1, maxLength: 4 }).map((items): Block => ({ type: "bullets", items })),
    ));
    fc.assert(
      fc.property(fc.array(section, { minLength: 1, maxLength: 25 }), (sections) => {
        const bs = sections.flatMap(([hs, content]) => [...hs, content]);
        const { bodies } = paginate(layoutBlocks(bs).lines);
        for (const body of bodies) {
          const last = [...body].reverse().find((l) => l.kind !== "blank");
          if (last) expect(HEADING_KINDS.has(last.kind)).toBe(false);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("P9: a double-height row is always followed by an empty row", () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(headingBlock, anyBlock), { maxLength: 20 }), (bs) => {
        for (const page of render(bs, CTX).pages) {
          page.rows.forEach((row, r) => {
            if (row.some((t) => t.kind === "ctl" && t.code === "double")) {
              const below = page.rows[r + 1];
              expect(below && isBlankRow(below)).toBe(true);
            }
          });
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("P10: every sub-page shows n/total with 1 <= n <= total", () => {
    fc.assert(
      fc.property(fc.array(sentence, { minLength: 10, maxLength: 40 }), (paras) => {
        const { pages } = render(paras.map((text): Block => ({ type: "paragraph", text })), CTX);
        for (const page of pages) {
          expect(page.sub).toBeGreaterThanOrEqual(1);
          expect(page.sub).toBeLessThanOrEqual(page.subCount);
          expect(page.subCount).toBe(pages.length);
          if (page.subCount > 1) expect(rowText(page.rows[0] ?? [])).toContain(`${page.sub}/${page.subCount}`);
        }
      }),
      { numRuns: Math.max(100, RUNS / 5) },
    );
  });

  it("P11: split tables repeat the header row on every sub-page", () => {
    const cell = fc.string({ unit: fc.constantFrom(..."abcdefgh0123456789".split("")), minLength: 1, maxLength: 8 });
    fc.assert(
      fc.property(fc.array(fc.tuple(cell, cell, cell), { minLength: 25, maxLength: 120 }), (rows) => {
        const { pages } = render([{ type: "table", header: ["Name", "Grade", "Score"], rows }], CTX);
        expect(pages.length).toBeGreaterThan(1);
        const headerLine = rowText(pages[0]?.rows[1] ?? []);
        expect(headerLine).toContain("Name");
        for (const page of pages) expect(rowText(page.rows[1] ?? [])).toBe(headerLine);
      }),
      { numRuns: Math.max(100, RUNS / 5) },
    );
  });

  it("P13: a serialized page is under 5 KB and round-trips", () => {
    fc.assert(
      fc.property(blocks, (bs) => {
        for (const page of render(bs, CTX).pages) {
          const s = serializePage(page);
          expect(new TextEncoder().encode(JSON.stringify(s)).length).toBeLessThan(5 * 1024);
          expect(deserializePage(s)).toEqual(page);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("P14: render never throws, even on huge or malformed input", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 50_000 }), (text) => {
        expect(() => render([{ type: "paragraph", text }], CTX)).not.toThrow();
      }),
      { numRuns: 25 },
    );
    fc.assert(
      fc.property(fc.anything(), (junk) => {
        expect(() => render(junk as Block[], CTX)).not.toThrow();
        expect(() => render([junk] as Block[], CTX)).not.toThrow();
      }),
      { numRuns: RUNS },
    );
  });

  it("P15: at most four fastext links and the bar fits in 40 cells", () => {
    fc.assert(
      fc.property(fastextLinks, messyText, (links, text) => {
        const { pages } = render([{ type: "paragraph", text }], { ...CTX, fastext: links });
        for (const page of pages) {
          expect(page.fastext.length).toBeLessThanOrEqual(4);
          expect(new Set(page.fastext.map((l) => l.color)).size).toBe(page.fastext.length);
          for (const l of page.fastext) expect(l.label.length).toBeLessThanOrEqual(9);
          expect(page.rows[23]?.length).toBe(40);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("all generated pages pass the validator", () => {
    fc.assert(
      fc.property(blocks, (bs) => {
        const { pages, warnings } = render(bs, CTX);
        expect(warnings.filter((w) => w.level === "error")).toEqual([]);
        expect(pages.length).toBeGreaterThan(0);
      }),
      { numRuns: Math.max(100, RUNS / 5) },
    );
  });
});

describe("normalizer properties", () => {
  it("P6: normalize is idempotent", () => {
    fc.assert(
      fc.property(fc.oneof(messyText, fc.string({ unit: "binary", maxLength: 500 })), (t) => {
        const once = normalize(t).text;
        const twice = normalize(once);
        expect(twice.text).toBe(once);
        expect(twice.warnings).toEqual([]);
      }),
      { numRuns: RUNS },
    );
  });

  it("output is printable ASCII plus newlines, without double spaces", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 500 }), (t) => {
        const out = normalize(t).text;
        expect(/^[\x20-\x7e\n]*$/.test(out)).toBe(true);
        expect(out.includes("  ")).toBe(false);
        expect(out.includes("\n\n\n")).toBe(false);
      }),
      { numRuns: RUNS },
    );
  });
});
