"use client";
import { useState } from "react";
import { ACTION_LABELS, MAX_BUTTONS, MAX_FIELDS, blankCard, buildScript, detectAction, uniqueId, type ButtonAction, type Card as StackCard, type Field, type Stack } from "@teletext/stacks";
import { Button, inputClass } from "./ui";

export type LookupPreviewRow = { lookupId: string; pin: string; values: Record<string, string> };
type StackButton = StackCard["buttons"][number];

const COLORS: StackButton["key"][] = ["red", "green", "yellow", "blue", "digit"];
const COLOR_CLASS: Record<StackButton["key"], string> = { red: "text-red-400", green: "text-green-400", yellow: "text-yellow-300", blue: "text-blue-400", digit: "text-white" };
const COLOR_LABEL: Record<StackButton["key"], string> = { red: "Red", green: "Green", yellow: "Yellow", blue: "Blue", digit: "Digit" };
const FIELD_TYPES: Array<{ value: Field["type"]; label: string }> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "secret", label: "Secret (PIN / password)" },
  { value: "choice", label: "Choice (pick from a list)" },
];
const small = "text-xs text-neutral-400";

function Labeled({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`flex flex-col gap-1 ${small} ${className}`}>{label}{children}</label>;
}

function defaultAction(kind: ButtonAction["kind"], stack: Stack, card: StackCard, current: string): ButtonAction {
  switch (kind) {
    case "goto": return { kind, cardId: stack.cards.find((c) => c.id !== card.id)?.id ?? card.id };
    case "submit": return { kind, formId: card.id };
    case "lookup": return { kind, table: Object.keys(stack.tables)[0] ?? "results", idColumn: "student_id", idField: card.fields.find((f) => f.type !== "secret")?.id ?? "sid", pinField: card.fields.find((f) => f.type === "secret")?.id ?? "pin" };
    case "message": return { kind, text: "Thank you." };
    case "custom": return { kind, script: current };
  }
}

