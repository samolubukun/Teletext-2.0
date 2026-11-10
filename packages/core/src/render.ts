// Render facade: Block[] -> Page[] + warnings (design.md "Pipeline").
import { INDEX_PAGE } from "./constants";
import { bodyRows, fastextRow, headerRow, resolveFastext } from "./decorate";
import { layoutBlocks, sanitizeBlocks } from "./layout";
import { normalize } from "./normalize";
import { isValidPageNumber } from "./page-number";
import { paginate } from "./paginate";
import { DEFAULT_STYLE, type StyleGuide } from "./style";
import type { Block, FastextLink, Page, RenderResult, Warning } from "./types";
import { validatePage } from "./validate";

export type RenderContext = {
  number: number;
  publisher: string;
  /** ISO time for the header. Passed in so rendering stays deterministic. */
  now: string;
  title?: string;
  fastext?: FastextLink[];
  /** Target of the default blue fastext link. */
  helpPage?: number;
  /** Minutes east of UTC for the header clock (Nigeria = 60). */
  utcOffsetMinutes?: number;
  orgRange?: readonly [number, number];
  style?: StyleGuide;
};

function dedupe(warnings: Warning[]): Warning[] {
  const seen = new Set<string>();
  return warnings.filter((w) => {
    const key = `${w.code}|${w.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const EMPTY: Block[] = [{ type: "paragraph", text: "No content yet." }];

export function render(blocks: readonly Block[], ctx: RenderContext): RenderResult {
  if (!isValidPageNumber(ctx.number)) {
    throw new Error(`render: page number must be an integer from 100 to 899, got ${String(ctx.number)}`);
  }
  const style = ctx.style ?? DEFAULT_STYLE;
  const warnings: Warning[] = [];

  let input = sanitizeBlocks(blocks, warnings);
  let layout = layoutBlocks(input, style);
  if (layout.lines.length === 0) {
    input = EMPTY;
    layout = layoutBlocks(input, style);
  }
  warnings.push(...layout.warnings);

  const { bodies, warnings: pageWarnings } = paginate(layout.lines);
  warnings.push(...pageWarnings);

  const fastext = resolveFastext(ctx.fastext, ctx.number, ctx.helpPage ?? INDEX_PAGE, warnings);
  const title = normalize(ctx.title ?? layout.title ?? ctx.publisher).text.replace(/\n/g, " ") || "Untitled";
  const subCount = bodies.length;

  const pages: Page[] = bodies.map((body, i) => {
    const sub = i + 1;
    const rows = [
      headerRow({ number: ctx.number, publisher: ctx.publisher, sub, subCount, now: ctx.now, utcOffsetMinutes: ctx.utcOffsetMinutes }, style),
      ...bodyRows(body, subCount > 1 && sub < subCount, style, warnings),
      fastextRow(fastext),
    ];
    return { number: ctx.number, sub, subCount, publisher: ctx.publisher, title, rows, fastext, updatedAt: ctx.now };
  });

  for (const page of pages) warnings.push(...validatePage(page, ctx.orgRange));
  return { pages, warnings: dedupe(warnings) };
}
