"use client";
import { useMemo, useState } from "react";
import { stackSchema, run, type Stack, type StackState } from "@teletext/stacks";
import { serializePage, render } from "@teletext/core";
import { TeletextScreen } from "@/components/teletext/TeletextScreen";

export function StackReader({ stackId, name, definition }: { stackId: string; name: string; definition: unknown }) {
  const parsed = useMemo(() => stackSchema.safeParse(definition), [definition]);
  const stack = parsed.success ? parsed.data : null;
  const first = stack?.cards.find((c) => c.id === stack.startCard);
  const [state, setState] = useState<StackState>(() => ({ cardId: stack?.startCard ?? "", variables: {}, fields: {} }));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  if (!stack || !first) return <p className="p-4 font-mono">This stack definition is invalid.</p>;
  const card = stack.cards.find((c) => c.id === state.cardId) ?? first;
  const page = serializePage(render(card.blocks as never, { number: card.page, publisher: name, now: "2026-01-01T00:00:00.000Z" }).pages[0]!);

  const press = async (key: string, scriptButton?: { script: string }) => {
    setMessage(null);
    const result = run(stack, { ...state, fields: values }, { type: "button", key });
    setState(result.state);
    const nav = result.effects.find((e) => e.type === "navigate");
    if (nav?.type === "navigate" && nav.cardId) setState((s) => ({ ...s, cardId: nav.cardId! }));
    const msg = result.effects.find((e) => e.type === "message");
    if (msg?.type === "message") setMessage(msg.text);
    const submit = result.effects.find((e) => e.type === "submit");
    if (submit?.type === "submit") {
      setBusy(true);
      try {
        const response = await fetch(`/api/stacks/${stackId}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ formId: submit.formId, fields: submit.fields }) });
        const data = (await response.json()) as { reference?: string; error?: { message?: string } };
        setMessage(data.reference ? `Submitted. Reference: ${data.reference}` : data.error?.message ?? "The form could not be sent.");
      } catch { setMessage("The form is unavailable. Try again."); }
      finally { setBusy(false); }
    }
    const lookup = result.effects.find((e) => e.type === "lookup");
    if (lookup?.type === "lookup") {
      setBusy(true);
      try {
        const response = await fetch(`/api/stacks/${stackId}/lookup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lookupId: values.sid ?? "", pin: values.pin ?? "" }) });
        const data = (await response.json()) as { ok?: boolean; values?: Record<string, string>; error?: { message?: string }; message?: string };
        if (data.ok && data.values) {
          setState((s) => ({ ...s, variables: { ...s.variables, row: data.values! } }));
          setMessage(`Result found: ${Object.entries(data.values).map(([k, v]) => `${k}: ${v}`).join(" | ")}`);
        } else setMessage(data.error?.message ?? data.message ?? "The details could not be found.");
      } catch { setMessage("Lookup is unavailable. Try again."); }
      finally { setBusy(false); }
    }
    void scriptButton;
  };

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-3 p-3">
      <h1 className="font-mono text-yellow-300">{name}</h1>
      <div className="tt-frame tt-classic"><TeletextScreen page={page} /></div>
      {card.fields.map((field) => (
        <label key={field.id} className="flex flex-col gap-1 font-mono text-sm">
          {field.label}
          <input className="rounded border border-neutral-700 bg-neutral-950 p-2" type={field.type === "secret" ? "password" : field.type === "number" ? "number" : "text"} maxLength={field.maxLength} value={values[field.id] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [field.id]: e.target.value }))} />
        </label>
      ))}
      {message && <p role="status" className="rounded border border-yellow-700 p-2 font-mono text-sm text-yellow-200">{message}</p>}
      <div className="flex flex-wrap gap-2">
        {card.buttons.map((button, index) => <button key={`${button.key}-${index}`} disabled={busy} className="rounded border border-cyan-500 px-3 py-2 font-mono text-sm text-cyan-300" onClick={() => void press(button.key, button)}>{button.label}</button>)}
      </div>
    </main>
  );
}
