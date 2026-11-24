"use client";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { stackSchema, validateStack, type Stack } from "@teletext/stacks";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button, Card, Shell, errorMessage } from "./ui";
import { StackReader } from "@/components/stacks/StackReader";
import { StackVisualEditor } from "./StackVisualEditor";

type Mode = "visual" | "json";
type Draft = { ok: true; stack: Stack } | { ok: false; error: string };

/** Reads the JSON text without schema checks, so half-finished visual edits can still be shown. */
function parseDraft(text: string): Draft {
  try {
    const value: unknown = JSON.parse(text);
    const cards = value && typeof value === "object" ? (value as { cards?: unknown }).cards : undefined;
    if (Array.isArray(cards) && cards.every((c) => c && typeof c === "object")) {
      // Casts are for display only: every save runs stackSchema and validateStack first.
      const normal = (cards as Array<Record<string, unknown>>).map((c) => ({ ...c, blocks: c.blocks ?? [], fields: c.fields ?? [], buttons: c.buttons ?? [] }));
      return { ok: true, stack: { ...(value as object), tables: (value as { tables?: unknown }).tables ?? {}, cards: normal } as unknown as Stack };
    }
    return { ok: false, error: "The definition needs a cards list." };
  } catch {
    return { ok: false, error: "The JSON is not valid." };
  }
}

