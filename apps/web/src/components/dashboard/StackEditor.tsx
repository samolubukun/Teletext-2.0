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
  const [json, setJson] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (data === undefined) return <Shell><p className="text-sm text-neutral-400">Loading...</p></Shell>;
  const value = json ?? JSON.stringify(data.definition, null, 2);
  const run = async (action: "save" | "publish") => {
    setBusy(true); setMessage(null);
    try {
      const definition: unknown = JSON.parse(value);
      if (action === "save") {
        const result = await save({ stackId, definition });
        setJson(JSON.stringify(definition, null, 2));
        setMessage(`Saved version ${result.version}.`);
      } else {
        await save({ stackId, definition });
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
      <textarea className="min-h-[520px] w-full rounded border border-neutral-700 bg-neutral-950 p-3 font-mono text-xs" value={value} onChange={(e) => setJson(e.target.value)} spellCheck={false} aria-label="Stack JSON definition" />
      {message && <p className="mt-3 text-sm text-cyan-300" role="status">{message}</p>}
      <div className="mt-3 flex gap-2"><Button disabled={busy} onClick={() => void run("save")}>{busy ? "Working..." : "Save draft"}</Button><Button variant="green" disabled={busy} onClick={() => void run("publish")}>Save and publish</Button></div>
    </Card>
  </Shell>;
}
