import { COLS } from "./constants";
import type { Color, ControlCode, Row, Token } from "./types";

export function ctl(code: ControlCode, value?: Color): Token {
  return value === undefined ? { kind: "ctl", code } : { kind: "ctl", code, value };
}

/** Foreground (alphanumeric) color change. Occupies one cell. */
export function fg(color: Color): Token {
  return { kind: "ctl", code: "fg", value: color };
}

export function chars(text: string): Token[] {
  const out: Token[] = [];
  for (const ch of text) out.push({ kind: "char", ch });
  return out;
}

export function spaces(n: number): Token[] {
  return chars(" ".repeat(Math.max(0, n)));
}

/** Pads (or, defensively, truncates) a token list to exactly `width` cells. */
export function padRow(tokens: readonly Token[], width: number = COLS): Row {
  const out = tokens.slice(0, width);
  while (out.length < width) out.push({ kind: "char", ch: " " });
  return out;
}

/** Visible text of a row: control codes show as spaces, exactly like on a real set. */
export function rowText(row: readonly Token[]): string {
  return row.map((t) => (t.kind === "char" ? t.ch : " ")).join("");
}

export function isBlankRow(row: readonly Token[]): boolean {
  return row.every((t) => t.kind === "ctl" || t.ch === " ");
}
