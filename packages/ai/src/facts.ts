// Fact guard (ai-condenser requirement 4): extract numbers, dates, times, money, phone numbers
// and names; match every draft value to the source. Pure functions only.

export type ValueKind = "phone" | "date" | "time" | "day" | "money" | "percent" | "number" | "name";

export type FactValue = {
  kind: ValueKind;
  /** Exactly as written. */
  raw: string;
  /** Normalized comparison key, e.g. "num:2500", "time:14:00", "date:11-13". */
  key: string;
  index: number;
  /** The sentence the value was found in. */
  sentence: string;
};

export type FactPair = { draft: FactValue; source: FactValue };

export type FactReport = {
  /** Draft values found in the source, with the source sentence. */
  matched: FactPair[];
  /** Draft values not found in the source: possible inventions. Must be checked before publishing. */
  unmatched: FactValue[];
  /** Source values missing from the draft: facts the publisher may want to add back. */
  dropped: FactValue[];
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]*\\.?";
const CURRENCY_BEFORE = "(?:NGN|USD|GBP|EUR|N|\\$|\\u20A6|\\u00A3|\\u20AC)";
const CURRENCY_AFTER = "(?:naira|NGN|USD|dollars?|pounds?|euros?)";
const AMOUNT = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?";

function monthIndex(name: string): number {
  return MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;
}

/** "2,500", "2500", "2500.00" -> "2500" (property A3). */
export function normalizeNumber(raw: string): string | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? String(n) : null;
}

/** "2pm", "2:00 p.m.", "14:00" -> "14:00" (property A4). */
export function normalizeTime(hours: number, minutes: number, meridiem?: string): string | null {
  let h = hours;
  if (meridiem) {
    if (h < 1 || h > 12) return null;
    const pm = meridiem.toLowerCase().startsWith("p");
    h = (h % 12) + (pm ? 12 : 0);
  }
  if (h < 0 || h > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function dateKey(month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `date:${month}-${day}`;
}

type Rule = { kind: ValueKind; re: RegExp; key: (m: RegExpExecArray) => string | null };

const DAY_WORD = /\b(Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)(day|sday|nesday|rsday|urday|\.)?\b|\b(MON|TUE|WED|THU|FRI|SAT|SUN)(DAY|SDAY|NESDAY|RSDAY|URDAY)?\b/g;

const RULES: Rule[] = [
  {
    kind: "phone",
    re: /(?<![\w+])(?:\+\d{1,3}[ -]?)?\(?0?\d{2,4}\)?[ -]?\d{3}[ -]?\d{3,4}(?![\w])/g,
    key: (m) => {
      const digits = m[0].replace(/\D/g, "");
      return digits.length >= 9 ? `phone:${digits}` : null;
    },
  },
  { kind: "date", re: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, key: (m) => dateKey(Number(m[2]), Number(m[3])) },
  { kind: "date", re: /\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/g, key: (m) => dateKey(Number(m[2]), Number(m[1])) },
  {
    kind: "date",
    re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}(?:,?\\s+(\\d{4}))?(?![a-z])`, "gi"),
    key: (m) => dateKey(monthIndex(m[2] ?? ""), Number(m[1])),
  },
  {
    kind: "date",
    re: new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?!\\d)`, "gi"),
    key: (m) => dateKey(monthIndex(m[1] ?? ""), Number(m[2])),
  },
  {
    kind: "time",
    re: /\b(\d{1,2})(?:[:.](\d{2}))?\s?([ap]\.?m\.?)(?![a-z])/gi,
    key: (m) => {
      const t = normalizeTime(Number(m[1]), Number(m[2] ?? 0), m[3]);
      return t ? `time:${t}` : null;
    },
  },
  {
    kind: "time",
    re: /\b([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g,
    key: (m) => {
      const t = normalizeTime(Number(m[1]), Number(m[2]));
      return t ? `time:${t}` : null;
    },
  },
  {
    kind: "day",
    re: DAY_WORD,
    key: (m) => `day:${(m[1] ?? m[3] ?? "").slice(0, 3).toLowerCase()}`,
  },
  {
    kind: "money",
    re: new RegExp(`(?<![A-Za-z])${CURRENCY_BEFORE}\\s?${AMOUNT}(?![\\w])|${AMOUNT}\\s?${CURRENCY_AFTER}\\b`, "gi"),
    key: (m) => {
      const amount = m[0].match(/\d[\d,]*(?:\.\d+)?/)?.[0];
      const n = amount ? normalizeNumber(amount) : null;
      return n ? `num:${n}` : null;
    },
  },
  {
    kind: "percent",
    re: /(?<![\w.])(\d+(?:\.\d+)?)\s?(?:%|percent\b)/gi,
    key: (m) => {
      const n = normalizeNumber(m[1] ?? "");
      return n ? `pct:${n}` : null;
    },
  },
  {
    kind: "number",
    re: /(?<![\w.,])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?![\w]|[.,]\d)/g,
    key: (m) => {
      const n = normalizeNumber(m[0]);
      return n ? `num:${n}` : null;
    },
  },
];

const NAME = /\b[A-Z][a-z]+(?:\s+(?:of|de|van|da)\b)?(?:\s+(?:[A-Z][a-z]+|[A-Z]\.))+/g;
const NOT_NAME_WORDS = new Set([
  ...MONTHS.map((m) => m[0]?.toUpperCase() + m.slice(1)),
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "January", "February", "March", "April", "June",
  "July", "August", "September", "October", "November", "December",
]);

function sentenceAt(text: string, index: number): string {
  let start = index;
  while (start > 0) {
    const prev = text[start - 1] ?? "";
    if (prev === "\n") break;
    if (/\s/.test(prev) && /[.!?]/.test(text[start - 2] ?? "")) break;
    start--;
  }
  let end = index;
  while (end < text.length) {
    const ch = text[end] ?? "";
    if (ch === "\n") break;
    if (/[.!?]/.test(ch) && (end + 1 >= text.length || /\s/.test(text[end + 1] ?? ""))) {
      end++;
      break;
    }
    end++;
  }
  return text.slice(start, end).trim();
}

/** Extracts every fact-like value. Earlier rules win; matched spans are masked from later rules. */
export function extractValues(text: string): FactValue[] {
  const source = typeof text === "string" ? text : "";
  let work = source;
  const out: FactValue[] = [];
  const mask = (start: number, length: number) => {
    work = work.slice(0, start) + " ".repeat(length) + work.slice(start + length);
  };
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    const found: RegExpExecArray[] = [];
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(work)) !== null) {
      if (m[0].length === 0) {
        rule.re.lastIndex++;
        continue;
      }
      found.push(m);
    }
    for (const match of found) {
      const key = rule.key(match);
      if (!key) continue;
      out.push({ kind: rule.kind, raw: match[0].trim(), key, index: match.index, sentence: sentenceAt(source, match.index) });
      mask(match.index, match[0].length);
    }
  }
  NAME.lastIndex = 0;
  let n: RegExpExecArray | null;
  while ((n = NAME.exec(work)) !== null) {
    const words = n[0].split(/\s+/);
    if (words.every((w) => NOT_NAME_WORDS.has(w.replace(/\.$/, "")))) continue;
    const raw = n[0].replace(/\s+/g, " ");
    out.push({ kind: "name", raw, key: `name:${raw.toLowerCase()}`, index: n.index, sentence: sentenceAt(source, n.index) });
  }
  return out.sort((a, b) => a.index - b.index);
}

