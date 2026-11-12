"use client";
// The public reader: type a page number, get a page. Keyboard first, touch friendly,
// works offline for pages already read (service worker in public/sw.js).
import {
  EMPTY_ENTRY,
  deserializePage,
  entry,
  entryLabel,
  pageText,
  stepSubpage,
  type EntryKey,
  type FastextColor,
  type SerializedPage,
} from "@teletext/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TeletextScreen } from "@/components/teletext/TeletextScreen";
import { invalidNumberPage, notFoundPage, offlinePage, searchPage } from "@/lib/systemPages";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type ReaderSettings } from "./settings";

type Loaded = {
  number: number;
  pages: SerializedPage[];
  isLive: boolean;
  updatedAt: number | null;
  offline: boolean;
  status: "ok" | "missing" | "offline" | "invalid" | "search";
};

const FASTEXT_KEYS: Record<string, FastextColor> = { r: "red", g: "green", y: "yellow", b: "blue" };
const LIVE_REFRESH_MS = 60_000;

function nowIso() {
  return new Date().toISOString();
}

function formatTime(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "Wed 11 Nov" and "14:32" in the reader's own time zone, like the clock on a real teletext set. */
function liveClock(d: Date): { date: string; time: string } {
  const date = `${DAY_NAMES[d.getDay()]} ${String(d.getDate()).padStart(2, "0")} ${MONTH_NAMES[d.getMonth()]}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { date, time };
}

async function fetchPage(number: number, back: number): Promise<Loaded> {
  try {
    const res = await fetch(`/api/pages/${number}`, { headers: { Accept: "application/json" } });
    const offline = res.headers.get("x-teletext-cache") === "offline";
    if (res.status === 404) return { number, pages: notFoundPage(number, back, nowIso()), isLive: false, updatedAt: null, offline, status: "missing" };
    if (res.status === 504 || res.headers.get("x-teletext-cache") === "miss-offline") {
      return { number, pages: offlinePage(number, back, nowIso()), isLive: false, updatedAt: null, offline: true, status: "offline" };
    }
    if (!res.ok) return { number, pages: notFoundPage(number, back, nowIso()), isLive: false, updatedAt: null, offline, status: "missing" };
    const data = (await res.json()) as { pages: SerializedPage[]; isLive: boolean; updatedAt: number };
    return { number, pages: data.pages, isLive: data.isLive, updatedAt: data.updatedAt, offline, status: "ok" };
  } catch {
    return { number, pages: offlinePage(number, back, nowIso()), isLive: false, updatedAt: null, offline: true, status: "offline" };
  }
}

export function Reader({ initialNumber = 100, initialSub = 1 }: { initialNumber?: number; initialSub?: number }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [sub, setSub] = useState(initialSub);
  const [typed, setTyped] = useState(EMPTY_ENTRY);
  const [history, setHistory] = useState<{ number: number; sub: number }[]>([]);
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [hold, setHold] = useState(true);
  const [changedRows, setChangedRows] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");
  const [showKeypad, setShowKeypad] = useState(false);
  const currentRef = useRef<{ number: number; sub: number }>({ number: initialNumber, sub: initialSub });
  // Set after mount so server and browser HTML match; ticks every 15 s.
  const [clock, setClock] = useState<{ date: string; time: string } | null>(null);
  useEffect(() => {
    const tick = () => setClock(liveClock(new Date()));
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    // Settings live in localStorage, so they can only be read after mount (reading earlier breaks hydration).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(loadSettings());
    setShowKeypad(window.matchMedia("(pointer: coarse)").matches);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  const updateSettings = (patch: Partial<ReaderSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });
  };

  const goTo = useCallback(async (number: number, subPage = 1, record = true) => {
    const back = currentRef.current.number;
    if (record && loaded) setHistory((h) => [...h.slice(-30), { number: currentRef.current.number, sub: currentRef.current.sub }]);
    const result = await fetchPage(number, back);
    currentRef.current = { number, sub: subPage };
    setLoaded(result);
    setSub(Math.min(Math.max(1, subPage), result.pages.length));
    setChangedRows(new Set());
    const path = subPage > 1 ? `/p/${number}/${subPage}` : number === 100 ? "/" : `/p/${number}`;
    if (window.location.pathname !== path) window.history.replaceState(null, "", path);
  }, [loaded]);

  // First load.
  useEffect(() => {
    void goTo(initialNumber, initialSub, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live pages refresh and highlight what changed (unless reduced motion).
  useEffect(() => {
    if (!loaded?.isLive) return;
    const id = window.setInterval(async () => {
      const fresh = await fetchPage(loaded.number, loaded.number);
      if (fresh.status !== "ok") return;
      const before = loaded.pages[sub - 1]?.r ?? [];
      const after = fresh.pages[sub - 1]?.r ?? [];
      const changed = new Set<number>();
      after.forEach((row, i) => {
        if (i > 0 && row !== before[i]) changed.add(i);
      });
      setLoaded(fresh);
      setChangedRows(changed);
    }, LIVE_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [loaded, sub]);

  // Optional auto-rotate of sub-pages (off by default: "Hold").
  useEffect(() => {
    if (hold || !loaded || loaded.pages.length < 2) return;
    const id = window.setInterval(() => setSub((s) => stepSubpage(s, loaded.pages.length, 1)), 12_000);
    return () => window.clearInterval(id);
  }, [hold, loaded]);

  const pressKey = useCallback(
    (key: EntryKey) => {
      const result = entry(typed, key);
      setTyped(result.state);
      if (result.go !== undefined) void goTo(result.go);
      if (result.invalid !== undefined) {
        setLoaded({ number: 100, pages: invalidNumberPage(result.invalid, currentRef.current.number, nowIso()), isLive: false, updatedAt: null, offline: false, status: "invalid" });
        setSub(1);
      }
    },
    [typed, goTo],
  );

  const page = loaded?.pages[sub - 1] ?? loaded?.pages[0];
  const total = loaded?.pages.length ?? 1;

  const fastext = useCallback(
    (color: FastextColor) => {
      const link = page?.f.find((l) => l.c === color);
      if (link) void goTo(link.p);
    },
    [page, goTo],
  );

  const goBack = useCallback(() => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    void goTo(prev.number, prev.sub, false);
  }, [history, goTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (/^[0-9]$/.test(e.key)) pressKey({ type: "digit", digit: e.key });
      else if (e.key === "Backspace") {
        if (typed.digits) pressKey({ type: "backspace" });
        else goBack();
      } else if (e.key === "Escape") pressKey({ type: "clear" });
      else if (e.key === "ArrowRight") setSub((s) => stepSubpage(s, total, 1));
      else if (e.key === "ArrowLeft") setSub((s) => stepSubpage(s, total, -1));
      else if (e.key === "ArrowUp" && loaded) void goTo(Math.min(899, loaded.number + 1));
      else if (e.key === "ArrowDown" && loaded) void goTo(Math.max(100, loaded.number - 1));
      else if (FASTEXT_KEYS[k]) fastext(FASTEXT_KEYS[k]);
      else if (k === "i") void goTo(100);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pressKey, typed, total, loaded, goTo, fastext, goBack]);

  // Swipe left/right for sub-pages.
  const touchStart = useRef<number | null>(null);

  const text = useMemo(() => (page ? pageText(deserializePage(page)) : []), [page]);
  const headline = text.slice(0, 6).join("  -  ");
  const override = typed.digits ? entryLabel(typed) : undefined;

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    // A three-digit number is a page number, not a keyword: open that page.
    if (/^\d{3}$/.test(q)) {
      const n = Number(q);
      setQuery("");
      if (n >= 100 && n <= 899) void goTo(n);
      else setLoaded({ number: 100, pages: invalidNumberPage(n, currentRef.current.number, nowIso()), isLive: false, updatedAt: null, offline: false, status: "invalid" });
      return;
    }
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { hits?: { number: number; title: string }[] };
      setLoaded({ number: 100, pages: searchPage(q, data.hits ?? [], nowIso()), isLive: false, updatedAt: null, offline: false, status: "search" });
      setSub(1);
    } catch {
      setLoaded({ number: 100, pages: offlinePage(100, currentRef.current.number, nowIso()), isLive: false, updatedAt: null, offline: true, status: "offline" });
    }
  };

  const saveRange = async () => {
    if (!loaded || !("caches" in window)) return;
    const start = Math.floor(loaded.number / 50) * 50;
    const urls = Array.from({ length: 50 }, (_, i) => `/api/pages/${start + i}`);
    await Promise.allSettled(urls.map((u) => fetch(u)));
    alert(`Saved pages ${start}-${start + 49} for offline reading.`);
  };

  const frameClass = `tt-frame ${settings.mode === "classic" ? "tt-classic" : ""}`;

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-2 py-3"
      data-palette={settings.palette}
      data-motion={settings.motion}
    >
      <h1 className="sr-only">Teletext 2.0 reader, page {loaded?.number ?? initialNumber}</h1>

      {settings.mode === "clean" && page ? (
        <article className={`rounded border border-neutral-700 bg-black p-4 ${settings.textSize === "large" ? "text-2xl" : "text-lg"}`} aria-live="polite">
          <p className="mb-3 font-mono text-sm text-cyan-300">
            P{page.n} {page.p} {total > 1 ? `${sub}/${total}` : ""}
          </p>
          {text.map((line, i) => (
            <p key={i} className="leading-relaxed text-white">
              {line.trim()}
            </p>
          ))}
        </article>
      ) : (
        <div
          className={frameClass}
          onTouchStart={(e) => (touchStart.current = e.touches[0]?.clientX ?? null)}
          onTouchEnd={(e) => {
            const start = touchStart.current;
            const end = e.changedTouches[0]?.clientX;
            if (start !== null && end !== undefined && Math.abs(end - start) > 50) setSub((s) => stepSubpage(s, total, end < start ? 1 : -1));
            touchStart.current = null;
          }}
        >
          {page ? (
            <TeletextScreen page={page} headerOverride={override} clock={clock ?? undefined} />
          ) : (
            <div className="tt-screen" aria-hidden>
              <div className="tt-row" />
            </div>
          )}
        </div>
      )}

      {/* Screen-reader layer: the same page as structured text. */}
      <section className="sr-only" aria-live="polite" aria-atomic="true">
        <h2>
          Page {page?.n} {page?.p}, {total > 1 ? `screen ${sub} of ${total}` : ""}
        </h2>
        {text.map((line, i) => (
          <p key={i}>{line.trim()}</p>
        ))}
        <ul>
          {page?.f.map((l) => (
            <li key={l.c}>
              {l.c} button: {l.l}, page {l.p}
            </li>
          ))}
        </ul>
      </section>

      {settings.mode === "ticker" && headline && (
        <div className="ticker rounded bg-blue-800 px-2 py-1 font-mono text-yellow-300" aria-hidden>
          <span>{headline}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-neutral-300">
        <span>
          {loaded?.offline ? <strong className="mr-2 rounded bg-yellow-300 px-1 text-black">OFFLINE COPY</strong> : null}
          {loaded?.isLive ? <strong className="mr-2 rounded bg-red-600 px-1 text-white">LIVE</strong> : null}
          {loaded?.updatedAt ? `Updated ${formatTime(loaded.updatedAt)}` : ""}
          {changedRows.size > 0 && settings.motion !== "reduced" ? ` - ${changedRows.size} line(s) changed` : ""}
        </span>
        {total > 1 && (
          <span className="flex items-center gap-2">
            <button className="rounded border border-neutral-600 px-2 py-1" onClick={() => setSub((s) => stepSubpage(s, total, -1))} aria-label="Previous screen">
              &lt;
            </button>
            <span aria-live="polite">
              {sub}/{total}
            </span>
            <button className="rounded border border-neutral-600 px-2 py-1" onClick={() => setSub((s) => stepSubpage(s, total, 1))} aria-label="Next screen">
              &gt;
            </button>
            <button className="rounded border border-neutral-600 px-2 py-1" onClick={() => setHold((h) => !h)} aria-pressed={hold}>
              {hold ? "Hold" : "Rotating"}
            </button>
          </span>
        )}
      </div>

      <nav className="grid grid-cols-4 gap-2" aria-label="Fastext">
        {(["red", "green", "yellow", "blue"] as const).map((color) => {
          const link = page?.f.find((l) => l.c === color);
          return (
            <button
              key={color}
              className={`fastext-${color} rounded px-1 py-3 font-mono text-sm font-bold disabled:opacity-40`}
              disabled={!link}
              onClick={() => fastext(color)}
              aria-label={link ? `${color}: ${link.l}, page ${link.p}` : `${color}: no link`}
            >
              {link ? link.l : "-"}
              <span className="sr-only"> (key {color[0]?.toUpperCase()})</span>
            </button>
          );
        })}
      </nav>

      {showKeypad && (
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Page number keypad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} className="rounded bg-neutral-800 py-3 font-mono text-xl" onClick={() => pressKey({ type: "digit", digit: d })}>
              {d}
            </button>
          ))}
          <button className="rounded bg-neutral-800 py-3 font-mono" onClick={() => (typed.digits ? pressKey({ type: "backspace" }) : goBack())}>
            Back
          </button>
          <button className="rounded bg-neutral-800 py-3 font-mono text-xl" onClick={() => pressKey({ type: "digit", digit: "0" })}>
            0
          </button>
          <button className="rounded bg-neutral-800 py-3 font-mono" onClick={() => void goTo(100)}>
            Index
          </button>
        </div>
      )}

      <form onSubmit={runSearch} className="flex gap-2" role="search">
        <label htmlFor="tt-search" className="sr-only">
          Search pages
        </label>
        <input
          id="tt-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search pages, e.g. results"
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm"
        />
        <button className="rounded bg-cyan-400 px-3 py-2 font-mono text-sm font-bold text-black">Find</button>
      </form>

      <details className="rounded border border-neutral-800 p-3 font-mono text-xs text-neutral-300">
        <summary className="cursor-pointer">Settings and help</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-2">
            Mode
            <select className="bg-neutral-900 p-1" value={settings.mode} onChange={(e) => updateSettings({ mode: e.target.value as ReaderSettings["mode"] })}>
              <option value="classic">Classic</option>
              <option value="clean">Clean (plain text)</option>
              <option value="ticker">Ticker</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            Colours
            <select className="bg-neutral-900 p-1" value={settings.palette} onChange={(e) => updateSettings({ palette: e.target.value as ReaderSettings["palette"] })}>
              <option value="normal">Standard</option>
              <option value="contrast">High contrast</option>
              <option value="cvd">Colour-blind safe</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            Motion
            <select className="bg-neutral-900 p-1" value={settings.motion} onChange={(e) => updateSettings({ motion: e.target.value as ReaderSettings["motion"] })}>
              <option value="system">Follow device</option>
              <option value="reduced">No flashing or scrolling</option>
              <option value="full">Full</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            Text size (clean mode)
            <select className="bg-neutral-900 p-1" value={settings.textSize} onChange={(e) => updateSettings({ textSize: e.target.value as ReaderSettings["textSize"] })}>
              <option value="normal">Normal</option>
              <option value="large">Large</option>
            </select>
          </label>
          <button className="rounded border border-neutral-600 px-2 py-1" onClick={() => setShowKeypad((s) => !s)}>
            {showKeypad ? "Hide keypad" : "Show keypad"}
          </button>
          <button className="rounded border border-neutral-600 px-2 py-1" onClick={() => void saveRange()}>
            Save this range for offline
          </button>
        </div>
        <p className="mt-3">
          Keys: type 3 digits for a page. Left/Right change screen. Up/Down next/previous page. R G Y B for the coloured buttons. Backspace goes back. I for the index.
        </p>
        <p className="mt-2">
          {/* Plain link on purpose: a full navigation keeps the dashboard code out of the reader bundle. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="text-cyan-300 underline" href="/dashboard">
            Publisher sign in
          </a>
        </p>
      </details>
    </div>
  );
}
