"use client";
import type { Block } from "@teletext/core";
import { MosaicImporter } from "./MosaicImporter";
import { inputClass } from "./ui";

const NEW_BLOCK: Record<Block["type"], () => Block> = {
  heading: () => ({ type: "heading", level: 2, text: "" }),
  paragraph: () => ({ type: "paragraph", text: "" }),
  bullets: () => ({ type: "bullets", items: [""] }),
  keyvalue: () => ({ type: "keyvalue", rows: [{ label: "", value: "" }] }),
  table: () => ({ type: "table", header: ["Column 1", "Column 2"], rows: [["", ""]] }),
  divider: () => ({ type: "divider" }),
  mosaic: () => ({ type: "mosaic", rows: [] }),
  link: () => ({ type: "link", label: "", page: 100 }),
};

const LABELS: Record<Block["type"], string> = {
  heading: "Heading",
  paragraph: "Paragraph",
  bullets: "Bullet list",
  keyvalue: "Label / value rows",
  table: "Table",
  divider: "Divider",
  mosaic: "Mosaic art",
  link: "Link to page",
};

const toLines = (s: string) => s.split("\n");
const csv = (s: string) => s.split(",").map((c) => c.trim());

function BlockFields({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  switch (block.type) {
    case "heading":
      return (
        <div className="flex gap-2">
          <select className={`${inputClass} w-36`} value={block.level} onChange={(e) => onChange({ ...block, level: e.target.value === "1" ? 1 : 2 })} aria-label="Heading size">
            <option value={1}>Big (double)</option>
            <option value={2}>Normal</option>
          </select>
          <input className={inputClass} value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} maxLength={120} aria-label="Heading text" />
        </div>
      );
    case "paragraph":
      return (
        <div className="flex flex-col gap-2">
          <textarea className={inputClass} rows={3} value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} aria-label="Paragraph text" />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={block.tone === "alert"} onChange={(e) => onChange({ ...block, tone: e.target.checked ? "alert" : "normal" })} />
            Show as alert (red)
          </label>
        </div>
      );
    case "bullets":
      return <textarea className={inputClass} rows={3} value={block.items.join("\n")} onChange={(e) => onChange({ ...block, items: toLines(e.target.value) })} aria-label="Bullets, one per line" placeholder="One item per line" />;
    case "keyvalue":
      return (
        <textarea
          className={inputClass}
          rows={4}
          value={block.rows.map((r) => `${r.label}: ${r.value}`).join("\n")}
          onChange={(e) =>
            onChange({
              ...block,
              rows: toLines(e.target.value).map((l) => {
                const i = l.indexOf(":");
                return i < 0 ? { label: l, value: "" } : { label: l.slice(0, i + 1).trim(), value: l.slice(i + 1).trim() };
              }),
            })
          }
          aria-label="Rows, one per line as Label: value"
          placeholder="Date: Fri 13 Nov"
        />
      );
    case "table":
      return (
        <div className="flex flex-col gap-2">
          <input className={inputClass} value={(block.header ?? []).join(", ")} onChange={(e) => onChange({ ...block, header: csv(e.target.value) })} aria-label="Column names, comma separated" />
          <textarea className={inputClass} rows={5} value={block.rows.map((r) => r.join(", ")).join("\n")} onChange={(e) => onChange({ ...block, rows: toLines(e.target.value).map(csv) })} aria-label="Rows, one per line, comma separated" />
        </div>
      );
    case "link":
      return (
        <div className="flex gap-2">
          <input className={inputClass} value={block.label} onChange={(e) => onChange({ ...block, label: e.target.value })} placeholder="Label" aria-label="Link label" />
          <input className={`${inputClass} w-24`} type="number" min={100} max={899} value={block.page} onChange={(e) => onChange({ ...block, page: Number(e.target.value) })} aria-label="Page number" />
        </div>
      );
    case "mosaic":
      return (
        <div>
          <MosaicImporter onApply={(rows) => onChange({ ...block, rows })} />
          <textarea className={`${inputClass} font-mono`} rows={4} value={block.rows.join("\n")} onChange={(e) => onChange({ ...block, rows: toLines(e.target.value) })} aria-label="Mosaic rows" />
        </div>
      );
    case "divider":
      return <p className="text-xs text-neutral-500">A blue line across the page.</p>;
  }
}

export function BlockEditor({ blocks, onChange, disabled }: { blocks: Block[]; onChange: (blocks: Block[]) => void; disabled?: boolean }) {
  const update = (i: number, b: Block) => onChange(blocks.map((x, j) => (j === i ? b : x)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    const [item] = next.splice(i, 1);
    if (item) next.splice(j, 0, item);
    onChange(next);
  };
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-3">
      {blocks.map((block, i) => (
        <div key={i} className="rounded border border-neutral-800 bg-neutral-950 p-3">
          <div className="mb-2 flex items-center justify-between font-mono text-xs text-neutral-400">
            <span>
              {i + 1}. {LABELS[block.type]}
            </span>
            <span className="flex gap-1">
              <button type="button" className="rounded px-2 hover:bg-neutral-800" onClick={() => move(i, -1)} aria-label="Move up">
                Up
              </button>
              <button type="button" className="rounded px-2 hover:bg-neutral-800" onClick={() => move(i, 1)} aria-label="Move down">
                Down
              </button>
              <button type="button" className="rounded px-2 text-red-400 hover:bg-neutral-800" onClick={() => onChange(blocks.filter((_, j) => j !== i))} aria-label="Delete block">
                Delete
              </button>
            </span>
          </div>
          <BlockFields block={block} onChange={(b) => update(i, b)} />
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(NEW_BLOCK) as Block["type"][])
          .filter((t) => t !== "mosaic")
          .map((t) => (
            <button key={t} type="button" className="rounded border border-neutral-700 px-2 py-1 font-mono text-xs hover:bg-neutral-800" onClick={() => onChange([...blocks, NEW_BLOCK[t]()])}>
              + {LABELS[t]}
            </button>
          ))}
      </div>
    </fieldset>
  );
}
