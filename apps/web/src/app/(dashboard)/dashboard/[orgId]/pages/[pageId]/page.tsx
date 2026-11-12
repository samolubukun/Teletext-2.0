"use client";
// Page editor: input on the left, the exact teletext preview on the right (same render() as
// the server), validation panel, fact guard, fastext editor and publishing workflow.
import { blocksToText, factGuard } from "@teletext/ai";
import { render, serializePage, type Block, type FastextLink, type PageStatus } from "@teletext/core";
import type { CondenseResult } from "@teletext/ai";
import { useHexclaveApp, useUser } from "@hexclave/next";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../convex/_generated/dataModel";
import { BlockEditor } from "@/components/dashboard/BlockEditor";
import { DataSourceCard } from "@/components/dashboard/DataSourceCard";
import { FactPanel } from "@/components/dashboard/FactPanel";
import { ScheduleCard } from "@/components/dashboard/ScheduleCard";
import { Button, Card, Shell, StatusBadge, errorMessage, inputClass } from "@/components/dashboard/ui";
import { TeletextScreen } from "@/components/teletext/TeletextScreen";
import { TEMPLATES } from "@/lib/templates";

type Tab = "paste" | "template" | "blocks";
const COLORS = ["red", "green", "yellow", "blue"] as const;

const STATUS_ACTION: Record<PageStatus, string> = {
  draft: "Move to draft",
  review: "Send for review",
  published: "Publish",
  archived: "Archive (unpublish)",
};

