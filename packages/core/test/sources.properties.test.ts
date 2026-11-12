import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { blocksSchema } from "../src/schema";
import { SOURCE_LIMITS, feedBlocks, parseCsv, parseFeed, sheetBlocks, shortDate, validateSourceUrl } from "../src/sources";
import { RUNS } from "./arbitraries";

const anyText = fc.oneof(
  fc.string({ maxLength: 400 }),
  fc.string({ unit: "binary", maxLength: 300 }),
  fc.string({ unit: "grapheme", maxLength: 200 }),
  fc.constantFrom("", '"', '""""', '"unterminated, field\nnext', "a,b\r\n\r\n,\n,,,", "\ufeffname,score\nAda,9", "x".repeat(50_000), ",".repeat(5000), '"\n"'.repeat(3000)),
);

describe("data sources (data-connectors C1-C6)", () => {
  it("C1: parseCsv never throws and always respects the caps", () => {
    fc.assert(
      fc.property(anyText, (text) => {
        const rows = parseCsv(text);
        expect(rows.length).toBeLessThanOrEqual(SOURCE_LIMITS.maxRows);
        for (const r of rows) {
          expect(r.length).toBeLessThanOrEqual(SOURCE_LIMITS.maxCols);
          for (const c of r) expect(c.length).toBeLessThanOrEqual(SOURCE_LIMITS.maxCellChars);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("C1 example: quotes, BOM, CRLF and blank lines", () => {
    expect(parseCsv('\ufeffName,Score\r\n"Okafor, Ada",9\r\n\r\n"Say ""hi""",7\r\n')).toEqual([
      ["Name", "Score"],
      ["Okafor, Ada", "9"],
      ['Say "hi"', "7"],
    ]);
  });

  // Cells are trimmed and cannot contain control characters except line breaks, which standard CSV allows inside quotes.
  const cell = fc
    .string({ unit: fc.constantFrom(..."abcXYZ09 ,\"\n.-é"), maxLength: 30 })
    .map((s) => s.replace(/\r/g, "").trim());
  const grid = fc
    .array(fc.array(cell, { minLength: 1, maxLength: SOURCE_LIMITS.maxCols }), { minLength: 1, maxLength: 12 })
    .filter((g) => g.every((r) => r.some((c) => c !== "")));
  const toCsv = (g: string[][]) => g.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\r\n");

  it("C2: a grid written with standard quoting parses back unchanged", () => {
    fc.assert(
      fc.property(grid, (g) => {
        expect(parseCsv(toCsv(g))).toEqual(g);
      }),
      { numRuns: RUNS },
    );
  });

  it("C3: parseFeed never throws, caps items and strips markup", () => {
    const item = fc.tuple(anyText, anyText).map(([t, d]) => `<item><title>${t}</title><pubDate>${d}</pubDate></item>`);
    fc.assert(
      fc.property(fc.array(item, { maxLength: 30 }), fc.integer({ min: 0, max: 12 }), anyText, (items, n, noise) => {
        const found = parseFeed(`<rss><channel>${noise}${items.join("")}</channel></rss>`, n);
        expect(found.length).toBeLessThanOrEqual(n);
        for (const f of found) {
          expect(f.title.length).toBeGreaterThan(0);
          expect(/<[^>]*>/.test(f.title)).toBe(false);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("C3 example: RSS with CDATA and entities, and Atom", () => {
    const rss = `<rss><channel><item><title><![CDATA[Bus 12 <b>delayed</b>]]></title><pubDate>Thu, 12 Nov 2026 08:00:00 GMT</pubDate></item>
      <item><title>Fees &amp;amp; levies &lt;i&gt;due&lt;/i&gt;</title></item></channel></rss>`;
    expect(parseFeed(rss)).toEqual([
      { title: "Bus 12 delayed", date: "Thu 12 Nov" },
      { title: "Fees & levies due", date: "" },
    ]);
    expect(parseFeed('<feed><entry><title type="text">Road works</title><updated>2026-11-13T09:00:00Z</updated></entry></feed>')).toEqual([{ title: "Road works", date: "Fri 13 Nov" }]);
  });

  it("C4: validateSourceUrl never throws, and anything it accepts is a public https address", () => {
    fc.assert(
      fc.property(fc.constantFrom("rss", "sheet"), fc.oneof(anyText, fc.webUrl(), fc.constantFrom("https://example.com/feed.xml")), (kind, raw) => {
        const r = validateSourceUrl(kind, raw);
        if (r.ok) {
          const u = new URL(r.url);
          expect(u.protocol).toBe("https:");
          expect(u.username + u.password).toBe("");
          expect(u.hostname.includes(".")).toBe(true);
          expect(/^[0-9.]+$/.test(u.hostname)).toBe(false);
          if (kind === "sheet") expect(u.hostname).toBe("docs.google.com");
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("C4: hostile addresses are always refused", () => {
    const hostile = [
      "http://example.com/feed.xml",
      "https://127.0.0.1/feed",
      "https://10.0.0.5/feed",
      "https://192.168.1.1/feed",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/feed",
      "https://localhost/feed",
      "https://metadata.google.internal/computeMetadata/v1/",
      "https://printer.local/feed",
      "https://2130706433/feed",
      "https://0x7f000001/feed",
      "https://user:pass@example.com/feed",
      "https://example.com:8443/feed",
      "https://intranet/feed",
      "ftp://example.com/feed",
      "javascript:alert(1)",
      "https://evil.com@127.0.0.1/feed",
    ];
    for (const url of hostile) expect(validateSourceUrl("rss", url).ok, url).toBe(false);
    for (const url of ["https://docs.google.com.evil.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit", "https://example.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz", "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit"]) {
      expect(validateSourceUrl("sheet", url).ok, url).toBe(false);
    }
  });

  it("C4 example: a sheet link becomes a CSV export link and keeps the tab", () => {
    expect(validateSourceUrl("sheet", "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit?usp=sharing#gid=123")).toEqual({
      ok: true,
      url: "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/export?format=csv&gid=123",
    });
    expect(validateSourceUrl("rss", "https://news.example.org/feed.xml#top")).toEqual({ ok: true, url: "https://news.example.org/feed.xml" });
  });

  it("C5: generated blocks always satisfy blocksSchema and the heading fits", () => {
    const rows = fc.array(fc.array(fc.string({ maxLength: 220 }), { maxLength: 12 }), { maxLength: 60 });
    const items = fc.array(fc.record({ title: fc.string({ maxLength: 220 }), date: fc.constantFrom("", "Thu 12 Nov") }), { maxLength: 15 });
    fc.assert(
      fc.property(anyText, rows, items, (title, r, i) => {
        for (const blocks of [sheetBlocks(title, r), feedBlocks(title, i)]) {
          expect(blocksSchema.safeParse(blocks).success).toBe(true);
          const h = blocks[0];
          expect(h?.type === "heading" && h.text.length <= 38 && h.text.length > 0).toBe(true);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("C6: shortDate is total", () => {
    fc.assert(
      fc.property(anyText, (s) => {
        const d = shortDate(s);
        expect(d === "" || /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d{1,2} [A-Z][a-z]{2}$/.test(d)).toBe(true);
      }),
      { numRuns: RUNS },
    );
    expect(shortDate("Thu, 12 Nov 2026 08:00:00 GMT")).toBe("Thu 12 Nov");
  });
});
