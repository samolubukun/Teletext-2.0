// Pure helpers shared by the visual stack editor and the stack reader. No DOM, no network, no clock.
import type { Card, Field } from "./index";

export type LookupCondition = { column: string; variable: string; secret: boolean };
export type LookupCredentials = { lookupId: string; pin: string };

/**
 * Finds the lookup ID and PIN in the reader's field values.
 * The lookup command names the fields; common names are the fallback.
 */
export function resolveLookupCredentials(values: Record<string, string>, conditions: LookupCondition[], fields: Pick<Field, "id" | "type">[]): LookupCredentials {
  const lookupIdField = conditions.find((c) => !c.secret)?.variable;
  const pinField = conditions.find((c) => c.secret)?.variable ?? fields.find((f) => f.type === "secret")?.id;
  const own = (key: string | undefined): string => (key !== undefined && Object.prototype.hasOwnProperty.call(values, key) ? values[key] ?? "" : "");
  const firstOther = Object.entries(values).find(([key, value]) => key !== pinField && value)?.[1] ?? "";
  const lookupId = own(lookupIdField) || own("sid") || own("lookup_id") || own("id") || firstOther || "";
  const pin = own(pinField) || own("pin") || own("pin_hash") || own("password") || "";
  return { lookupId, pin };
}

export type ButtonAction =
  | { kind: "goto"; cardId: string }
  | { kind: "submit"; formId: string }
  | { kind: "lookup"; table: string; idColumn: string; idField: string; pinField: string }
  | { kind: "message"; text: string }
  | { kind: "custom"; script: string };

export const ACTION_LABELS: Record<ButtonAction["kind"], string> = {
  goto: "Go to Card",
  submit: "Submit Form",
  lookup: "Lookup Row",
  message: "Show Message",
  custom: "Custom CardScript",
};

/** CardScript strings cannot contain double quotes or line breaks. */
export function sanitizeMessage(text: string): string {
  return text.replace(/"/g, "'").replace(/\\/g, "/").replace(/[\r\n]+/g, " ").trim();
}

/** Writes the CardScript for an action preset. */
export function buildScript(action: ButtonAction): string {
  switch (action.kind) {
    case "goto": return `go to card ${action.cardId}`;
    case "submit": return `submit form ${action.formId}`;
    case "lookup": return `lookup ${action.table} by ${action.idColumn} = ${action.idField} and pin_hash = ${action.pinField} into row`;
    case "message": return `show message "${sanitizeMessage(action.text)}"`;
    case "custom": return action.script;
  }
}

const NAME = "[a-z][a-z0-9_-]{0,39}";
const VAR = "[a-z][a-z0-9_]{0,39}";

/** Recognises a script written by `buildScript`. Anything else is a custom script. */
export function detectAction(script: string): ButtonAction {
  const s = script.trim();
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`^go to card\\s+(${NAME})$`, "i").exec(s))) return { kind: "goto", cardId: m[1] ?? "" };
  if ((m = new RegExp(`^submit form\\s+(${NAME})$`, "i").exec(s))) return { kind: "submit", formId: m[1] ?? "" };
  if ((m = new RegExp(`^lookup\\s+(${NAME})\\s+by\\s+(${NAME})\\s*=\\s*(${VAR})\\s+and\\s+pin_hash\\s*=\\s*(${VAR})\\s+into\\s+row$`, "i").exec(s))) return { kind: "lookup", table: m[1] ?? "", idColumn: m[2] ?? "", idField: m[3] ?? "", pinField: m[4] ?? "" };
  if ((m = /^show message\s+"([^"\\\r\n]*)"$/i.exec(s))) return { kind: "message", text: m[1] ?? "" };
  return { kind: "custom", script };
}

/** Returns an id that matches the stack id rules and is not in `taken`. */
export function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let stem = base.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^[^a-z]+/, "").replace(/-+$/, "").slice(0, 34);
  if (!stem) stem = "item";
  if (!used.has(stem)) return stem;
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** A blank card with a heading and one way out, ready to edit. */
export function blankCard(existing: Pick<Card, "id" | "page">[], backTo?: string): Card {
  const id = uniqueId("card", existing.map((c) => c.id));
  const pages = new Set(existing.map((c) => c.page));
  let page = 100;
  const highest = existing.reduce((n, c) => Math.max(n, c.page), 99);
  page = highest + 1 <= 899 ? highest + 1 : 100;
  while (pages.has(page) && page < 899) page++;
  const title = "NEW CARD";
  return {
    id, page, title,
    blocks: [{ type: "heading", level: 1, text: title }],
    fields: [],
    buttons: [{ key: "red", label: "BACK", script: backTo ? `go to card ${backTo}` : `show message "Edit this card."` }],
  };
}
