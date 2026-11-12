// @vitest-environment node
// The QR code is only useful if it opens the right page, so these tests decode a real QR image.
import fc from "fast-check";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { displayAddress, isPageNumber, pageLink } from "../../src/lib/pageLink";

const RUNS = Number(process.env.FC_RUNS ?? 300);

async function decode(url: string): Promise<string | null> {
  const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: "H", margin: 2, width: 720, color: { dark: "#000000", light: "#ffffff" } });
  const png = PNG.sync.read(Buffer.from(dataUrl.split(",")[1] ?? "", "base64"));
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data ?? null;
}

describe("pageLink", () => {
  it("builds short links for valid pages and screens", () => {
    expect(pageLink("https://teletext-2-0.vercel.app", 412)).toBe("https://teletext-2-0.vercel.app/p/412");
    expect(pageLink("https://teletext-2-0.vercel.app/dashboard/x?y=1#z", 412, 2)).toBe("https://teletext-2-0.vercel.app/p/412/2");
    expect(pageLink("http://localhost:3000", 100)).toBe("http://localhost:3000/p/100");
  });

  it("returns null for anything that would make a broken link", () => {
    for (const n of [99, 900, 0, -1, 412.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(pageLink("https://a.example", n)).toBeNull();
    for (const o of ["", "not a url", "javascript:alert(1)", "ftp://a.example", "//a.example"]) expect(pageLink(o, 412)).toBeNull();
    expect(pageLink("https://a.example", 412, 0)).toBeNull();
    expect(pageLink("https://a.example", 412, 100)).toBeNull();
  });

  it("PL1: for every page number and origin, the link is origin + /p/number or null, and null only when something is invalid", () => {
    const origin = fc.constantFrom("https://teletext-2-0.vercel.app", "http://localhost:3000", "https://x.example:8443", "https://a.b.c.example/some/path?q=1#h", "", "nope", "javascript:1");
    const page = fc.oneof(fc.integer({ min: 95, max: 905 }), fc.double(), fc.constantFrom(100, 899, 99, 900, 412));
    fc.assert(
      fc.property(origin, page, (o, n) => {
        const link = pageLink(o, n);
        const originOk = /^https?:\/\/[^/]+/.test(o);
        if (link === null) {
          expect(!originOk || !isPageNumber(n)).toBe(true);
        } else {
          expect(isPageNumber(n)).toBe(true);
          expect(link).toBe(`${new URL(o).origin}/p/${n}`);
          expect(link).not.toMatch(/[?#\s]/);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("displayAddress is the host only", () => {
    expect(displayAddress("https://teletext-2-0.vercel.app/dashboard")).toBe("teletext-2-0.vercel.app");
    expect(displayAddress("http://localhost:3000")).toBe("localhost:3000");
    expect(displayAddress("garbage")).toBe("");
  });
});

describe("QR code", () => {
  it("decodes to exactly the page link", async () => {
    for (const [origin, n, screen] of [["https://teletext-2-0.vercel.app", 412, 1], ["https://teletext-2-0.vercel.app", 899, 1], ["http://localhost:3000", 100, 3]] as const) {
      const link = pageLink(origin, n, screen);
      if (!link) throw new Error("expected a link");
      expect(await decode(link)).toBe(link);
    }
  });

  it("PL2: every valid page number round-trips through a real QR image", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 100, max: 899 }), fc.constantFrom("https://teletext-2-0.vercel.app", "https://very-long-subdomain-name-for-a-school.example.org"), async (n, origin) => {
        const link = pageLink(origin, n);
        if (!link) throw new Error("expected a link");
        expect(await decode(link)).toBe(link);
      }),
      { numRuns: Math.min(RUNS, 150) },
    );
  }, 60_000);

  it("a damaged poster still scans: with error correction H, 12% of the code width can be wiped out at five positions", async () => {
    // Measured with a probe: 8%, 12% and 18% blocks decode everywhere except 18% over the alignment pattern.
    const link = pageLink("https://teletext-2-0.vercel.app", 412);
    if (!link) throw new Error("expected a link");
    const dataUrl = await QRCode.toDataURL(link, { errorCorrectionLevel: "H", margin: 2, width: 720, color: { dark: "#000000", light: "#ffffff" } });
    const base = PNG.sync.read(Buffer.from(dataUrl.split(",")[1] ?? "", "base64"));
    for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.22], [0.22, 0.5], [0.72, 0.5], [0.5, 0.78]] as const) {
      const png = new PNG({ width: base.width, height: base.height });
      base.data.copy(png.data);
      const size = Math.floor(base.width * 0.12);
      const x0 = Math.floor(base.width * fx - size / 2);
      const y0 = Math.floor(base.height * fy - size / 2);
      for (let y = y0; y < y0 + size; y++) {
        for (let x = x0; x < x0 + size; x++) {
          const i = (y * png.width + x) * 4;
          png.data[i] = png.data[i + 1] = png.data[i + 2] = 255;
        }
      }
      expect(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data, `damage at ${fx},${fy}`).toBe(link);
    }
  });});