/** Drops blank choice options left over from typing, then checks the schema and the CardScript rules. */
function checkDefinition(value: unknown): { stack?: Stack; problems: string[] } {
  const parsed = stackSchema.safeParse(value);
  if (!parsed.success) return { problems: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "stack"}: ${i.message}`) };
  const stack: Stack = { ...parsed.data, cards: parsed.data.cards.map((c) => ({ ...c, fields: c.fields.map((f) => (f.options ? { ...f, options: f.options.filter((o) => o.trim()) } : f)) })) };
  const diagnostics = validateStack(stack);
  return diagnostics.length > 0 ? { problems: diagnostics.slice(0, 6).map((d) => d.message) } : { stack, problems: [] };
}

export function StackEditor({ orgId, stackId }: { orgId: Id<"organizations">; stackId: Id<"stacks"> }) {
  const data = useQuery(api.stacks.get, { stackId });
  const save = useMutation(api.stacks.save);
  const publish = useMutation(api.stacks.publish);
  const submissions = useQuery(api.forms.list, { stackId });
  const markDone = useMutation(api.forms.markDone);
  const [json, setJson] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("visual");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Array<{ lookupId: string; pin: string; values: Record<string, string> }>>([]);
  const [play, setPlay] = useState(false);
  const value = json ?? (data ? JSON.stringify(data.definition, null, 2) : "");
  const draft = useMemo(() => parseDraft(value), [value]);
  const problems = useMemo(() => {
    if (!draft.ok) return [draft.error];
    return checkDefinition(draft.stack).problems;
  }, [draft]);
  if (data === undefined) return <Shell><p className="text-sm text-neutral-400">Loading...</p></Shell>;
  const parseForPlay = (): unknown => { try { return JSON.parse(value); } catch { return data.definition; } };
  const importCsv = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const header = (lines.shift() ?? "").split(",").map((x) => x.trim());
    const imported = lines.slice(0, 500).map((line) => {
      const cells = line.split(",").map((x) => x.trim());
      const values = Object.fromEntries(header.slice(2).map((key, i) => [key, cells[i + 2] ?? ""]));
      return { lookupId: cells[0] ?? "", pin: cells[1] ?? "", values };
    }).filter((row) => row.lookupId && row.pin);
    setRows(imported);
    setMessage(`Loaded ${imported.length} lookup rows. Save the stack to hash and store them.`);
  };
  const run = async (action: "save" | "publish") => {
    setBusy(true); setMessage(null);
    try {
      const checked = checkDefinition(JSON.parse(value));
      if (!checked.stack) { setMessage(`Fix this before saving: ${checked.problems[0] ?? "the stack is invalid."}`); return; }
      const definition = checked.stack;
      const withRows = rows.length > 0 ? { rows } : {};
      if (action === "save") {
        const result = await save({ stackId, definition, ...withRows });
        setMessage(`Saved version ${result.version}.`);
      } else {
        await save({ stackId, definition, ...withRows });
        await publish({ stackId });
        setMessage("Published. Open the public stack link to play it.");
      }
      setJson(JSON.stringify(definition, null, 2));
    } catch (error) {
      setMessage(error instanceof SyntaxError ? "The JSON is not valid." : errorMessage(error));
    } finally { setBusy(false); }
  };
  const tabClass = (active: boolean) => `rounded-t border border-b-0 px-3 py-2 font-mono text-xs font-bold ${active ? "border-yellow-300 bg-neutral-900 text-yellow-300" : "border-neutral-700 text-neutral-400 hover:text-white"}`;
  const cards = draft.ok ? draft.stack.cards : [];
  return <Shell crumbs={[{ href: `/dashboard/${orgId}`, label: "Organization" }, { label: data.name }]}>
    <div className="mb-4 flex items-center justify-between gap-3"><div><h1 className="font-mono text-2xl text-yellow-300">{data.name}</h1><p className="font-mono text-xs text-neutral-400">Version {data.version} - {data.published ? "published" : "draft"}</p></div><a className="text-cyan-300 underline" href={`/stacks/${stackId}`} target="_blank" rel="noopener">Open public stack</a></div>
    <Card title="Stack definition">
      <div role="tablist" aria-label="Editor mode" className="mb-0 flex gap-1">
        <button role="tab" type="button" aria-selected={mode === "visual"} className={tabClass(mode === "visual")} onClick={() => setMode("visual")}>Visual Editor</button>
        <button role="tab" type="button" aria-selected={mode === "json"} className={tabClass(mode === "json")} onClick={() => setMode("json")}>Advanced JSON / Script</button>
      </div>
      <div className="rounded-b rounded-tr border border-neutral-700 p-3">
        <div className="mb-3 rounded border border-neutral-800 p-3">
          <label className="text-sm">Lookup CSV (first column ID, second column PIN, remaining columns result fields)
            <input className="mt-2 block w-full text-xs" type="file" accept=".csv,text/csv" onChange={(e) => void importCsv(e.target.files?.[0])} />
          </label>
          {rows.length > 0 && <p className="mt-2 text-xs text-green-400">{rows.length} rows loaded. PINs are hashed on save and never sent to the reader.</p>}
          <p className="mt-2 text-xs text-neutral-400">Saved lookup rows are never shown here. Each upload replaces the data for the new version.</p>
        </div>
        {mode === "visual" ? (
          draft.ok ? <StackVisualEditor stack={draft.stack} rows={rows} onChange={(next) => setJson(JSON.stringify(next, null, 2))} /> : <p className="text-sm text-red-400" role="alert">{draft.error} Fix it in the Advanced JSON tab.</p>
        ) : (
          <textarea className="min-h-[520px] w-full rounded border border-neutral-700 bg-neutral-950 p-3 font-mono text-xs" value={value} onChange={(e) => setJson(e.target.value)} spellCheck={false} aria-label="Stack JSON definition" />
        )}
        {problems.length > 0 && <ul className="mt-3 list-disc pl-5 text-xs text-yellow-300" aria-label="Validation problems">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
      </div>
      {message && <p className="mt-3 text-sm text-cyan-300" role="status">{message}</p>}
      <div className="mt-3 flex gap-2"><Button disabled={busy} onClick={() => void run("save")}>{busy ? "Working..." : "Save draft"}</Button><Button variant="green" disabled={busy} onClick={() => void run("publish")}>Save and publish</Button></div>
    </Card>
    <Card title="Card map">
      <div className="flex flex-wrap gap-2" aria-label="Stack card map">{draft.ok ? cards.map((card, index) => <span key={card.id} className="rounded border border-cyan-700 px-2 py-1 font-mono text-xs text-cyan-300">{index + 1}. {card.id} / {card.page} - {card.title}</span>) : <span className="text-xs text-red-400">Fix the JSON to see the card map.</span>}</div>
      <div className="mt-3"><Button variant="ghost" onClick={() => setPlay((current) => !current)}>{play ? "Close Play mode" : "Play this stack"}</Button></div>
      {play && <div className="mt-3 rounded border border-neutral-700 p-2"><StackReader stackId={stackId} name={data.name} definition={parseForPlay()} /></div>}
    </Card>
    <Card title="Inbox">
      {submissions === undefined ? <p className="text-sm text-neutral-400">Loading...</p> : submissions.length === 0 ? <p className="text-sm text-neutral-400">No submissions yet.</p> : <ul className="flex flex-col gap-2 font-mono text-xs">{submissions.map((submission) => <li key={submission.submissionId} className="rounded border border-neutral-800 p-2"><div className="flex justify-between gap-2"><span className="text-cyan-300">{submission.reference}</span><span>{submission.status}</span></div><pre className="mt-1 whitespace-pre-wrap text-neutral-300">{JSON.stringify(submission.fields, null, 2)}</pre>{submission.status === "open" && <Button variant="ghost" onClick={() => void markDone({ submissionId: submission.submissionId })}>Mark done</Button>}</li>)}</ul>}
    </Card>
  </Shell>;
}
