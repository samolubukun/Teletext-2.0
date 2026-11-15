"use client";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button, Card, Shell, errorMessage } from "./ui";

export function StackEditor({ orgId, stackId }: { orgId: Id<"organizations">; stackId: Id<"stacks"> }) {
  const data = useQuery(api.stacks.get, { stackId });
  const save = useMutation(api.stacks.save);
  const publish = useMutation(api.stacks.publish);
  const submissions = useQuery(api.forms.list, { stackId });
  const markDone = useMutation(api.forms.markDone);
  const [json, setJson] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Array<{ lookupId: string; pin: string; values: Record<string, string> }>>([]);
  if (data === undefined) return <Shell><p className="text-sm text-neutral-400">Loading...</p></Shell>;
  const value = json ?? JSON.stringify(data.definition, null, 2);
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
      const definition: unknown = JSON.parse(value);
      if (action === "save") {
        const result = await save({ stackId, definition, ...(rows.length > 0 ? { rows } : {}) });
        setJson(JSON.stringify(definition, null, 2));
        setMessage(`Saved version ${result.version}.`);
      } else {
        await save({ stackId, definition, ...(rows.length > 0 ? { rows } : {}) });
        await publish({ stackId });
        setJson(JSON.stringify(definition, null, 2));
        setMessage("Published. Open the public stack link to play it.");
      }
    } catch (error) {
      setMessage(error instanceof SyntaxError ? "The JSON is not valid." : errorMessage(error));
    } finally { setBusy(false); }
  };
  return <Shell crumbs={[{ href: `/dashboard/${orgId}`, label: "Organization" }, { label: data.name }]}> 
    <div className="mb-4 flex items-center justify-between gap-3"><div><h1 className="font-mono text-2xl text-yellow-300">{data.name}</h1><p className="font-mono text-xs text-neutral-400">Version {data.version} - {data.published ? "published" : "draft"}</p></div><a className="text-cyan-300 underline" href={`/stacks/${stackId}`} target="_blank" rel="noopener">Open public stack</a></div>
    <Card title="Stack definition">
      <p className="mb-3 text-xs text-neutral-400">Edit the validated JSON definition. CardScript is validated on save. Lookup rows are managed separately and are never shown here.</p>
      <div className="mb-3 rounded border border-neutral-800 p-3">
        <label className="text-sm">Lookup CSV (first column ID, second column PIN, remaining columns result fields)
          <input className="mt-2 block w-full text-xs" type="file" accept=".csv,text/csv" onChange={(e) => void importCsv(e.target.files?.[0])} />
        </label>
        {rows.length > 0 && <p className="mt-2 text-xs text-green-400">{rows.length} rows loaded. PINs are hashed on save and never sent to the reader.</p>}
      </div>
      <textarea className="min-h-[520px] w-full rounded border border-neutral-700 bg-neutral-950 p-3 font-mono text-xs" value={value} onChange={(e) => setJson(e.target.value)} spellCheck={false} aria-label="Stack JSON definition" />
      {message && <p className="mt-3 text-sm text-cyan-300" role="status">{message}</p>}
      <div className="mt-3 flex gap-2"><Button disabled={busy} onClick={() => void run("save")}>{busy ? "Working..." : "Save draft"}</Button><Button variant="green" disabled={busy} onClick={() => void run("publish")}>Save and publish</Button></div>
    </Card>
    <Card title="Inbox">
      {submissions === undefined ? <p className="text-sm text-neutral-400">Loading...</p> : submissions.length === 0 ? <p className="text-sm text-neutral-400">No submissions yet.</p> : <ul className="flex flex-col gap-2 font-mono text-xs">{submissions.map((submission) => <li key={submission.submissionId} className="rounded border border-neutral-800 p-2"><div className="flex justify-between gap-2"><span className="text-cyan-300">{submission.reference}</span><span>{submission.status}</span></div><pre className="mt-1 whitespace-pre-wrap text-neutral-300">{JSON.stringify(submission.fields, null, 2)}</pre>{submission.status === "open" && <Button variant="ghost" onClick={() => void markDone({ submissionId: submission.submissionId })}>Mark done</Button>}</li>)}</ul>}
    </Card>
  </Shell>;
}