export function StackVisualEditor({ stack, onChange, rows }: { stack: Stack; onChange: (next: Stack) => void; rows: LookupPreviewRow[] }) {
  const cards = stack.cards ?? [];
  const [activeId, setActiveId] = useState<string>(stack.startCard);
  const [customKeys, setCustomKeys] = useState<Set<string>>(new Set());
  const card = cards.find((c) => c.id === activeId) ?? cards[0];

  const patchCard = (patch: Partial<StackCard>) => { if (card) onChange({ ...stack, cards: cards.map((c) => (c.id === card.id ? { ...c, ...patch } : c)) }); };
  const addCard = () => {
    const next = blankCard(cards, card?.id);
    onChange({ ...stack, cards: [...cards, next], startCard: stack.startCard || next.id });
    setActiveId(next.id);
  };
  const removeCard = () => {
    if (!card || cards.length < 2) return;
    const rest = cards.filter((c) => c.id !== card.id);
    onChange({ ...stack, cards: rest, startCard: stack.startCard === card.id ? rest[0]?.id ?? "" : stack.startCard });
    setActiveId(rest[0]?.id ?? "");
  };
  const setTitle = (title: string) => {
    if (!card) return;
    const blocks = card.blocks.map((b, i) => {
      const block = b as { type?: string; text?: string };
      return i === 0 && block.type === "heading" && block.text === card.title ? { ...block, text: title } : b;
    });
    patchCard({ title, blocks });
  };
  const patchField = (index: number, patch: Partial<Field>) => patchCard({ fields: card?.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)) ?? [] });
  const patchButton = (index: number, patch: Partial<StackButton>) => patchCard({ buttons: card?.buttons.map((b, i) => (i === index ? { ...b, ...patch } : b)) ?? [] });
  const setAction = (index: number, action: ButtonAction) => {
    if (!card) return;
    const script = buildScript(action);
    patchButton(index, { script });
    if (action.kind === "lookup" && !stack.tables[action.table]) {
      onChange({ ...stack, tables: { ...stack.tables, [action.table]: { columns: ["student_id", "pin_hash"] } }, cards: cards.map((c) => (c.id === card.id ? { ...c, buttons: c.buttons.map((b, i) => (i === index ? { ...b, script } : b)) } : c)) });
    }
  };
  const chooseKind = (index: number, kind: ButtonAction["kind"]) => {
    if (!card) return;
    const key = `${card.id}:${index}`;
    const next = new Set(customKeys);
    if (kind === "custom") next.add(key); else next.delete(key);
    setCustomKeys(next);
    setAction(index, defaultAction(kind, stack, card, card.buttons[index]?.script ?? ""));
  };

  const previewRows = rows.slice(0, 5);
  const valueColumns = Array.from(new Set(previewRows.flatMap((r) => Object.keys(r.values))));

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Deck overview">
        <div className="mb-2 flex items-center justify-between"><h3 className="font-mono text-xs font-bold uppercase text-cyan-300">Cards ({cards.length})</h3><Button variant="ghost" onClick={addCard} disabled={cards.length >= 40}>+ Add card</Button></div>
        <ul className="flex flex-wrap gap-2">
          {cards.map((c) => (
            <li key={c.id}>
              <button type="button" aria-pressed={c.id === card?.id} onClick={() => setActiveId(c.id)} className={`rounded border px-3 py-2 text-left font-mono text-xs ${c.id === card?.id ? "border-yellow-300 bg-neutral-800" : "border-neutral-700 hover:bg-neutral-900"}`}>
                <span className="block text-cyan-300">{c.title || "(untitled)"}{c.id === stack.startCard ? " *" : ""}</span>
                <span className="block text-neutral-400">Page {c.page} / {c.fields.length} fields / {c.buttons.length} buttons</span>
              </button>
            </li>
          ))}
        </ul>
        <p className={`mt-1 ${small}`}>* marks the start card.</p>
      </section>

      {card ? (
        <>
          <section aria-label="Card properties" className="rounded border border-neutral-800 p-3">
            <h3 className="mb-2 font-mono text-xs font-bold uppercase text-cyan-300">Card properties</h3>
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
              <Labeled label="Title (max 38 characters)"><input className={inputClass} maxLength={38} value={card.title} onChange={(e) => setTitle(e.target.value.toUpperCase())} /></Labeled>
              <Labeled label="Page number (100-899)"><input className={inputClass} type="number" min={100} max={899} value={card.page} onChange={(e) => patchCard({ page: Number(e.target.value) })} /></Labeled>
            </div>
            <Labeled label="On enter script (optional CardScript, runs when the reader arrives on this card. An if needs an else line, then end if.)" className="mt-3"><textarea className={`${inputClass} min-h-16 text-xs`} maxLength={600} spellCheck={false} value={card.onEnter ?? ""} onChange={(e) => patchCard({ onEnter: e.target.value || undefined })} /></Labeled>
            <div className="mt-3 flex flex-wrap gap-2">
              {stack.startCard !== card.id && <Button variant="ghost" onClick={() => onChange({ ...stack, startCard: card.id })}>Make start card</Button>}
              {cards.length > 1 && <Button variant="danger" onClick={removeCard}>Remove card</Button>}
            </div>
          </section>

          <section aria-label="Form fields" className="rounded border border-neutral-800 p-3">
            <div className="mb-2 flex items-center justify-between"><h3 className="font-mono text-xs font-bold uppercase text-cyan-300">Form fields ({card.fields.length}/{MAX_FIELDS})</h3><Button variant="ghost" disabled={card.fields.length >= MAX_FIELDS} onClick={() => patchCard({ fields: [...card.fields, { id: uniqueId("field", card.fields.map((f) => f.id)), label: "New field", type: "text", maxLength: 40 }] })}>+ Add field</Button></div>
            {card.fields.length === 0 && <p className={small}>No fields on this card.</p>}
            <ul className="flex flex-col gap-3">
              {card.fields.map((field, index) => (
                <li key={index} className="rounded border border-neutral-800 p-2">
                  <div className="grid gap-2 sm:grid-cols-4">
                    <Labeled label="Label"><input className={inputClass} maxLength={30} value={field.label} onChange={(e) => patchField(index, { label: e.target.value })} /></Labeled>
                    <Labeled label="Field ID"><input className={inputClass} value={field.id} onChange={(e) => patchField(index, { id: e.target.value })} /></Labeled>
                    <Labeled label="Type"><select className={inputClass} value={field.type} onChange={(e) => patchField(index, { type: e.target.value as Field["type"] })}>{FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Labeled>
                    <Labeled label="Max length"><input className={inputClass} type="number" min={1} max={200} value={field.maxLength} onChange={(e) => patchField(index, { maxLength: Number(e.target.value) })} /></Labeled>
                  </div>
                  {field.type === "choice" && <Labeled label="Choices (one per line)" className="mt-2"><textarea className={`${inputClass} min-h-20 text-xs`} value={(field.options ?? []).join("\n")} onChange={(e) => patchField(index, { options: e.target.value.split("\n") })} /></Labeled>}
                  <div className="mt-2"><Button variant="ghost" onClick={() => patchCard({ fields: card.fields.filter((_, i) => i !== index) })}>Remove field</Button></div>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Action buttons" className="rounded border border-neutral-800 p-3">
            <div className="mb-2 flex items-center justify-between"><h3 className="font-mono text-xs font-bold uppercase text-cyan-300">Action buttons ({card.buttons.length}/{MAX_BUTTONS})</h3><Button variant="ghost" disabled={card.buttons.length >= MAX_BUTTONS} onClick={() => patchCard({ buttons: [...card.buttons, { key: COLORS.find((k) => !card.buttons.some((b) => b.key === k)) ?? "digit", label: "BUTTON", script: 'show message "Edit this button."' }] })}>+ Add button</Button></div>
            {card.buttons.length === 0 && <p className={small}>No buttons. A card needs a field or a button.</p>}
            <ul className="flex flex-col gap-3">
              {card.buttons.map((button, index) => {
                const kind = customKeys.has(`${card.id}:${index}`) ? "custom" : detectAction(button.script).kind;
                const action = kind === "custom" ? { kind: "custom" as const, script: button.script } : detectAction(button.script);
                return (
                  <li key={index} className="rounded border border-neutral-800 p-2">
                    <div className="grid gap-2 sm:grid-cols-4">
                      <Labeled label="Button"><select className={`${inputClass} ${COLOR_CLASS[button.key]}`} value={button.key} onChange={(e) => patchButton(index, { key: e.target.value as StackButton["key"] })}>{COLORS.map((k) => <option key={k} value={k}>{COLOR_LABEL[k]}</option>)}</select></Labeled>
                      {button.key === "digit" && <Labeled label="Digit (0-9)"><input className={inputClass} maxLength={1} value={button.digit ?? ""} onChange={(e) => patchButton(index, { digit: e.target.value || undefined })} /></Labeled>}
                      <Labeled label="Label (max 20)"><input className={inputClass} maxLength={20} value={button.label} onChange={(e) => patchButton(index, { label: e.target.value })} /></Labeled>
                      <Labeled label="What it does"><select className={inputClass} value={kind} onChange={(e) => chooseKind(index, e.target.value as ButtonAction["kind"])}>{(Object.keys(ACTION_LABELS) as ButtonAction["kind"][]).map((k) => <option key={k} value={k}>{ACTION_LABELS[k]}</option>)}</select></Labeled>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-4">
                      {action.kind === "goto" && <Labeled label="Target card"><select className={inputClass} value={action.cardId} onChange={(e) => setAction(index, { kind: "goto", cardId: e.target.value })}>{cards.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.id})</option>)}</select></Labeled>}
                      {action.kind === "submit" && <Labeled label="Form name"><input className={inputClass} value={action.formId} onChange={(e) => setAction(index, { kind: "submit", formId: e.target.value })} /></Labeled>}
                      {action.kind === "lookup" && (
                        <>
                          <Labeled label="Table"><input className={inputClass} value={action.table} onChange={(e) => setAction(index, { ...action, table: e.target.value })} /></Labeled>
                          <Labeled label="ID column"><input className={inputClass} value={action.idColumn} onChange={(e) => setAction(index, { ...action, idColumn: e.target.value })} /></Labeled>
                          <Labeled label="ID field"><select className={inputClass} value={action.idField} onChange={(e) => setAction(index, { ...action, idField: e.target.value })}>{card.fields.map((f) => <option key={f.id} value={f.id}>{f.label} ({f.id})</option>)}{!card.fields.some((f) => f.id === action.idField) && <option value={action.idField}>{action.idField}</option>}</select></Labeled>
                          <Labeled label="PIN field"><select className={inputClass} value={action.pinField} onChange={(e) => setAction(index, { ...action, pinField: e.target.value })}>{card.fields.map((f) => <option key={f.id} value={f.id}>{f.label} ({f.id})</option>)}{!card.fields.some((f) => f.id === action.pinField) && <option value={action.pinField}>{action.pinField}</option>}</select></Labeled>
                        </>
                      )}
                      {action.kind === "message" && <Labeled label="Message" className="sm:col-span-3"><input className={inputClass} value={action.text} onChange={(e) => setAction(index, { kind: "message", text: e.target.value })} /></Labeled>}
                      {action.kind === "custom" && <Labeled label="CardScript (an if needs an else line, then end if. Leave the else empty if you need nothing there.)" className="sm:col-span-4"><textarea className={`${inputClass} min-h-20 text-xs`} maxLength={600} spellCheck={false} value={button.script} onChange={(e) => patchButton(index, { script: e.target.value })} /></Labeled>}
                    </div>
                    {action.kind !== "custom" && <p className="mt-2 font-mono text-xs text-neutral-500">Script: {button.script}</p>}
                    <div className="mt-2"><Button variant="ghost" onClick={() => patchCard({ buttons: card.buttons.filter((_, i) => i !== index) })}>Remove button</Button></div>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      ) : <p className="text-sm text-neutral-400">This stack has no cards yet. Add one to start.</p>}

      {rows.length > 0 && (
        <section aria-label="Lookup rows preview" className="rounded border border-neutral-800 p-3">
          <h3 className="mb-2 font-mono text-xs font-bold uppercase text-cyan-300">Lookup preview (first {previewRows.length} of {rows.length} rows)</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-mono text-xs">
              <thead><tr className="text-left text-yellow-300"><th className="p-1">Lookup ID</th><th className="p-1">PIN</th>{valueColumns.map((c) => <th key={c} className="p-1">{c}</th>)}</tr></thead>
              <tbody>{previewRows.map((row, i) => <tr key={i} className="border-t border-neutral-800"><td className="p-1">{row.lookupId}</td><td className="p-1 text-neutral-500">{"*".repeat(Math.min(row.pin.length, 8))}</td>{valueColumns.map((c) => <td key={c} className="p-1">{row.values[c] ?? ""}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <p className={`mt-2 ${small}`}>PINs are hashed when you save and are never shown again.</p>
        </section>
      )}
    </div>
  );
}
