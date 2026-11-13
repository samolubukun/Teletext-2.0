// Blocks -> lines of tokens (Requirements 2 and 3). Every line is at most COLS cells.
import { COLS, PAGE_MAX, PAGE_MIN } from "./constants";
import { normalize } from "./normalize";
import { DEFAULT_STYLE, type StyleGuide } from "./style";
import { chars, ctl, fg, spaces } from "./tokens";
import type { Block, Color, Token, Warning } from "./types";
import { wrapText } from "./wrap";

export type LineKind =
  | "text"
  | "heading"
  | "double"
  | "filler"
  | "blank"
  | "tableHeader"
  | "tableRow"
  | "mosaic";

export type Line = {
  kind: LineKind;
  tokens: Token[];
  /** For table rows: the header line to repeat when a table continues on a new sub-page. */
  header?: Token[];
  /** True for a table header repeated by the paginator. */
  repeated?: boolean;
};

export type LayoutResult = { lines: Line[]; warnings: Warning[]; title: string | undefined };

const TEXT_WIDTH = COLS - 1;
const BULLET_WIDTH = COLS - 3;
const LINK_LABEL_WIDTH = COLS - 5;
const MAX_LABEL_WIDTH = 18;
const MAX_TABLE_COLUMNS = 12;
const MAX_MOSAIC_ROWS = 22;
const NUMERIC_CELL = /^[-+]?[N$]?\d[\d,.:]*%?$/;

export const HEADING_KINDS: ReadonlySet<LineKind> = new Set(["heading", "double", "filler"]);
export function isContentKind(kind: LineKind): boolean {
  return kind !== "blank" && !HEADING_KINDS.has(kind);
}

type Ctx = { style: StyleGuide; warnings: Warning[] };

function clean(ctx: Ctx, text: unknown): string {
  if (typeof text !== "string") return "";
  const result = normalize(text);
  ctx.warnings.push(...result.warnings);
  return result.text;
}

function textLines(text: string, color: Color, kind: LineKind = "text"): Line[] {
  return wrapText(text, TEXT_WIDTH).map((line) => ({ kind, tokens: [fg(color), ...chars(line)] }));
}

function paragraphs(text: string): string[] {
  return text.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 0);
}

function withBlanks(groups: Line[][]): Line[] {
  const out: Line[] = [];
  for (const group of groups) {
    if (group.length === 0) continue;
    if (out.length > 0) out.push({ kind: "blank", tokens: [] });
    out.push(...group);
  }
  return out;
}

/** A heading longer than this cannot be kept with its content, so it is shown as text (found by P8). */
const MAX_HEADING_LINES = { 1: 2, 2: 3 } as const;

function layoutHeading(ctx: Ctx, block: Extract<Block, { type: "heading" }>): Line[] {
  const text = clean(ctx, block.text).replace(/\n/g, " ");
  if (!text) return [];
  const level = block.level === 1 ? 1 : 2;
  if (wrapText(text, level === 1 ? COLS - 2 : TEXT_WIDTH).length > MAX_HEADING_LINES[level]) {
    ctx.warnings.push({
      level: "warning",
      code: "heading-too-long",
      message: "A heading is too long to show as a heading, so it is shown as normal text.",
      fix: "Keep headings to one short line (at most 38 characters).",
    });
    return textLines(text, ctx.style.heading);
  }
  if (level === 1) {
    const out: Line[] = [];
    for (const line of wrapText(text, COLS - 2)) {
      out.push({ kind: "double", tokens: [fg(ctx.style.heading), ctl("double"), ...chars(line)] });
      out.push({ kind: "filler", tokens: [] });
    }
    return out;
  }
  return textLines(text, ctx.style.heading, "heading");
}

function layoutParagraph(ctx: Ctx, block: Extract<Block, { type: "paragraph" }>): Line[] {
  const color = block.tone === "alert" ? ctx.style.alert : ctx.style.body;
  return withBlanks(paragraphs(clean(ctx, block.text)).map((p) => textLines(p, color)));
}

function layoutBullets(ctx: Ctx, block: Extract<Block, { type: "bullets" }>): Line[] {
  const items = Array.isArray(block.items) ? block.items : [];
  const out: Line[] = [];
  for (const raw of items) {
    const item = clean(ctx, raw).replace(/\n+/g, " ");
    if (!item) continue;
    wrapText(item, BULLET_WIDTH).forEach((line, i) => {
      const lead = i === 0 ? [fg(ctx.style.bullet), ...chars("*"), fg(ctx.style.body)] : [fg(ctx.style.body), ...spaces(2)];
      out.push({ kind: "text", tokens: [...lead, ...chars(line)] });
    });
  }
  return out;
}

