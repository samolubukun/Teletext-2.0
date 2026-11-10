// Compact wire format (Requirement 7.3: a serialized page is under 5 KB) and text adapters.
import { BODY_ROWS, FIRST_BODY_ROW, LAST_BODY_ROW } from "./constants";
import { rowText } from "./tokens";
import type { Color, FastextColor, FastextLink, Page, Row, Token } from "./types";

export const COLOR_ORDER: readonly Color[] = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];

/**
 * Each row is a 40-character string. Characters below 0x20 are control codes:
 * 0x00-0x07 foreground color, 0x08 flash, 0x09 steady, 0x0C single height,
 * 0x0D double height, 0x0E text mode, 0x10-0x17 mosaic color, 0x18-0x1F background color.
 * (This is our own encoding, close to but not identical to broadcast teletext bytes.)
 */
export type SerializedPage = {
  n: number;
  s: number;
  c: number;
  p: string;
  t: string;
  r: string[];
  f: { c: FastextColor; l: string; p: number }[];
  u: string;
};

function colorIndex(color: Color | undefined, fallback: number): number {
  const i = color === undefined ? -1 : COLOR_ORDER.indexOf(color);
  return i >= 0 ? i : fallback;
}

export function encodeToken(token: Token): string {
  if (token.kind === "char") return token.ch;
  switch (token.code) {
    case "fg":
      return String.fromCharCode(colorIndex(token.value, 7));
    case "flash":
      return "\x08";
    case "steady":
      return "\x09";
    case "single":
      return "\x0c";
    case "double":
      return "\x0d";
    case "text":
      return "\x0e";
    case "mosaic":
      return String.fromCharCode(0x10 + colorIndex(token.value, 7));
    case "bg":
      return String.fromCharCode(0x18 + colorIndex(token.value, 0));
  }
}

export function decodeChar(ch: string): Token {
  const code = ch.charCodeAt(0);
  if (code >= 0x20) return { kind: "char", ch };
  const color = (i: number): Color => COLOR_ORDER[i] ?? "white";
  if (code <= 0x07) return { kind: "ctl", code: "fg", value: color(code) };
  if (code === 0x08) return { kind: "ctl", code: "flash" };
  if (code === 0x09) return { kind: "ctl", code: "steady" };
  if (code === 0x0c) return { kind: "ctl", code: "single" };
  if (code === 0x0d) return { kind: "ctl", code: "double" };
  if (code >= 0x10 && code <= 0x17) return { kind: "ctl", code: "mosaic", value: color(code - 0x10) };
  if (code >= 0x18 && code <= 0x1f) return { kind: "ctl", code: "bg", value: color(code - 0x18) };
  return { kind: "ctl", code: "text" };
}

export function encodeRow(row: Row): string {
  return row.map(encodeToken).join("");
}

export function decodeRow(row: string): Row {
  return Array.from(row, decodeChar);
}

export function serializePage(page: Page): SerializedPage {
  return {
    n: page.number,
    s: page.sub,
    c: page.subCount,
    p: page.publisher,
    t: page.title,
    r: page.rows.map(encodeRow),
    f: page.fastext.map((l) => ({ c: l.color, l: l.label, p: l.page })),
    u: page.updatedAt,
  };
}

export function deserializePage(page: SerializedPage): Page {
  const fastext: FastextLink[] = page.f.map((l) => ({ color: l.c, label: l.l, page: l.p }));
  return {
    number: page.n,
    sub: page.s,
    subCount: page.c,
    publisher: page.p,
    title: page.t,
    rows: page.r.map(decodeRow),
    fastext,
    updatedAt: page.u,
  };
}

/** Rows as plain 40-character strings (control codes shown as spaces). For snapshots and plain views. */
export function toDisplayRows(page: Page): string[] {
  return page.rows.map(rowText);
}

/**
 * Body text lines for the screen-reader layer and clean mode: rows 1-22, without the
 * "continued" marker row and without trailing spaces. Empty rows are dropped.
 */
export function pageText(page: Page): string[] {
  const lastContentRow = page.subCount > 1 && page.sub < page.subCount ? LAST_BODY_ROW - 1 : LAST_BODY_ROW;
  return page.rows
    .slice(FIRST_BODY_ROW, Math.min(lastContentRow, FIRST_BODY_ROW + BODY_ROWS - 1) + 1)
    .map((r) => rowText(r).trimEnd())
    .filter((line) => line.trim().length > 0)
    .map((line) => line.replace(/^ /, ""));
}
