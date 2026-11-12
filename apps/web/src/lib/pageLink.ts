// Public short links for a page: /p/412 (and /p/412/2 for a screen). Used by the QR code and the poster.

const PAGE_MIN = 100;
const PAGE_MAX = 899;

export function isPageNumber(n: number): boolean {
  return Number.isInteger(n) && n >= PAGE_MIN && n <= PAGE_MAX;
}

/** "https://example.com/p/412". Returns null for a bad origin or page number, so a QR code is never made for a broken link. */
export function pageLink(origin: string, pageNumber: number, screen = 1): string | null {
  if (!isPageNumber(pageNumber) || !Number.isInteger(screen) || screen < 1 || screen > 99) return null;
  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    return null;
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") return null;
  return `${base.origin}/p/${pageNumber}${screen > 1 ? `/${screen}` : ""}`;
}

/** The address a person types by hand when they do not scan: no protocol, no trailing slash. */
export function displayAddress(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return "";
  }
}