function squash(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ");
}

/** Matches every draft value to the source (A1, A2) and lists dropped source values. */
export function factGuard(sourceText: string, draftText: string): FactReport {
  const sourceValues = extractValues(sourceText);
  const draftValues = extractValues(draftText);
  const sourceByKey = new Map<string, FactValue>();
  for (const v of sourceValues) if (!sourceByKey.has(v.key)) sourceByKey.set(v.key, v);
  const sourceLower = squash(sourceText);
  const draftLower = squash(draftText);

  const matched: FactPair[] = [];
  const unmatched: FactValue[] = [];
  for (const v of draftValues) {
    const hit = sourceByKey.get(v.key);
    if (hit) {
      matched.push({ draft: v, source: hit });
      continue;
    }
    if (v.kind === "name") {
      const at = sourceLower.indexOf(squash(v.raw));
      if (at >= 0) {
        matched.push({ draft: v, source: { ...v, index: at, sentence: sentenceAt(sourceText, Math.min(at, sourceText.length - 1)) } });
        continue;
      }
    }
    unmatched.push(v);
  }

  const draftKeys = new Set(draftValues.map((v) => v.key));
  const dropped: FactValue[] = [];
  const seen = new Set<string>();
  for (const v of sourceValues) {
    if (seen.has(v.key)) continue;
    seen.add(v.key);
    const present = v.kind === "name" ? draftLower.includes(squash(v.raw)) : draftKeys.has(v.key);
    if (!present) dropped.push(v);
  }
  return { matched, unmatched, dropped };
}