function keyValueLines(ctx: Ctx, rows: { label: string; value: string }[]): Line[] {
  const width = rows.reduce((m, r) => Math.max(m, r.label.length), 0);
  const out: Line[] = [];
  if (width <= MAX_LABEL_WIDTH) {
    const valueWidth = COLS - 2 - width;
    for (const row of rows) {
      const values = row.value ? wrapText(row.value, valueWidth) : [""];
      values.forEach((value, i) => {
        const tokens =
          i === 0
            ? [fg(ctx.style.label), ...chars(row.label.padEnd(width)), fg(ctx.style.body), ...chars(value)]
            : [fg(ctx.style.body), ...spaces(width + 1), ...chars(value)];
        out.push({ kind: "text", tokens });
      });
    }
    return out;
  }
  // Stacked: label above value.
  for (const row of rows) {
    for (const line of wrapText(row.label, TEXT_WIDTH)) out.push({ kind: "text", tokens: [fg(ctx.style.label), ...chars(line)] });
    if (row.value) {
      for (const line of wrapText(row.value, BULLET_WIDTH)) out.push({ kind: "text", tokens: [fg(ctx.style.body), ...spaces(2), ...chars(line)] });
    }
  }
  return out;
}

function layoutKeyValue(ctx: Ctx, block: Extract<Block, { type: "keyvalue" }>): Line[] {
  const rows = (Array.isArray(block.rows) ? block.rows : [])
    .filter((r): r is { label: string; value: string } => typeof r === "object" && r !== null)
    .map((r) => ({ label: clean(ctx, r.label).replace(/\n+/g, " "), value: clean(ctx, r.value).replace(/\n+/g, " ") }))
    .filter((r) => r.label || r.value);
  return keyValueLines(ctx, rows);
}

function layoutTable(ctx: Ctx, block: Extract<Block, { type: "table" }>): Line[] {
  const cell = (v: unknown) => clean(ctx, typeof v === "number" ? String(v) : v).replace(/\n+/g, " ");
  const header = Array.isArray(block.header) ? block.header.map(cell) : undefined;
  const rows = (Array.isArray(block.rows) ? block.rows : [])
    .filter((r): r is string[] => Array.isArray(r))
    .map((r) => r.map(cell))
    .filter((r) => r.some((c) => c.length > 0));
  const columns = Math.max(header?.length ?? 0, ...rows.map((r) => r.length), 0);
  if (columns === 0 || (rows.length === 0 && !header)) return [];

  const widths = Array.from({ length: columns }, (_, c) =>
    Math.max(header?.[c]?.length ?? 0, ...rows.map((r) => r[c]?.length ?? 0)),
  );
  const numeric = Array.from({ length: columns }, (_, c) => {
    const values = rows.map((r) => r[c] ?? "").filter((v) => v.length > 0);
    return values.length > 0 && values.every((v) => NUMERIC_CELL.test(v));
  });
  const total = 1 + widths.reduce((a, b) => a + b, 0) + (columns - 1);

  if (columns <= MAX_TABLE_COLUMNS && total <= COLS) {
    const format = (cells: string[]) =>
      widths
        .map((w, c) => {
          const v = cells[c] ?? "";
          return numeric[c] ? v.padStart(w) : v.padEnd(w);
        })
        .join(" ")
        .replace(/\s+$/, "");
    const headerTokens = header ? [fg(ctx.style.tableHeader), ...chars(format(header))] : undefined;
    const out: Line[] = [];
    if (headerTokens) out.push({ kind: "tableHeader", tokens: headerTokens });
    for (const row of rows) {
      const line: Line = { kind: "tableRow", tokens: [fg(ctx.style.body), ...chars(format(row))] };
      if (headerTokens) line.header = headerTokens;
      out.push(line);
    }
    return out;
  }

  ctx.warnings.push({
    level: "warning",
    code: "table-too-wide",
    message: "The table is too wide for 40 columns, so each row is shown as a list instead.",
    fix: "Use fewer columns or shorter cell text, or split the table in two.",
  });
  return withBlanks(
    rows.map((row) =>
      keyValueLines(
        ctx,
        row.map((value, c) => ({ label: header?.[c] || `Col ${c + 1}`, value })).filter((r) => r.value),
      ),
    ),
  );
}

