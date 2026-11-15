import { z } from "zod";
import type { Block } from "@teletext/core";

export const MAX_CARDS = 40;
export const MAX_FIELDS = 6;
export const MAX_BUTTONS = 4;
export const MAX_TABLES = 10;
export const MAX_ROWS = 500;
export const MAX_COLUMNS = 12;
export const MAX_SCRIPT = 600;
export const MAX_STEPS = 200;

const id = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/);
const page = z.number().int().min(100).max(899);
const text = z.string().max(20_000);
const field = z.object({ id, label: z.string().min(1).max(30), type: z.enum(["text", "number", "secret", "choice"]), maxLength: z.number().int().min(1).max(200), options: z.array(z.string().max(60)).max(20).optional() });
const button = z.object({ key: z.enum(["red", "green", "yellow", "blue", "digit"]), label: z.string().min(1).max(20), script: z.string().max(MAX_SCRIPT), digit: z.string().regex(/^[0-9]$/).optional() });
const table = z.object({ columns: z.array(id).min(1).max(MAX_COLUMNS) });
const card = z.object({ id, page, title: z.string().min(1).max(38), blocks: z.array(z.unknown()).max(30), fields: z.array(field).max(MAX_FIELDS), buttons: z.array(button).max(MAX_BUTTONS), onEnter: z.string().max(MAX_SCRIPT).optional() });

export const stackSchema = z.object({ version: z.literal(1), id, title: z.string().min(1).max(80), template: z.enum(["lookup", "quiz", "form", "decision"]), startCard: id, tables: z.record(id, table).refine((v) => Object.keys(v).length <= MAX_TABLES), cards: z.array(card).max(MAX_CARDS) });
export type Stack = z.infer<typeof stackSchema>;
export type Card = Stack["cards"][number];
export type Field = Card["fields"][number];
export type Diagnostic = { message: string; position?: number; code: string };

export type Expr = { kind: "text" | "number" | "variable" | "row"; value: string | number; column?: string };
export type Statement =
  | { kind: "go"; target: { type: "card" | "page"; value: string } }
  | { kind: "set"; variable: string; value: Expr }
  | { kind: "add"; amount: number; variable: string }
  | { kind: "show"; message: string }
  | { kind: "submit"; formId: string }
  | { kind: "clear" }
  | { kind: "lookup"; table: string; conditions: { column: string; variable: string; secret: boolean }[]; into: string };
export type Script = { statements: Statement[] };

const variable = /^[a-z][a-z0-9_]{0,39}$/;
const expr = (s: string): Expr | Diagnostic => {
  const value = s.trim();
  if (/^"(?:[^"\\]|\\.)*"$/.test(value)) return { kind: "text", value: value.slice(1, -1) };
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return { kind: "number", value: Number(value) };
  if (variable.test(value)) return { kind: "variable", value };
  const row = /^row\.([a-z][a-z0-9_-]{0,39})$/.exec(value);
  if (row) return { kind: "row", value: "row", column: row[1] };
  return { message: "Unsupported expression.", position: 0, code: "expression" };
};

function diag(message: string, position: number, code: string): Diagnostic { return { message, position, code }; }

/** Parses the safe, intentionally small first CardScript subset. */
export function parseCardScript(source: string): { ok: true; script: Script } | { ok: false; diagnostics: Diagnostic[] } {
  if (source.length > MAX_SCRIPT) return { ok: false, diagnostics: [diag(`Scripts cannot exceed ${MAX_SCRIPT} characters.`, MAX_SCRIPT, "script_length")] };
  const statements: Statement[] = [];
  const lines = source.split(/\r?\n/);
  let position = 0;
  for (const raw of lines) {
    const line = raw.trim();
    const at = position + raw.indexOf(line);
    position += raw.length + 1;
    if (!line) continue;
    let m: RegExpExecArray | null;
    if ((m = /^go to (card|page)\s+([^\s]+)$/i.exec(line))) statements.push({ kind: "go", target: { type: m[1]!.toLowerCase() as "card" | "page", value: m[2]! } });
    else if ((m = /^set\s+([a-z][a-z0-9_]{0,39})\s+to\s+(.+)$/i.exec(line))) {
      const value = expr(m[2]!);
      if ("message" in value) return { ok: false, diagnostics: [diag(value.message, at, value.code)] };
      statements.push({ kind: "set", variable: m[1]!, value });
    } else if ((m = /^add\s+(-?\d+(?:\.\d+)?)\s+to\s+([a-z][a-z0-9_]{0,39})$/i.exec(line))) statements.push({ kind: "add", amount: Number(m[1]), variable: m[2]! });
    else if ((m = /^submit form\s+([a-z][a-z0-9_-]{0,39})$/i.exec(line))) statements.push({ kind: "submit", formId: m[1]! });
    else if ((m = /^show message\s+"((?:[^"\\]|\\.)*)"$/i.exec(line))) statements.push({ kind: "show", message: m[1]! });
    else if (/^clear fields$/i.test(line)) statements.push({ kind: "clear" });
    else if ((m = /^lookup\s+([a-z][a-z0-9_-]{0,39})\s+by\s+(.+)\s+into\s+([a-z][a-z0-9_]{0,39})$/i.exec(line))) {
      const conditions = m[2]!.split(/\s+and\s+/i).map((part) => {
        const pair = /^([a-z][a-z0-9_-]{0,39})\s*=\s*([a-z][a-z0-9_]{0,39})$/i.exec(part.trim());
        return pair ? { column: pair[1]!, variable: pair[2]!, secret: pair[1]!.toLowerCase() === "pin" || pair[1]!.toLowerCase() === "pin_hash" } : null;
      });
      if (conditions.some((c) => c === null)) return { ok: false, diagnostics: [diag("Lookup conditions must use column = variable.", at, "lookup_condition")] };
      statements.push({ kind: "lookup", table: m[1]!, conditions: conditions as { column: string; variable: string; secret: boolean }[], into: m[3]! });
    } else return { ok: false, diagnostics: [diag(`Unsupported command: ${line}`, at, "command")] };
  }
  return { ok: true, script: { statements } };
}