export default function EditorPage() {
  useUser({ or: "redirect" });
  const { orgId, pageId } = useParams<{ orgId: string; pageId: string }>();
  const data = useQuery(api.pages.get, { pageId: pageId as Id<"pages"> });
  const save = useMutation(api.pages.save);
  const setStatus = useMutation(api.pages.setStatus);
  const setLive = useMutation(api.pages.setLive);
  const versions = useQuery(api.pages.versions, { pageId: pageId as Id<"pages"> });
  const restore = useMutation(api.pages.restore);
  const hexclave = useHexclaveApp();
  const condense = async (args: { orgId: string; source: string }): Promise<CondenseResult> => {
    const token = await hexclave.getConvexClientAuth({})({ forceRefreshToken: false });
    if (!token) throw new Error("Please sign in again.");
    const res = await fetch("/api/ai/condense", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(args),
    });
    const json = (await res.json().catch(() => null)) as (CondenseResult & { error?: { message: string } }) | null;
    if (!res.ok || !json || json.error) throw new Error(json?.error?.message ?? "The AI service failed. Try again.");
    return json;
  };

  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [fastext, setFastext] = useState<FastextLink[]>([]);
  const [tab, setTab] = useState<Tab>("paste");
  const [source, setSource] = useState("");
  const [aiSource, setAiSource] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState(TEMPLATES[0]?.id ?? "notice");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [sub, setSub] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmFacts, setConfirmFacts] = useState(false);
  const [now, setNow] = useState(() => new Date().toISOString());

  // Load the saved version once.
  useEffect(() => {
    if (data && blocks === null) {
      // One-time copy of the saved version into editable state; the guard stops any loop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBlocks(data.blocks as Block[]);
      setFastext(data.fastext);
    }
  }, [data, blocks]);

  // Keep the preview clock fresh.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date().toISOString()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const preview = useMemo(() => {
    if (!data || !blocks) return null;
    return render(blocks, {
      number: data.number,
      publisher: data.orgName,
      now,
      fastext,
      helpPage: data.helpPage,
      utcOffsetMinutes: data.utcOffsetMinutes,
      orgRange: [data.rangeStart, data.rangeEnd],
    });
  }, [data, blocks, fastext, now]);

  const facts = useMemo(() => (aiSource && blocks ? factGuard(aiSource, blocksToText(blocks)) : null), [aiSource, blocks]);
  const uncheckedFacts = facts ? facts.unmatched.length : (data?.uncheckedFacts ?? 0);

  if (data === undefined || blocks === null || !preview) {
    return (
      <Shell>
        <p className="text-sm text-neutral-400">Loading...</p>
      </Shell>
    );
  }

  const pages = preview.pages.map(serializePage);
  const shownSub = Math.min(sub, pages.length);
  const errors = preview.warnings.filter((w) => w.level === "error");
  const warnings = preview.warnings.filter((w) => w.level === "warning");

  const change = (next: Block[]) => {
    setBlocks(next);
    setDirty(true);
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage({ kind: "error", text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const onSave = () =>
    run("save", async () => {
      const r = await save({ pageId: data.pageId, blocks, fastext, uncheckedFacts });
      setDirty(false);
      setMessage({ kind: "ok", text: `Saved version ${r.version}.${data.status === "published" ? " Readers see it now." : ""}` });
    });

  const onCondense = () =>
    run("condense", async () => {
      const r = await condense({ orgId: data.orgId, source });
      setAiSource(source);
      setAiNote(r.note ?? null);
      change(r.blocks);
      setTab("blocks");
      setConfirmFacts(false);
      setMessage({ kind: "ok", text: r.usedFallback ? "AI unavailable: made a plain extract instead. Review it." : "Draft ready. Check the highlighted facts, then save." });
    });

  const onStatus = (to: PageStatus) =>
    run(to, async () => {
      if (dirty) {
        await save({ pageId: data.pageId, blocks, fastext, uncheckedFacts });
        setDirty(false);
      }
      await setStatus({ pageId: data.pageId, to, confirmFacts });
      setMessage({ kind: "ok", text: to === "published" ? `Published. Readers can type ${data.number} now.` : `Status changed to ${to}.` });
    });

  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];

  return (
    <Shell crumbs={[{ href: `/dashboard/${orgId}`, label: data.orgName }, { label: `Page ${data.number}` }]}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-2xl text-yellow-300">P{data.number}</h1>
          <StatusBadge status={data.status} />
          <span className="font-mono text-xs text-neutral-500">v{data.version}{dirty ? " - unsaved changes" : ""}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/p/${data.number}`} target="_blank" className="font-mono text-sm text-cyan-300 underline">
            Open in reader
          </Link>
          <Link href={`/dashboard/${orgId}/pages/${data.pageId}/poster`} className="font-mono text-sm text-cyan-300 underline">
            QR poster
          </Link>
          {data.canWrite && (
            <Button onClick={onSave} disabled={busy !== null || !dirty}>
              {busy === "save" ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
      </div>

      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`mb-4 rounded p-2 text-sm ${message.kind === "error" ? "bg-red-950 text-red-300" : "bg-green-950 text-green-300"}`}>
          {message.text}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* LEFT: input */}
        <div className="flex flex-col gap-4">
          <Card>
            <div className="mb-3 flex gap-2" role="tablist">
              {(
                [
                  ["paste", "Paste and condense"],
                  ["template", "Template"],
                  ["blocks", "Edit blocks"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  className={`rounded px-3 py-1 font-mono text-xs ${tab === id ? "bg-yellow-300 text-black" : "border border-neutral-700"}`}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "paste" && (
              <div className="flex flex-col gap-3">
                <label className="text-sm" htmlFor="source">
                  Paste any notice, letter or message. AI turns it into a teletext page. You review it before anything is published.
                </label>
                <textarea id="source" className={inputClass} rows={10} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Dear parents, the Term 1 reports will be ready for collection on Friday 13 November..." />
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-neutral-500">{source.length.toLocaleString()} / 20,000</span>
                  <Button onClick={onCondense} disabled={busy !== null || source.trim().length < 20 || !data.canWrite}>
                    {busy === "condense" ? "Condensing..." : "Condense with AI"}
                  </Button>
                </div>
              </div>
            )}

            {tab === "template" && template && (
              <div className="flex flex-col gap-3">
                <select className={inputClass} value={templateId} onChange={(e) => setTemplateId(e.target.value)} aria-label="Template">
                  {TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} - {t.description}
                    </option>
                  ))}
                </select>
                {template.fields.map((f) => (
                  <label key={f.key} className="text-sm">
                    {f.label}
                    {f.kind === "textarea" ? (
                      <textarea className={inputClass} rows={4} placeholder={f.placeholder} value={fields[f.key] ?? ""} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />
                    ) : (
                      <input className={inputClass} placeholder={f.placeholder} value={fields[f.key] ?? ""} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />
                    )}
                  </label>
                ))}
                <Button
                  onClick={() => {
                    change(template.build(fields));
                    setAiSource(null);
                    setTab("blocks");
                  }}
                  disabled={!data.canWrite}
                >
                  Use this template
                </Button>
              </div>
            )}

            {tab === "blocks" && <BlockEditor blocks={blocks} onChange={change} disabled={!data.canWrite} />}
          </Card>

          {facts && aiSource && (
            <Card title="Fact guard">
              {aiNote && <p className="mb-3 text-sm text-yellow-300">{aiNote}</p>}
              <FactPanel report={facts} onAddBack={(sentence) => change([...blocks, { type: "paragraph", text: sentence }])} />
            </Card>
          )}

          <Card title="Version history">
            {versions === undefined ? (
              <p className="text-sm text-neutral-400">Loading...</p>
            ) : (
              <>
                <p className="mb-2 text-xs text-neutral-400">
                  Every save is a version. Restoring copies an old version into a new one, so nothing is lost.
                  {data.status === "published" ? " This page is published: readers see a restored version straight away." : ""}
                </p>
                <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto font-mono text-xs">
                  {versions.map((v) => (
                    <li key={v.version} className="flex items-center justify-between gap-2 rounded border border-neutral-800 px-2 py-1">
                      <span>
                        <strong className={v.isCurrent ? "text-green-400" : "text-cyan-300"}>v{v.version}</strong>{" "}
                        <span className="text-neutral-400">{new Date(v.createdAt).toLocaleString()}</span>
                        {v.byMe ? <span className="text-neutral-500"> - you</span> : null}
                        {v.errorCount > 0 ? <span className="text-red-400"> - {v.errorCount} error(s)</span> : null}
                        {v.isCurrent ? <span className="text-green-400"> - current</span> : null}
                      </span>
                      {data.canWrite && !v.isCurrent && (
                        <Button
                          variant="ghost"
                          className="!px-2 !py-1 !text-xs"
                          disabled={busy !== null}
                          aria-label={`Restore version ${v.version}`}
                          onClick={() =>
                            run("restore", async () => {
                              if (dirty && !window.confirm("You have unsaved changes. Restoring will replace them. Continue?")) return;
                              const r = await restore({ pageId: data.pageId, version: v.version });
                              setBlocks(r.blocks as Block[]);
                              setFastext(r.fastext);
                              setAiSource(null);
                              setDirty(false);
                              setMessage({ kind: "ok", text: `Restored version ${v.version} as new version ${r.version}.` });
                            })
                          }
                        >
                          Restore
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card title="Fastext buttons">
            <div className="grid gap-2">
              {COLORS.map((color) => {
                const link = fastext.find((l) => l.color === color);
                const setLink = (patch: Partial<FastextLink>) => {
                  const next = COLORS.map((c) => fastext.find((l) => l.color === c) ?? { color: c, label: "", page: 100 }).map((l) => (l.color === color ? { ...l, ...patch } : l));
                  setFastext(next.filter((l) => l.label.trim()));
                  setDirty(true);
                };
                return (
                  <div key={color} className="flex items-center gap-2">
                    <span className={`fastext-${color} w-16 rounded px-2 py-1 text-center font-mono text-xs font-bold`}>{color}</span>
                    <input className={inputClass} value={link?.label ?? ""} maxLength={9} placeholder="LABEL" onChange={(e) => setLink({ label: e.target.value.toUpperCase() })} aria-label={`${color} label`} />
                    <input className={`${inputClass} w-24`} type="number" min={100} max={899} value={link?.page ?? 100} onChange={(e) => setLink({ page: Number(e.target.value) })} aria-label={`${color} page`} />
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* RIGHT: preview, validation, publishing */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          <Card title="Live preview" actions={pages.length > 1 ? <span className="font-mono text-xs">screen {shownSub}/{pages.length}</span> : undefined}>
            <div className="tt-frame tt-classic">{pages[shownSub - 1] && <TeletextScreen page={pages[shownSub - 1]!} />}</div>
            {pages.length > 1 && (
              <div className="mt-2 flex gap-2">
                {pages.map((_, i) => (
                  <button key={i} className={`rounded px-2 py-1 font-mono text-xs ${i + 1 === shownSub ? "bg-yellow-300 text-black" : "border border-neutral-700"}`} onClick={() => setSub(i + 1)}>
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 font-mono text-xs text-neutral-500">
              {JSON.stringify(pages).length.toLocaleString()} bytes for {pages.length} screen(s). Budget: 5 KB per screen.
            </p>
          </Card>

          {data.canPublish && (
            <ScheduleCard
              // Remount only when the server changes the schedule on its own (a job published, archived or failed).
              // Keying on the times themselves would remount after every save and wipe the "Schedule saved" message.
              key={`${data.status}-${data.scheduleNote ?? ""}`}
              pageId={data.pageId}
              status={data.status}
              publishAt={data.publishAt}
              expiresAt={data.expiresAt}
              scheduleNote={data.scheduleNote}
              uncheckedFacts={uncheckedFacts}
            />
          )}

          {data.canWrite && <DataSourceCard pageId={data.pageId} />}

          <Card title={`Checks (${errors.length} errors, ${warnings.length} warnings)`}>
            {preview.warnings.length === 0 ? (
              <p className="text-sm text-green-400">Everything fits. Ready to publish.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {preview.warnings.map((w, i) => (
                  <li key={i} className={`rounded border p-2 ${w.level === "error" ? "border-red-700 text-red-300" : "border-yellow-700 text-yellow-200"}`}>
                    <strong className="uppercase">{w.level}:</strong> {w.message}
                    {w.fix && <span className="block text-neutral-400">Fix: {w.fix}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {data.canPublish && (
            <Card title="Publish">
              {uncheckedFacts > 0 && (
                <label className="mb-3 flex items-start gap-2 rounded border border-red-700 p-2 text-sm text-red-200">
                  <input type="checkbox" checked={confirmFacts} onChange={(e) => setConfirmFacts(e.target.checked)} />
                  I checked the {uncheckedFacts} value(s) that are not in my source, and they are correct.
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                {data.nextStatuses.map((to) => (
                  <Button
                    key={to}
                    variant={to === "published" ? "green" : to === "archived" ? "danger" : "ghost"}
                    disabled={busy !== null || (to === "published" && (errors.length > 0 || (uncheckedFacts > 0 && !confirmFacts)))}
                    onClick={() => onStatus(to)}
                  >
                    {busy === to ? "Working..." : STATUS_ACTION[to]}
                  </Button>
                ))}
              </div>
              <label className="mt-3 flex items-center gap-2 text-xs text-neutral-400">
                <input
                  type="checkbox"
                  checked={data.isLive}
                  onChange={(e) => {
                    const isLive = e.target.checked;
                    void run("live", async () => {
                      await setLive({ pageId: data.pageId, isLive });
                    });
                  }}
                />
                Live page: readers refresh it every 60 seconds (for timetables and queues)
              </label>
            </Card>
          )}
        </div>
      </div>
    </Shell>
  );
}
