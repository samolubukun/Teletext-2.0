// Live data sources: a public Google Sheet or an RSS/Atom feed becomes the content of one page.
// Everything here is pure and total (no network, no throwing on bad input). The Convex action does the fetch.
import type { Block } from "./types";

export type SourceKind = "rss" | "sheet";
export const SOURCE_KINDS: readonly SourceKind[] = ["rss", "sheet"];

export const SOURCE_LIMITS = {
  /** Larger responses are refused before parsing. */
  maxBytes: 200_000,
  maxRows: 40,
  maxCols: 8,
  maxCellChars: 200,
  maxFeedItems: 10,
} as const;

const UNSAFE_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function clip(s: string, n: number): string {
  return s.replace(UNSAFE_CHARS, "").slice(0, n);
}

/**
 * Strict-enough CSV (RFC 4180): quoted fields, "" for a quote, CRLF or LF. Strips a BOM and blank lines.
 * Caps rows, columns and cell length, so hostile input stays small. Never throws.
 */
export function parseCsv(text: string, maxRows: number = SOURCE_LIMITS.maxRows, maxCols: number = SOURCE_LIMITS.maxCols): string[][] {
  const src = text.length > SOURCE_LIMITS.maxBytes ? text.slice(0, SOURCE_LIMITS.maxBytes) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let rowHasContent = false;

  const endCell = () => {
    if (row.length < maxCols) row.push(clip(cell.trim(), SOURCE_LIMITS.maxCellChars));
    cell = "";
  };
  const endRow = () => {
    endCell();
    if (rowHasContent && row.some((c) => c !== "")) rows.push(row);
    row = [];
    rowHasContent = false;
  };

  const start = src.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (let i = start; i < src.length && rows.length < maxRows; i++) {
    const ch = src[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") {
      inQuotes = true;
      rowHasContent = true;
    } else if (ch === ",") {
      endCell();
      rowHasContent = true;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      endRow();
    } else {
      cell += ch;
      if (ch !== " " && ch !== "\t") rowHasContent = true;
    }
  }
  if (rows.length < maxRows && (rowHasContent || cell !== "" || row.length > 0)) endRow();
  return rows;
}

export type FeedItem = { title: string; date: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6});/gi, (m, body: string) => {
    if (body[0] === "#") {
      const code = body[1]?.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isInteger(code) && code > 31 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[body.toLowerCase()] ?? m;
  });
}

function tagText(block: string, tag: string): string {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  if (!m) return "";
  const raw = (m[1] as string).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  // Decode first, then strip tags, so escaped markup in a title (&lt;b&gt;) is removed as well.
  const stripTags = (s: string) => s.replace(/<[^>]*>/g, " ");
  // Unwrap escaped HTML, remove tags, decode what is left, and remove any tag that decoding created.
  return stripTags(decodeEntities(stripTags(decodeEntities(raw)))).replace(/\s+/g, " ").trim();
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Thu 12 Nov" from an RSS or Atom date, or "" when it cannot be read. */
export function shortDate(value: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) return "";
  const d = new Date(ms);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Titles and dates of the newest items of an RSS 2.0 or Atom feed, in feed order. Never throws. */
export function parseFeed(xml: string, maxItems: number = SOURCE_LIMITS.maxFeedItems): FeedItem[] {
  const src = xml.length > SOURCE_LIMITS.maxBytes ? xml.slice(0, SOURCE_LIMITS.maxBytes) : xml;
  const blocks = [...src.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].slice(0, Math.max(0, Math.floor(maxItems)));
  const items: FeedItem[] = [];
  for (const m of blocks) {
    const body = m[2] as string;
    const title = clip(tagText(body, "title"), SOURCE_LIMITS.maxCellChars);
    if (!title) continue;
    const date = shortDate(tagText(body, "pubDate") || tagText(body, "updated") || tagText(body, "published"));
    items.push({ title, date });
  }
  return items;
}

export type UrlCheck = { ok: true; url: string } | { ok: false; reason: string };

const BLOCKED_HOST = /(^|\.)(localhost|local|internal|localdomain|lan|home|corp)$/i;

/**
 * Accepts only public https URLs. Refuses credentials, other ports, IP addresses and internal-looking names,
 * so a publisher cannot point the server at a private network. A Google Sheet link is rewritten to its CSV export link.
 */
export function validateSourceUrl(kind: SourceKind, raw: string): UrlCheck {
  const input = raw.trim();
  if (input.length === 0 || input.length > 500) return { ok: false, reason: "Paste a link of 1 to 500 characters." };
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return { ok: false, reason: "That does not look like a web link." };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "The link must start with https://." };
  if (u.username || u.password) return { ok: false, reason: "Links with a user name or password are not allowed." };
  if (u.port && u.port !== "443") return { ok: false, reason: "Only the standard https port is allowed." };
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || host.startsWith("[") || /^[0-9.]+$/.test(host) || BLOCKED_HOST.test(host) || host.endsWith(".")) {
    return { ok: false, reason: "Use a public website address, not an IP address or an internal name." };
  }
  if (kind === "sheet") {
    const m = /^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,80})(?:\/|$)/.exec(u.pathname);
    if (host !== "docs.google.com" || !m) return { ok: false, reason: "Paste the Google Sheets link. It starts with https://docs.google.com/spreadsheets/d/." };
    const gid = /(?:[#?&]gid=)(\d{1,12})/.exec(`${u.search}${u.hash}`)?.[1];
    return { ok: true, url: `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? `&gid=${gid}` : ""}` };
  }
  u.hash = "";
  return { ok: true, url: u.toString() };
}

const HEADING_MAX = 38;

function headingFor(title: string): Block {
  const t = title.replace(/\s+/g, " ").trim().toUpperCase().slice(0, HEADING_MAX).trim();
  return { type: "heading", level: 1, text: t || "UPDATES" };
}

/** Sheet rows to a heading and a table (first row is the header). Empty data gives a plain "no data" note. */
export function sheetBlocks(title: string, rows: readonly (readonly string[])[]): Block[] {
  const [header, ...body] = rows;
  if (!header || header.length === 0) return [headingFor(title), { type: "paragraph", text: "No data yet." }];
  return [headingFor(title), { type: "table", header: [...header], rows: body.map((r) => [...r]) }];
}

/** Feed items to a heading and a bullet list. "Thu 12 Nov: Title" when the date is known. */
export function feedBlocks(title: string, items: readonly FeedItem[]): Block[] {
  if (items.length === 0) return [headingFor(title), { type: "paragraph", text: "No news yet." }];
  return [headingFor(title), { type: "bullets", items: items.map((i) => (i.date ? `${i.date}: ${i.title}` : i.title)) }];
}
