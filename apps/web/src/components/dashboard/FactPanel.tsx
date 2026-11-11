"use client";
// Fact guard view: every number, date, time, amount and name in the AI draft, with the
// source sentence it came from. Values not in the source are flagged in red.
import type { FactReport, FactValue } from "@teletext/ai";

const KIND: Record<FactValue["kind"], string> = {
  phone: "phone",
  date: "date",
  time: "time",
  day: "day",
  money: "money",
  percent: "percent",
  number: "number",
  name: "name",
};

export function FactPanel({ report, onAddBack }: { report: FactReport; onAddBack: (sentence: string) => void }) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      {report.unmatched.length > 0 && (
        <div role="alert" className="rounded border border-red-600 bg-red-950/40 p-3">
          <p className="mb-2 font-bold text-red-300">
            {report.unmatched.length} value(s) are NOT in your source. Check or remove them before publishing.
          </p>
          <ul className="flex flex-wrap gap-2">
            {report.unmatched.map((v, i) => (
              <li key={i} className="rounded bg-red-600 px-2 py-0.5 font-mono text-white">
                {v.raw} <span className="text-xs opacity-80">({KIND[v.kind]})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="mb-2 font-mono text-xs uppercase text-green-400">Checked against your source ({report.matched.length})</p>
        {report.matched.length === 0 ? (
          <p className="text-neutral-500">No numbers, dates or names in the draft.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {report.matched
              .filter((p, i, all) => all.findIndex((q) => q.draft.key === p.draft.key && q.draft.raw === p.draft.raw) === i)
              .map((pair, i) => (
              <li key={i} className="rounded border border-neutral-800 p-2">
                <span className="mr-2 rounded bg-green-500 px-2 py-0.5 font-mono text-black">{pair.draft.raw}</span>
                <span className="text-neutral-400">from: &quot;{pair.source.sentence.slice(0, 160)}&quot;</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {report.dropped.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-xs uppercase text-yellow-300">In the source but not on the page ({report.dropped.length})</p>
          <ul className="flex flex-col gap-1">
            {report.dropped.slice(0, 12).map((v, i) => (
              <li key={i} className="flex items-start justify-between gap-2 rounded border border-neutral-800 p-2">
                <span>
                  <span className="mr-2 rounded bg-yellow-300 px-2 py-0.5 font-mono text-black">{v.raw}</span>
                  <span className="text-neutral-400">&quot;{v.sentence.slice(0, 140)}&quot;</span>
                </span>
                <button type="button" className="shrink-0 rounded border border-neutral-700 px-2 py-0.5 font-mono text-xs hover:bg-neutral-800" onClick={() => onAddBack(v.sentence)}>
                  Add back
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
