// Greedy word wrap measured in cells (Requirement 2.2 - 2.4).

const UNIT =
  /^(am|pm|a\.m\.|p\.m\.|km|m|cm|mm|kg|g|mg|l|ml|min|mins|minutes|hr|hrs|hours|h|s|secs?|%|days?|weeks?|months?|years?|naira|kobo)[.,;:!?]?$/i;
const NUMBERISH = /^[N$]?\d[\d,.:]*$/;
const DIGITS = /^[+(]?\d+[)]?$/;

/** Splits text into wrap units. A number and its unit ("10 am") stay together when they fit. */
function units(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    let unit = words[i] ?? "";
    const next = words[i + 1];
    if (next !== undefined && NUMBERISH.test(unit) && UNIT.test(next) && unit.length + 1 + next.length <= width) {
      out.push(`${unit} ${next}`);
      i++;
      continue;
    }
    // Keep digit groups such as phone numbers ("0800 000 0000") on one line.
    let last = unit;
    while (DIGITS.test(last) && DIGITS.test(words[i + 1] ?? "") && unit.length + 1 + (words[i + 1] ?? "").length <= width) {
      last = words[i + 1] ?? "";
      unit = `${unit} ${last}`;
      i++;
    }
    out.push(unit);
  }
  return out;
}

/**
 * Wraps text into lines of at most `width` cells.
 * Words are only split (with a trailing hyphen) when they are longer than `width` (property P3).
 */
export function wrapText(text: string, width: number): string[] {
  const w = Math.max(2, Math.floor(width));
  const lines: string[] = [];
  let current = "";

  for (const unit of units(text, w)) {
    if (unit.length > w) {
      if (current) {
        lines.push(current);
        current = "";
      }
      let rest = unit;
      while (rest.length > w) {
        lines.push(`${rest.slice(0, w - 1)}-`);
        rest = rest.slice(w - 1);
      }
      current = rest;
      continue;
    }
    if (!current) current = unit;
    else if (current.length + 1 + unit.length <= w) current += ` ${unit}`;
    else {
      lines.push(current);
      current = unit;
    }
  }
  if (current) lines.push(current);
  return lines;
}