function layoutMosaic(ctx: Ctx, block: Extract<Block, { type: "mosaic" }>): Line[] {
  const rows = (Array.isArray(block.rows) ? block.rows : []).filter((r): r is string => typeof r === "string");
  if (rows.length > MAX_MOSAIC_ROWS || rows.some((r) => r.length > TEXT_WIDTH || /[^\x20-\x7f]/.test(r))) {
    ctx.warnings.push({
      level: "warning",
      code: "mosaic-trimmed",
      message: `The mosaic image was trimmed to fit ${TEXT_WIDTH} x ${MAX_MOSAIC_ROWS} cells.`,
      fix: "Use a smaller image for the logo tool.",
    });
  }
  return rows.slice(0, MAX_MOSAIC_ROWS).map((r) => ({
    kind: "mosaic" as const,
    tokens: [ctl("mosaic", ctx.style.mosaic), ...chars(r.replace(/[^\x20-\x7f]/g, " ").slice(0, TEXT_WIDTH))],
  }));
}

function layoutLink(ctx: Ctx, block: Extract<Block, { type: "link" }>): Line[] {
  const label = clean(ctx, block.label).replace(/\n+/g, " ");
  const valid = Number.isInteger(block.page) && block.page >= PAGE_MIN && block.page <= PAGE_MAX;
  if (!valid) {
    ctx.warnings.push({
      level: "warning",
      code: "link-invalid-page",
      message: `A link points to page ${String(block.page)}, which is not a valid page number.`,
      fix: "Use a page number from 100 to 899.",
    });
    return label ? textLines(label, ctx.style.body) : [];
  }
  const lines = wrapText(label || "Page", LINK_LABEL_WIDTH);
  return lines.map((line, i) => ({
    kind: "text" as const,
    tokens:
      i === lines.length - 1
        ? [fg(ctx.style.body), ...chars(line.padEnd(LINK_LABEL_WIDTH)), fg(ctx.style.link), ...chars(String(block.page))]
        : [fg(ctx.style.body), ...chars(line)],
  }));
}

function layoutBlock(ctx: Ctx, block: Block): Line[] {
  switch (block.type) {
    case "heading":
      return layoutHeading(ctx, block);
    case "paragraph":
      return layoutParagraph(ctx, block);
    case "bullets":
      return layoutBullets(ctx, block);
    case "keyvalue":
      return layoutKeyValue(ctx, block);
    case "table":
      return layoutTable(ctx, block);
    case "divider":
      return [{ kind: "text", tokens: [fg(ctx.style.divider), ...chars("-".repeat(TEXT_WIDTH))] }];
    case "mosaic":
      return layoutMosaic(ctx, block);
    case "link":
      return layoutLink(ctx, block);
  }
}

const BLOCK_TYPES = new Set(["heading", "paragraph", "bullets", "keyvalue", "table", "divider", "mosaic", "link"]);

/** Keeps only objects that look like blocks, so untrusted input (AI, database) never crashes the renderer. */
export function sanitizeBlocks(input: unknown, warnings: Warning[]): Block[] {
  if (!Array.isArray(input)) return [];
  const out: Block[] = [];
  let dropped = 0;
  for (const raw of input) {
    if (typeof raw === "object" && raw !== null && BLOCK_TYPES.has((raw as { type?: unknown }).type as string)) {
      const block = raw as Block;
      if (block.type === "heading" && block.level !== 1 && block.level !== 2) {
        out.push({ ...block, level: 2 });
      } else {
        out.push(block);
      }
    } else {
      dropped++;
    }
  }
  if (dropped > 0) {
    warnings.push({
      level: "warning",
      code: "block-invalid",
      message: `${dropped} content block(s) could not be read and were skipped.`,
      fix: "Re-create the missing content in the editor.",
    });
  }
  return out;
}

export function layoutBlocks(blocks: readonly Block[], style: StyleGuide = DEFAULT_STYLE): LayoutResult {
  const ctx: Ctx = { style, warnings: [] };
  const groups = blocks.map((b) => layoutBlock(ctx, b));

  // A heading must never be the last visible line (P8). A trailing heading has nothing to
  // introduce, so it is shown as plain text in the heading color.
  let last = groups.length - 1;
  while (last >= 0 && (groups[last]?.length ?? 0) === 0) last--;
  const lastBlock = blocks[last];
  if (lastBlock?.type === "heading") {
    const text = clean({ style, warnings: [] }, lastBlock.text).replace(/\n/g, " ");
    groups[last] = textLines(text, style.heading);
    ctx.warnings.push({
      level: "warning",
      code: "heading-at-end",
      message: "The last block is a heading with no text after it, so it is shown as normal text.",
      fix: "Add content under the heading or remove it.",
    });
  }

  const firstHeading = blocks.find((b): b is Extract<Block, { type: "heading" }> => b.type === "heading");
  const title = firstHeading ? clean({ style, warnings: [] }, firstHeading.text).replace(/\n/g, " ") || undefined : undefined;
  return { lines: withBlanks(groups), warnings: ctx.warnings, title };
}
