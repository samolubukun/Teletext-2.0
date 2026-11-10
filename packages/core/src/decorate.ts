// Header row, fastext bar and body padding (Requirement 5).
import { BODY_ROWS, COLS, INDEX_PAGE, PAGE_MAX, PAGE_MIN } from "./constants";
import { formatHeaderDate } from "./date";
import type { Line } from "./layout";
import { normalize } from "./normalize";
import type { StyleGuide } from "./style";
import { chars, fg, padRow, spaces } from "./tokens";
import type { FastextColor, FastextLink, Row, Warning } from "./types";

export const FASTEXT_COLORS: readonly FastextColor[] = ["red", "green", "yellow", "blue"];
export const FASTEXT_SLOT = COLS / 4; // 10 cells: 1 color code + 9 label cells
export const FASTEXT_LABEL_MAX = FASTEXT_SLOT - 1;
export const PUBLISHER_WIDTH = 12;
export const MARKER_TEXT = "MORE >>>";

export type HeaderInput = {
  number: number;
  publisher: string;
  sub: number;
  subCount: number;
  now: string;
  utcOffsetMinutes?: number;
};

/** P412 GREENFIELD H  1/3 Tue 10 Nov 14:32 -> exactly 40 cells. */
export function headerRow(input: HeaderInput, style: StyleGuide): Row {
  const { date, time } = formatHeaderDate(input.now, input.utcOffsetMinutes);
  const publisher = normalize(input.publisher).text.replace(/\n/g, " ").toUpperCase().slice(0, PUBLISHER_WIDTH);
  const subLabel = input.subCount > 1 ? `${input.sub}/${input.subCount}` : "";
  const tokens = [
    fg(style.headerNumber),
    ...chars(`P${input.number}`),
    fg(style.headerPublisher),
    ...chars(publisher.padEnd(PUBLISHER_WIDTH)),
    fg(style.headerDate),
    ...chars(subLabel.padStart(5)),
    ...chars(date.padStart(10).slice(0, 10)),
    fg(style.headerTime),
    ...chars(time),
  ];
  return padRow(tokens);
}

export function defaultFastext(number: number, helpPage: number = INDEX_PAGE): FastextLink[] {
  return [
    { color: "red", label: "INDEX", page: INDEX_PAGE },
    { color: "green", label: "BACK", page: Math.max(PAGE_MIN, number - 1) },
    { color: "yellow", label: "NEXT", page: Math.min(PAGE_MAX, number + 1) },
    { color: "blue", label: "HELP", page: helpPage },
  ];
}

/** Cleans fastext links: valid colors and pages, one per color, at most four, labels fit (P15). */
export function resolveFastext(
  links: readonly FastextLink[] | undefined,
  number: number,
  helpPage: number | undefined,
  warnings: Warning[],
): FastextLink[] {
  const source = links && links.length > 0 ? links : defaultFastext(number, helpPage);
  const byColor = new Map<FastextColor, FastextLink>();
  let shortened = false;
  for (const link of source) {
    if (!link || !FASTEXT_COLORS.includes(link.color) || byColor.has(link.color)) continue;
    if (!Number.isInteger(link.page) || link.page < PAGE_MIN || link.page > PAGE_MAX) continue;
    const clean = normalize(typeof link.label === "string" ? link.label : "").text.replace(/\s+/g, " ").toUpperCase();
    const label = clean.slice(0, FASTEXT_LABEL_MAX).trimEnd() || String(link.page);
    if (clean.length > FASTEXT_LABEL_MAX) shortened = true;
    byColor.set(link.color, { color: link.color, label, page: link.page });
  }
  if (shortened) {
    warnings.push({
      level: "warning",
      code: "fastext-label-shortened",
      message: `Fastext labels can be at most ${FASTEXT_LABEL_MAX} characters, so some were shortened.`,
      fix: "Use short labels such as INDEX, BACK, NEXT or HELP.",
    });
  }
  return FASTEXT_COLORS.flatMap((c) => {
    const link = byColor.get(c);
    return link ? [link] : [];
  });
}

export function fastextRow(links: readonly FastextLink[]): Row {
  const tokens = FASTEXT_COLORS.flatMap((color) => {
    const link = links.find((l) => l.color === color);
    return link ? [fg(color), ...chars(link.label.padEnd(FASTEXT_LABEL_MAX))] : [fg("white"), ...spaces(FASTEXT_LABEL_MAX)];
  });
  return padRow(tokens);
}

export function markerRow(style: StyleGuide): Row {
  return padRow([fg(style.marker), ...chars(MARKER_TEXT.padStart(COLS - 1))]);
}

/** Body lines -> exactly BODY_ROWS rows of COLS cells. Reports any line that overflowed. */
export function bodyRows(lines: readonly Line[], withMarker: boolean, style: StyleGuide, warnings: Warning[]): Row[] {
  const rows: Row[] = [];
  let overflow = false;
  for (const line of lines.slice(0, BODY_ROWS)) {
    if (line.tokens.length > COLS) overflow = true;
    rows.push(padRow(line.tokens));
  }
  while (rows.length < BODY_ROWS) rows.push(padRow([]));
  if (withMarker) rows[BODY_ROWS - 1] = markerRow(style);
  if (overflow) {
    warnings.push({
      level: "error",
      code: "internal-overflow",
      message: "A line was wider than 40 cells and was cut off. This is a renderer bug.",
      fix: "Report this page to the Teletext 2.0 team.",
    });
  }
  return rows;
}
