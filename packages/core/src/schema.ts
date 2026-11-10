// Zod schemas for untrusted blocks (editor saves, AI output, imports).
import { z } from "zod";
import type { Block } from "./types";

const text = z.string().max(20_000);
const pageNumber = z.number().int().min(100).max(899);

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: text, level: z.union([z.literal(1), z.literal(2)]) }),
  z.object({ type: z.literal("paragraph"), text: text, tone: z.enum(["normal", "alert"]).optional() }),
  z.object({ type: z.literal("bullets"), items: z.array(text).max(100) }),
  z.object({ type: z.literal("keyvalue"), rows: z.array(z.object({ label: text, value: text })).max(100) }),
  z.object({ type: z.literal("table"), header: z.array(text).max(12).optional(), rows: z.array(z.array(text).max(12)).max(500) }),
  z.object({ type: z.literal("divider") }),
  z.object({ type: z.literal("mosaic"), rows: z.array(z.string().max(40)).max(22) }),
  z.object({ type: z.literal("link"), label: text, page: pageNumber }),
]);

export const blocksSchema = z.array(blockSchema).max(200);

export const fastextLinkSchema = z.object({
  color: z.enum(["red", "green", "yellow", "blue"]),
  label: z.string().max(20),
  page: pageNumber,
});

// Compile-time check that the schema and the Block type agree.
type SchemaBlock = z.infer<typeof blockSchema>;
const _check: (b: SchemaBlock) => Block = (b) => b;
void _check;
