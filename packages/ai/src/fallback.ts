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
  if (!title) return "NOTICE";
  // Uppercasing can create a value the source never had: "MOn" -> "MON" reads as Monday (property A5, found at 10,000 runs).
  // Keep the original case when it would change which values the title contains.
  const upper = title.toUpperCase();
  return sameValues(title, upper) ? upper : title;
}

function sameValues(a: string, b: string): boolean {
  const keys = (s: string) => extractValues(s).map((v) => v.key).sort().join("|");
  return keys(a) === keys(b);
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