export function validateStack(stack: Stack): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const cardIds = new Set<string>();
  const pages = new Set<number>();
  for (const c of stack.cards) {
    if (cardIds.has(c.id)) diagnostics.push(diag(`Duplicate card id: ${c.id}`, 0, "duplicate_card"));
    cardIds.add(c.id);
    if (pages.has(c.page)) diagnostics.push(diag(`Duplicate card page: ${c.page}`, 0, "duplicate_page"));
    pages.add(c.page);
    if (c.fields.some((f, i) => c.fields.findIndex((x) => x.id === f.id) !== i)) diagnostics.push(diag(`Duplicate field on card: ${c.id}`, 0, "duplicate_field"));
    for (const source of [c.onEnter ?? "", ...c.buttons.map((b) => b.script)]) {
      const parsed = parseCardScript(source);
      if (!parsed.ok) diagnostics.push(...parsed.diagnostics);
      else for (const statement of parsed.script.statements) {
        if (statement.kind === "go" && statement.target.type === "card" && !cardIds.has(statement.target.value) && !stack.cards.some((x) => x.id === statement.target.value)) diagnostics.push(diag(`Unknown card: ${statement.target.value}`, 0, "target"));
        if (statement.kind === "go" && statement.target.type === "page" && !pages.has(Number(statement.target.value)) && !stack.cards.some((x) => x.page === Number(statement.target.value))) diagnostics.push(diag(`Unknown page: ${statement.target.value}`, 0, "target"));
        if (statement.kind === "lookup" && !Object.prototype.hasOwnProperty.call(stack.tables, statement.table)) diagnostics.push(diag(`Unknown table: ${statement.table}`, 0, "table"));
      }
    }
    if (c.buttons.length === 0 && c.fields.length === 0) diagnostics.push(diag(`Card ${c.id} has no way out.`, 0, "dead_end"));
  }
  if (!cardIds.has(stack.startCard)) diagnostics.push(diag(`Unknown start card: ${stack.startCard}`, 0, "start_card"));
  return diagnostics;
}

export type StackState = { cardId: string; variables: Record<string, string | number | boolean | null | Record<string, string> >; fields: Record<string, string>; message?: string; error?: string };
export type StackEvent = { type: "button"; key: string } | { type: "enter" } | { type: "lookup_result"; row: Record<string, string> | null; into: string };
export type Effect =
  | { type: "navigate"; cardId?: string; page?: number }
  | { type: "message"; text: string }
  | { type: "submit"; formId: string; fields: Record<string, string> }
  | { type: "clear_fields" }
  | { type: "lookup"; table: string; conditions: { column: string; variable: string; secret: boolean }[]; into: string };
export type RunResult = { state: StackState; effects: Effect[]; steps: number };

export function cardBlocks(stack: Stack, cardId: string): Block[] {
  return (stack.cards.find((c) => c.id === cardId)?.blocks ?? []) as Block[];
}

/** Pure interpreter. Unsupported event/script/runtime failures become a clean error state. */
export function run(stack: Stack, state: StackState, event: StackEvent): RunResult {
  const card = stack.cards.find((c) => c.id === state.cardId);
  if (!card) return { state: { ...state, error: "This card is not available." }, effects: [], steps: 0 };
  const source = event.type === "enter" ? card.onEnter : event.type === "button" ? card.buttons.find((b) => b.key === event.key || (b.key === "digit" && b.digit === event.key))?.script : undefined;
  if (event.type === "lookup_result") return { state: { ...state, variables: { ...state.variables, [event.into]: event.row } }, effects: [], steps: 1 };
  if (!source) return { state, effects: [], steps: 0 };
  const parsed = parseCardScript(source);
  if (!parsed.ok) return { state: { ...state, error: parsed.diagnostics[0]?.message ?? "Script error." }, effects: [], steps: 1 };
  let next = { ...state, variables: { ...state.variables } };
  const effects: Effect[] = [];
  for (const statement of parsed.script.statements) {
    if (effects.length + 1 > MAX_STEPS) return { state: { ...next, error: "This action took too long." }, effects, steps: MAX_STEPS };
    if (statement.kind === "go") effects.push(statement.target.type === "card" ? { type: "navigate", cardId: statement.target.value } : { type: "navigate", page: Number(statement.target.value) });
    else if (statement.kind === "set") next.variables[statement.variable] = statement.value.kind === "variable" ? next.variables[String(statement.value.value)] ?? null : statement.value.value as string | number;
    else if (statement.kind === "add") next.variables[statement.variable] = Number(next.variables[statement.variable] ?? 0) + statement.amount;
    else if (statement.kind === "submit") effects.push({ type: "submit", formId: statement.formId, fields: { ...next.fields } });
    else if (statement.kind === "show") { next.message = statement.message; effects.push({ type: "message", text: statement.message }); }
    else if (statement.kind === "clear") { next.fields = {}; effects.push({ type: "clear_fields" }); }
    else if (statement.kind === "lookup") effects.push({ type: "lookup", table: statement.table, conditions: statement.conditions, into: statement.into });
  }
  return { state: next, effects, steps: parsed.script.statements.length };
}
