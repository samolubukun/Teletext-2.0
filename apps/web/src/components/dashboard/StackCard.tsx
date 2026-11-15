"use client";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button, Card, errorMessage } from "./ui";

const DEMO_STACK = {
  version: 1 as const,
  id: "results-2026",
  title: "Exam Results Lookup",
  template: "lookup" as const,
  startCard: "home",
  tables: { results: { columns: ["student_id", "pin_hash", "name", "grade", "score"] } },
  cards: [
    { id: "home", page: 412, title: "EXAM RESULTS", blocks: [{ type: "heading", level: 1, text: "EXAM RESULTS" }], fields: [{ id: "sid", label: "Student ID", type: "text", maxLength: 12 }, { id: "pin", label: "PIN", type: "secret", maxLength: 8 }], buttons: [{ key: "green", label: "Submit", script: "lookup results by student_id = sid and pin_hash = pin into row" }] },
  ],
};

export function StackCard({ orgId }: { orgId: Id<"organizations"> }) {
  const stacks = useQuery(api.stacks.list, { orgId });
  const create = useMutation(api.stacks.create);
  const publish = useMutation(api.stacks.publish);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const makeDemo = async () => {
    setBusy(true); setError(null);
    try {
      const stackId = await create({ orgId, name: "Exam Results Lookup", definition: DEMO_STACK, rows: [{ lookupId: "1001", pin: "1234", values: { name: "Ada Bello", grade: "A", score: "87" } }] });
      await publish({ stackId });
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  return <Card title="Stacks (Stage 2)">
    {stacks === undefined ? <p className="text-sm text-neutral-400">Loading...</p> : stacks.length === 0 ? <div><p className="mb-3 text-sm text-neutral-300">Create the demo lookup stack: parents enter a fake student ID and PIN to see a result.</p><Button disabled={busy} onClick={() => void makeDemo()}>{busy ? "Creating..." : "Create exam results lookup"}</Button></div> : <ul className="flex flex-col gap-2 font-mono text-sm">{stacks.map((s) => <li key={s.stackId} className="flex flex-wrap justify-between gap-2"><span>{s.name} {s.published ? <span className="text-green-400">published</span> : <span className="text-yellow-300">draft</span>}</span>{s.published && <Link className="text-cyan-300 underline" href={`/stacks/${s.stackId}`}>Open stack</Link>} <Link className="text-cyan-300 underline" href={`/dashboard/${orgId}/stacks/${s.stackId}`}>Edit</Link></li>)}</ul>}
    {error && <p className="mt-2 text-sm text-red-400" role="alert">{error}</p>}
  </Card>;
}
