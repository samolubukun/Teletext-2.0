import { render, serializePage, type Block, type FastextLink, type SerializedPage, type Warning } from "@teletext/core";
import type { Doc } from "../_generated/dataModel";

export const DEFAULT_UTC_OFFSET = 60; // West Africa Time

export function renderForOrg(
  org: Doc<"organizations">,
  number: number,
  blocks: Block[],
  fastext: FastextLink[],
  now: number,
): { rendered: SerializedPage[]; warnings: Warning[] } {
  const { pages, warnings } = render(blocks, {
    number,
    publisher: org.name,
    now: new Date(now).toISOString(),
    fastext,
    helpPage: org.helpPage ?? org.rangeStart,
    utcOffsetMinutes: org.utcOffsetMinutes ?? DEFAULT_UTC_OFFSET,
    orgRange: [org.rangeStart, org.rangeEnd],
  });
  return { rendered: pages.map(serializePage), warnings };
}

/** Plain text of blocks for the search index. */
export function searchTextOf(title: string, blocks: Block[]): string {
  const parts: string[] = [title];
  for (const b of blocks) {
    if (b.type === "heading" || b.type === "paragraph") parts.push(b.text);
    else if (b.type === "bullets") parts.push(...b.items);
    else if (b.type === "keyvalue") parts.push(...b.rows.flatMap((r) => [r.label, r.value]));
    else if (b.type === "table") parts.push(...(b.header ?? []), ...b.rows.flat());
    else if (b.type === "link") parts.push(b.label);
  }
  return parts.join(" ").slice(0, 8000);
}
