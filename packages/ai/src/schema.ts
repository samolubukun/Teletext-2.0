// AI condenser output contract. The model returns this JSON; we validate it with Zod and
// convert it to renderer blocks. Kept flat so Gemini's constrained decoding stays simple.
import { z } from "zod";
import type { Block } from "@teletext/core";

export const aiBlockSchema = z.object({
  kind: z.enum(["heading", "paragraph", "bullets", "keyvalue", "alert"]),
  text: z.string().max(2000),
  items: z.array(z.string().max(500)).max(20),
  pairs: z.array(z.object({ label: z.string().max(60), value: z.string().max(200) })).max(20),
});

export const condenseOutputSchema = z.object({
  title: z.string().min(1).max(60),
  blocks: z.array(aiBlockSchema).min(1).max(12),
  fastext: z.array(z.object({ label: z.string().max(20), hint: z.string().max(80) })).max(4),
});

export type AiBlock = z.infer<typeof aiBlockSchema>;
export type CondenseOutput = z.infer<typeof condenseOutputSchema>;

/** JSON Schema sent to Gemini as response_format.schema. Bounds are re-checked by Zod. */
export const CONDENSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Page title, uppercase, at most 38 characters." },
    blocks: {
      type: "array",
      description: "At most 8 short blocks. Most important facts first.",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["heading", "paragraph", "bullets", "keyvalue", "alert"] },
          text: { type: "string", description: "Text for heading, paragraph and alert. Empty string otherwise." },
          items: { type: "array", items: { type: "string" }, description: "Bullet items. Empty array otherwise." },
          pairs: {
            type: "array",
            description: "Label and value rows such as Date / Fri 13 Nov. Empty array otherwise.",
            items: {
              type: "object",
              properties: { label: { type: "string" }, value: { type: "string" } },
              required: ["label", "value"],
            },
          },
        },
        required: ["kind", "text", "items", "pairs"],
      },
    },
    fastext: {
      type: "array",
      description: "Up to 4 suggested fastext labels, each at most 8 characters.",
      items: {
        type: "object",
        properties: { label: { type: "string" }, hint: { type: "string", description: "What the linked page should contain." } },
        required: ["label", "hint"],
      },
    },
  },
  required: ["title", "blocks", "fastext"],
} as const;

/** Converts validated AI output into renderer blocks. The title becomes a double-height heading. */
export function toBlocks(output: CondenseOutput): Block[] {
  const blocks: Block[] = [{ type: "heading", level: 1, text: output.title.toUpperCase().slice(0, 38) }];
  for (const b of output.blocks) {
    switch (b.kind) {
      case "heading":
        if (b.text.trim()) blocks.push({ type: "heading", level: 2, text: b.text });
        break;
      case "paragraph":
        if (b.text.trim()) blocks.push({ type: "paragraph", text: b.text });
        break;
      case "alert":
        if (b.text.trim()) blocks.push({ type: "paragraph", tone: "alert", text: b.text });
        break;
      case "bullets": {
        const items = b.items.filter((i) => i.trim());
        if (items.length > 0) blocks.push({ type: "bullets", items });
        break;
      }
      case "keyvalue": {
        const rows = b.pairs.filter((p) => p.label.trim() || p.value.trim());
        if (rows.length > 0) blocks.push({ type: "keyvalue", rows });
        break;
      }
    }
  }
  return blocks;
}

/** All visible text of a block list, one block per line. Used for the fact guard. */
export function blocksToText(blocks: readonly Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "heading":
        case "paragraph":
          return b.text;
        case "bullets":
          return b.items.join("\n");
        case "keyvalue":
          return b.rows.map((r) => `${r.label}: ${r.value}`).join("\n");
        case "table":
          return [b.header ?? [], ...b.rows].map((r) => r.join(" ")).join("\n");
        case "link":
          return `${b.label} ${b.page}`;
        default:
          return "";
      }
    })
    .filter((t) => t.length > 0)
    .join("\n");
}
