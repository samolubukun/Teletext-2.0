import type { Warning } from "./types";

/** Characters replaced silently (Requirement 1.1). */
const PLAIN: Record<string, string> = {
  "\u2018": "'", "\u2019": "'", "\u201A": "'", "\u201B": "'", "\u2032": "'", "\u00B4": "'",
  "\u201C": '"', "\u201D": '"', "\u201E": '"', "\u201F": '"', "\u2033": '"', "\u00AB": '"', "\u00BB": '"',
  "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-", "\u2014": "-", "\u2015": "-", "\u2212": "-",
  "\u2026": "...",
};

/** Characters replaced with a warning, because the meaning may shift (Requirement 1.3). */
const SIMPLIFY: Record<string, string> = {
  "\u2022": "*", "\u00B7": "*", "\u00D7": "x", "\u00F7": "/",
  "\u20A6": "N", "\u00A3": "GBP", "\u20AC": "EUR", "\u00A2": "c", "\u00A5": "JPY",
  "\u00A9": "(c)", "\u00AE": "(R)", "\u2122": "TM", "\u00B0": "deg",
  "\u00BD": "1/2", "\u00BC": "1/4", "\u00BE": "3/4",
  "\u00DF": "ss", "\u00C6": "AE", "\u00E6": "ae", "\u0152": "OE", "\u0153": "oe",
  "\u00D8": "O", "\u00F8": "o", "\u0110": "D", "\u0111": "d", "\u0141": "L", "\u0142": "l",
  "\u00D0": "D", "\u00F0": "d", "\u00DE": "Th", "\u00FE": "th", "\u0131": "i",
};

const SPACE_LIKE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\t\v\f]/g;
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;
const PRINTABLE = /^[\x20-\x7e]+$/;

export type NormalizeResult = { text: string; warnings: Warning[] };

/**
 * Cleans text so it only contains printable ASCII and single newlines/blank lines.
 * Idempotent: normalize(normalize(t).text).text === normalize(t).text (property P6).
 */
export function normalize(input: string): NormalizeResult {
  const source = typeof input === "string" ? input : "";
  const s = source.replace(/\r\n?/g, "\n").replace(INVISIBLE, "").replace(SPACE_LIKE, " ");

  const simplified = new Map<string, string>();
  let removed = 0;
  let out = "";

  for (const ch of s.normalize("NFC")) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "\n" || (code >= 0x20 && code <= 0x7e)) {
      out += ch;
      continue;
    }
    if (/^\p{M}$/u.test(ch)) {
      // A separate accent mark (for example Yoruba tone marks): drop it, keep the letter.
      simplified.set("accent marks", "removed");
      continue;
    }
    const plain = PLAIN[ch];
    if (plain !== undefined) {
      out += plain;
      continue;
    }
    const simple = SIMPLIFY[ch];
    if (simple !== undefined) {
      out += simple;
      simplified.set(ch, simple);
      continue;
    }
    if (code < 0x20 || (code >= 0x7f && code < 0xa0)) continue; // control characters
    const base = ch.normalize("NFD").replace(/\p{M}/gu, "");
    if (base.length > 0 && PRINTABLE.test(base)) {
      out += base;
      simplified.set(ch, base);
      continue;
    }
    removed++;
  }

  const text = out
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "");

  const warnings: Warning[] = [];
  if (simplified.size > 0) {
    const list = [...simplified]
      .slice(0, 8)
      .map(([from, to]) => `${from} to ${to}`)
      .join(", ");
    warnings.push({
      level: "warning",
      code: "chars-simplified",
      message: `Some characters were changed to fit the teletext character set: ${list}.`,
      fix: "Check that names and amounts using these characters still read correctly.",
    });
  }
  if (removed > 0) {
    warnings.push({
      level: "warning",
      code: "chars-removed",
      message: `Removed ${removed} character(s) with no teletext equivalent, such as emoji.`,
      fix: "Use words instead of emoji and symbols.",
    });
  }
  return { text, warnings };
}
