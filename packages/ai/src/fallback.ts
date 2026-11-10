// Extractive fallback used when the AI fails twice (ai-condenser requirement 2).
// It only copies whole source sentences, so it can never invent a value (property A5).
import type { Block } from "@teletext/core";
import { extractValues } from "./facts";

function sentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** A title made of the first words of the first line, stopping before any word with a digit. */
function titleFrom(text: string): string {
  const first = (text.split("\n").find((l) => l.trim()) ?? "").trim();
  const words: string[] = [];
  for (const w of first.split(/\s+/)) {
    if (/\d/.test(w) || [...words, w].join(" ").length > 38) break;
    words.push(w.replace(/[.!?:;,]+$/, ""));
  }
  const title = words.join(" ").trim();
  return title ? title.toUpperCase() : "NOTICE";
}

export function extractiveSummary(source: string, maxChars = 700): Block[] {
  const all = sentences(source);
  const picked: string[] = [];
  let used = 0;
  all.forEach((s, i) => {
    const important = i === 0 || extractValues(s).length > 0;
    if (important && used + s.length <= maxChars) {
      picked.push(s);
      used += s.length + 1;
    }
  });
  const blocks: Block[] = [{ type: "heading", level: 1, text: titleFrom(source) }];
  if (picked.length > 0) blocks.push({ type: "paragraph", text: picked.join(" ") });
  return blocks;
}
