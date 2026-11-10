// Lines -> sub-page bodies (Requirement 4).
import { BODY_ROWS } from "./constants";
import { HEADING_KINDS, isContentKind, type Line } from "./layout";
import type { Warning } from "./types";

export const MAX_SUBPAGES = 99;
/** On multi-page output the last body row holds the "continued" marker. */
export const MULTI_PAGE_CAPACITY = BODY_ROWS - 1;

function trimBlanks(lines: Line[]): Line[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]?.kind === "blank") start++;
  while (end > start && lines[end - 1]?.kind === "blank") end--;
  return lines.slice(start, end);
}

/** Rows needed to place the line at `i` plus everything it must stay with. */
function unitAt(lines: Line[], i: number): { size: number; needed: number } {
  const line = lines[i];
  if (!line) return { size: 1, needed: 1 };
  const size = line.kind === "double" && lines[i + 1]?.kind === "filler" ? 2 : 1;
  if (HEADING_KINDS.has(line.kind)) {
    // Keep a heading with the first content line after it (P8).
    let j = i + size;
    let needed = size;
    while (j < lines.length && !isContentKind(lines[j]?.kind ?? "blank")) {
      needed++;
      j++;
    }
    if (j < lines.length) needed++;
    return { size, needed };
  }
  if (line.kind === "tableHeader") return { size, needed: 2 };
  return { size, needed: size };
}

export type PaginateResult = { bodies: Line[][]; warnings: Warning[] };

export function paginate(input: Line[]): PaginateResult {
  const lines = trimBlanks(input);
  if (lines.length <= BODY_ROWS) return { bodies: [lines], warnings: [] };

  const capacity = MULTI_PAGE_CAPACITY;
  const bodies: Line[][] = [];
  let page: Line[] = [];
  const flush = () => {
    bodies.push(trimBlanks(page));
    page = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line) break;
    if (page.length === 0 && line.kind === "blank") {
      i++;
      continue;
    }
    const { size, needed } = unitAt(lines, i);
    if (page.length > 0 && page.length + needed > capacity) {
      flush();
      continue;
    }
    if (page.length === 0 && line.kind === "tableRow" && line.header) {
      page.push({ kind: "tableHeader", tokens: line.header, repeated: true });
    }
    for (let k = 0; k < size; k++) {
      const next = lines[i + k];
      if (next) page.push(next);
    }
    i += size;
    if (page.length >= capacity) flush();
  }
  if (page.length > 0) flush();

  const warnings: Warning[] = [];
  const nonEmpty = bodies.filter((b) => b.length > 0);
  if (nonEmpty.length > MAX_SUBPAGES) {
    warnings.push({
      level: "error",
      code: "too-long",
      message: `This content needs ${nonEmpty.length} screens. Only the first ${MAX_SUBPAGES} are shown.`,
      fix: "Split the content across several page numbers or shorten it with the AI condenser.",
    });
    return { bodies: nonEmpty.slice(0, MAX_SUBPAGES), warnings };
  }
  return { bodies: nonEmpty.length > 0 ? nonEmpty : [[]], warnings };
}
