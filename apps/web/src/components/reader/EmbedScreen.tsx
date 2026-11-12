"use client";
import { pageText, deserializePage, stepSubpage, type SerializedPage } from "@teletext/core";
import { useEffect, useMemo, useState } from "react";
import { TeletextScreen } from "@/components/teletext/TeletextScreen";

type State = { kind: "loading" } | { kind: "missing" } | { kind: "ok"; pages: SerializedPage[] };

/** One page in a frame. Refreshes every 60 s so a live page stays current on the host site. */
export function EmbedScreen({ number }: { number: number }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [sub, setSub] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/pages/${number}`, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error("missing");
        const data = (await res.json()) as { pages: SerializedPage[] };
        if (!cancelled) setState({ kind: "ok", pages: data.pages });
      } catch {
        if (!cancelled) setState((s) => (s.kind === "ok" ? s : { kind: "missing" }));
      }
    };
    void load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [number]);

  const pages = state.kind === "ok" ? state.pages : null;
  const page = pages?.[Math.min(sub, pages.length) - 1];
  const text = useMemo(() => (page ? pageText(deserializePage(page)).join(" ") : ""), [page]);

  if (state.kind === "loading") return <p className="p-3 font-mono text-sm text-neutral-400">Loading page {number}...</p>;
  if (!pages || !page) return <p className="p-3 font-mono text-sm">Page {number} is not available.</p>;

  return (
    <div className="flex flex-col gap-2">
      <TeletextScreen page={page} ariaHidden />
      <p className="sr-only">{text}</p>
      <div className="flex items-center justify-between gap-2 font-mono text-xs">
        {pages.length > 1 ? (
          <button className="rounded border border-neutral-600 px-2 py-1" onClick={() => setSub((s) => stepSubpage(s, pages.length, 1))}>
            Next screen ({Math.min(sub, pages.length)}/{pages.length})
          </button>
        ) : (
          <span />
        )}
        {/* Opens in the parent window's new tab: the full reader has navigation, search and offline mode. */}
        <a className="text-cyan-300 underline" href={`/p/${number}`} target="_blank" rel="noopener">
          Open in the full reader
        </a>
      </div>
    </div>
  );
}
