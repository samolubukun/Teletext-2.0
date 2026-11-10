// Pages the service generates itself: index (100), not found, invalid number, offline, search.
// All go through the same renderer, so they obey every invariant.
import { render, serializePage, type Block, type FastextLink, type SerializedPage } from "@teletext/core";

export const SERVICE_NAME = "Teletext 2.0";
export const HELP_PAGE = 101;
export const PUBLISH_PAGE = 102;
const UTC_OFFSET = 60;

export type IndexOrg = { name: string; category: string; rangeStart: number; rangeEnd: number; pages: { number: number; title: string }[] };

function build(number: number, blocks: Block[], fastext: FastextLink[], nowIso: string): SerializedPage[] {
  const { pages } = render(blocks, { number, publisher: SERVICE_NAME, now: nowIso, fastext, utcOffsetMinutes: UTC_OFFSET });
  return pages.map(serializePage);
}

const baseFastext = (back: number): FastextLink[] => [
  { color: "red", label: "INDEX", page: 100 },
  { color: "green", label: "BACK", page: back },
  { color: "yellow", label: "HELP", page: HELP_PAGE },
  { color: "blue", label: "PUBLISH", page: PUBLISH_PAGE },
];

export function indexPage(orgs: IndexOrg[], nowIso: string): SerializedPage[] {
  const publishers = orgs.filter((o) => o.rangeStart >= 200);
  const blocks: Block[] = [
    { type: "heading", level: 1, text: "TELETEXT 2.0 INDEX" },
    { type: "paragraph", text: "Type a three-digit page number." },
  ];
  const byCategory = new Map<string, IndexOrg[]>();
  for (const o of publishers) {
    const key = o.category || "Community";
    byCategory.set(key, [...(byCategory.get(key) ?? []), o]);
  }
  for (const [category, list] of byCategory) {
    blocks.push({ type: "heading", level: 2, text: category.toUpperCase() });
    for (const o of list) {
      const first = o.pages[0]?.number ?? o.rangeStart;
      blocks.push({ type: "link", label: o.name, page: first });
    }
  }
  blocks.push({ type: "divider" });
  blocks.push({ type: "link", label: "How to use teletext", page: HELP_PAGE });
  blocks.push({ type: "link", label: "Publish your own pages", page: PUBLISH_PAGE });

  const firstPages = publishers.map((o) => o.pages[0]?.number ?? o.rangeStart);
  const fastext: FastextLink[] = [
    { color: "red", label: "HELP", page: HELP_PAGE },
    { color: "green", label: (publishers[0]?.category || "PAGES").toUpperCase(), page: firstPages[0] ?? 101 },
    { color: "yellow", label: (publishers[1]?.category || "PUBLISH").toUpperCase(), page: firstPages[1] ?? PUBLISH_PAGE },
    { color: "blue", label: (publishers[2]?.category || "PUBLISH").toUpperCase(), page: firstPages[2] ?? PUBLISH_PAGE },
  ];
  return build(100, blocks, fastext, nowIso);
}

export function notFoundPage(number: number, back: number, nowIso: string): SerializedPage[] {
  return build(
    number,
    [
      { type: "heading", level: 1, text: "PAGE NOT FOUND" },
      { type: "paragraph", text: `There is no page ${number} at the moment. It may have expired or not been published yet.` },
      { type: "link", label: "Go to the index", page: 100 },
    ],
    baseFastext(back),
    nowIso,
  );
}

export function invalidNumberPage(typed: number, back: number, nowIso: string): SerializedPage[] {
  return build(
    100,
    [
      { type: "heading", level: 1, text: "NO SUCH PAGE" },
      { type: "paragraph", text: `${String(typed).padStart(3, "0")} is not a page number. Pages go from 100 to 899.` },
      { type: "link", label: "Go to the index", page: 100 },
    ],
    baseFastext(back),
    nowIso,
  );
}

export function offlinePage(number: number, back: number, nowIso: string): SerializedPage[] {
  return build(
    number,
    [
      { type: "heading", level: 1, text: "YOU ARE OFFLINE" },
      { type: "paragraph", text: `Page ${number} has not been saved on this device yet.` },
      { type: "paragraph", text: "Pages you have already read still work. Try the index or go back." },
    ],
    baseFastext(back),
    nowIso,
  );
}

export function searchPage(query: string, hits: { number: number; title: string }[], nowIso: string): SerializedPage[] {
  const blocks: Block[] = [{ type: "heading", level: 1, text: "SEARCH RESULTS" }, { type: "paragraph", text: `You searched for: ${query}` }];
  if (hits.length === 0) blocks.push({ type: "paragraph", text: "No pages found. Try another word, or go to the index." });
  for (const h of hits) blocks.push({ type: "link", label: h.title, page: h.number });
  return build(100, blocks, baseFastext(100), nowIso);
}
