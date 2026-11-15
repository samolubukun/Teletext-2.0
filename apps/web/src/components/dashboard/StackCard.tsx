"use client";
import { useHexclaveApp } from "@hexclave/next";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button, Card, errorMessage, inputClass } from "./ui";

type Template = "lookup" | "quiz" | "form" | "decision";

const DEMO_STACK = {
  version: 1 as const, id: "results-2026", title: "Exam Results Lookup", template: "lookup" as const, startCard: "home",
  tables: { results: { columns: ["student_id", "pin_hash", "name", "grade", "score"] } },
  cards: [{ id: "home", page: 412, title: "EXAM RESULTS", blocks: [{ type: "heading", level: 1, text: "EXAM RESULTS" }], fields: [{ id: "sid", label: "Student ID", type: "text", maxLength: 12 }, { id: "pin", label: "PIN", type: "secret", maxLength: 8 }], buttons: [{ key: "green", label: "Submit", script: "lookup results by student_id = sid and pin_hash = pin into row" }] }],
};

function templateDefinition(template: Template) {
  const common = { version: 1 as const, id: `${template}-draft`, title: template.toUpperCase(), template, startCard: "home", tables: {} };
  if (template === "lookup") return { ...common, tables: { results: { columns: ["lookup_id", "pin_hash", "name", "result"] } }, cards: [{ id: "home", page: 412, title: "LOOKUP", blocks: [{ type: "heading", level: 1, text: "LOOKUP" }], fields: [{ id: "lookup_id", label: "Lookup ID", type: "text" as const, maxLength: 40 }, { id: "pin", label: "PIN", type: "secret" as const, maxLength: 8 }], buttons: [{ key: "green" as const, label: "Submit", script: "lookup results by lookup_id = lookup_id and pin_hash = pin into row" }] }] };
  if (template === "form") return { ...common, cards: [{ id: "home", page: 420, title: "CONTACT FORM", blocks: [{ type: "heading", level: 1, text: "CONTACT FORM" }], fields: [{ id: "name", label: "Name", type: "text" as const, maxLength: 40 }, { id: "message", label: "Message", type: "text" as const, maxLength: 200 }], buttons: [{ key: "green" as const, label: "Submit", script: "submit form contact" }] }] };
  const label = template === "quiz" ? "QUIZ" : "DECISION HELPER";
  return { ...common, cards: [{ id: "home", page: template === "quiz" ? 430 : 440, title: label, blocks: [{ type: "heading", level: 1, text: label }], fields: [{ id: "answer", label: template === "quiz" ? "Answer" : "Choice", type: "choice" as const, maxLength: 30, options: ["Yes", "No"] }], buttons: [{ key: "green" as const, label: "Continue", script: 'show message "Your answer was recorded. Review this draft before publishing."' }] }] };
}

export function StackCard({ orgId }: { orgId: Id<"organizations"> }) {
  const enabled = process.env.NEXT_PUBLIC_STACKS_ENABLED === "true";
  const stacks = useQuery(api.stacks.list, { orgId });
  const create = useMutation(api.stacks.create);
  const hexclave = useHexclaveApp();
  const [template, setTemplate] = useState<Template>("lookup");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!enabled) return null;

  const createDraft = async (definition: unknown, name: string) => {
    const stackId = await create({ orgId, name, definition });
    setMessage("Draft created. Open Edit to review it before publishing.");
    return stackId;
  };
  const makeManual = async () => {
    setBusy(true); setError(null); setMessage(null);
    try { await createDraft(template === "lookup" ? DEMO_STACK : templateDefinition(template), `${template[0]!.toUpperCase()}${template.slice(1)} draft`); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const makeAi = async () => {
    if (description.trim().length < 10) { setError("Describe the Stack in at least 10 characters."); return; }
    setBusy(true); setError(null); setMessage(null);
    try {
      const token = await hexclave.getConvexClientAuth({})({ forceRefreshToken: false });
      if (!token) throw new Error("Please sign in again.");
      const response = await fetch("/api/ai/stack", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ orgId, description, template }) });
      const result = (await response.json()) as { stack?: unknown; error?: { message?: string }; usedFallback?: boolean };
      if (!response.ok || !result.stack) throw new Error(result.error?.message ?? "The Stack generator failed.");
      await createDraft(result.stack, "AI Stack draft");
      setMessage(result.usedFallback ? "A safe blank draft was created. Review it before publishing." : "AI draft created. Review every card and script before publishing.");
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return <Card title="Stacks (Stage 2)">
    <p className="mb-3 text-sm text-neutral-300">Create interactive teletext cards. Start manually from a template or describe the experience and let AI draft it. Nothing is published automatically.</p>
    <div className="mb-3 grid gap-2 sm:grid-cols-2">
      <label className="text-xs">Template<select className={inputClass} value={template} onChange={(e) => setTemplate(e.target.value as Template)}><option value="lookup">Lookup - results or directory</option><option value="form">Form - collect a message</option><option value="quiz">Quiz - questions and score</option><option value="decision">Decision helper - guided choices</option></select></label>
      <label className="text-xs">Describe it for AI<input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Parents enter an ID and PIN to see exam results" maxLength={4000} /></label>
    </div>
    <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void makeManual()}>{busy ? "Creating..." : "Create manual draft"}</Button><Button variant="green" disabled={busy || description.trim().length < 10} onClick={() => void makeAi()}>{busy ? "Generating..." : "Generate draft with AI"}</Button></div>
    {stacks === undefined ? <p className="mt-3 text-sm text-neutral-400">Loading...</p> : stacks.length > 0 && <ul className="mt-4 flex flex-col gap-2 font-mono text-sm">{stacks.map((s) => <li key={s.stackId} className="flex flex-wrap justify-between gap-2"><span>{s.name} {s.published ? <span className="text-green-400">published</span> : <span className="text-yellow-300">draft</span>}</span>{s.published && <Link className="text-cyan-300 underline" href={`/stacks/${s.stackId}`}>Play</Link>} <Link className="text-cyan-300 underline" href={`/dashboard/${orgId}/stacks/${s.stackId}`}>Edit</Link></li>)}</ul>}
    {message && <p className="mt-3 text-sm text-cyan-300" role="status">{message}</p>}{error && <p className="mt-2 text-sm text-red-400" role="alert">{error}</p>}
  </Card>;
}
