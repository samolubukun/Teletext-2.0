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
export const MAX_ITERATIONS = 20;

const id = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/);
const field = z.object({ id, label: z.string().min(1).max(30), type: z.enum(["text", "number", "secret", "choice"]), maxLength: z.number().int().min(1).max(200), options: z.array(z.string().max(60)).max(20).optional() });
const button = z.object({ key: z.enum(["red", "green", "yellow", "blue", "digit"]), label: z.string().min(1).max(20), script: z.string().max(MAX_SCRIPT), digit: z.string().regex(/^[0-9]$/).optional() });
const table = z.object({ columns: z.array(id).min(1).max(MAX_COLUMNS) });
const card = z.object({ id, page: z.number().int().min(100).max(899), title: z.string().min(1).max(38), blocks: z.array(z.unknown()).max(30), fields: z.array(field).max(MAX_FIELDS), buttons: z.array(button).max(MAX_BUTTONS), onEnter: z.string().max(MAX_SCRIPT).optional() });
export const stackSchema = z.object({ version: z.literal(1), id, title: z.string().min(1).max(80), template: z.enum(["lookup", "quiz", "form", "decision"]), startCard: id, tables: z.record(id, table).refine((v) => Object.keys(v).length <= MAX_TABLES), cards: z.array(card).max(MAX_CARDS) });
export type Stack = z.infer<typeof stackSchema>;
export type Card = Stack["cards"][number];
export type Field = Card["fields"][number];
export type Diagnostic = { message: string; position?: number; code: string };
export type Value = string | number | boolean | null | Record<string, string> | Value[];
export type Expr = { kind: "text" | "number" | "variable" | "row" | "concat" | "add" | "subtract" | "not" | "compare" | "boolean"; value?: string | number; column?: string; left?: Expr; right?: Expr; operator?: string };
export type SimpleStatement =
  | { kind: "go"; target: { type: "card" | "page"; value: string } }
  | { kind: "set"; variable: string; value: Expr }
  | { kind: "add"; amount: number; variable: string }
  | { kind: "show"; message: string }
  | { kind: "submit"; formId: string }
  | { kind: "clear" }
  | { kind: "lookup"; table: string; conditions: { column: string; variable: string; secret: boolean }[]; into: string };
export type Statement = SimpleStatement | { kind: "if"; condition: Expr; then: Statement[]; else: Statement[] } | { kind: "forEach"; variable: string; source: string; limit: number; body: Statement[] };
export type Script = { statements: Statement[] };
const variable = /^[a-z][a-z0-9_]{0,39}$/;
const diagnostic = (message: string, position: number, code: string): Diagnostic => ({ message, position, code });

function splitOperator(s: string, operators: string[]): [string, string, string] | undefined {
  let quote = false, depth = 0;
  for (let i = s.length - 1; i >= 0; i--) { const c = s[i]!; if (c === '"' && s[i - 1] !== "\\") quote = !quote; if (quote) continue; if (c === ")") depth++; else if (c === "(") depth--; if (!depth) for (const op of operators) if (s.slice(i - op.length + 1, i + 1) === op) return [s.slice(0, i - op.length + 1), op, s.slice(i + 1)]; }
  return undefined;
}
function parseExpr(input: string): Expr | Diagnostic {
  const s = input.trim();
  if (!s) return diagnostic("Unsupported expression.", 0, "expression");
  const bool = splitOperator(s, [" or ", " and "]); if (bool) { const l = parseExpr(bool[0]); const r = parseExpr(bool[2]); if ("message" in l || "message" in r) return diagnostic("Unsupported expression.", 0, "expression"); return { kind: "boolean", left: l, right: r, operator: bool[1].trim() }; }
  const cmp = splitOperator(s, ["=", "<>", "!=", "<=", ">=", "<", ">"]); if (cmp) { const l = parseExpr(cmp[0]); const r = parseExpr(cmp[2]); if ("message" in l || "message" in r) return diagnostic("Unsupported expression.", 0, "expression"); return { kind: "compare", left: l, right: r, operator: cmp[1] }; }
  const arith = splitOperator(s, ["+", "-"]); if (arith) { const l = parseExpr(arith[0]); const r = parseExpr(arith[2]); if ("message" in l || "message" in r) return diagnostic("Unsupported expression.", 0, "expression"); return { kind: arith[1] === "+" ? "add" : "subtract", left: l, right: r }; }
  const concat = splitOperator(s, ["&"]); if (concat) { const l = parseExpr(concat[0]); const r = parseExpr(concat[2]); if ("message" in l || "message" in r) return diagnostic("Unsupported expression.", 0, "expression"); return { kind: "concat", left: l, right: r }; }
  if (/^not\s+/i.test(s)) { const e = parseExpr(s.replace(/^not\s+/i, "")); return "message" in e ? e : { kind: "not", left: e }; }
  if (/^"(?:[^"\\]|\\.)*"$/.test(s)) return { kind: "text", value: s.slice(1, -1) };
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return { kind: "number", value: Number(s) };
  const row = /^row\.([a-z][a-z0-9_-]{0,39})$/.exec(s); if (row) return { kind: "row", value: "row", column: row[1] };
  if (variable.test(s)) return { kind: "variable", value: s };
  return diagnostic("Unsupported expression.", 0, "expression");
}

export function parseCardScript(source: string): { ok: true; script: Script } | { ok: false; diagnostics: Diagnostic[] } {
  if (source.length > MAX_SCRIPT) return { ok: false, diagnostics: [diagnostic(`Scripts cannot exceed ${MAX_SCRIPT} characters.`, MAX_SCRIPT, "script_length")] };
  const lines = source.split(/\r?\n/).map((raw, i) => ({ line: raw.trim(), position: source.split(/\r?\n/).slice(0, i).reduce((n, x) => n + x.length + 1, 0) })).filter((x) => x.line);
  const parseBlock = (index: number, stop: string[]): { statements: Statement[]; index: number; stop?: string; error?: Diagnostic } => { const statements: Statement[] = []; while (index < lines.length) { const { line, position } = lines[index]!; if (stop.some((x) => new RegExp(`^${x}$`, "i").test(line))) return { statements, index, stop: line.toLowerCase() }; if (/^else$/i.test(line) || /^end if$/i.test(line) || /^end for$/i.test(line)) return { statements, index, error: diagnostic("Unexpected block terminator.", position, "block") };
      let m: RegExpExecArray | null;
      if ((m = /^if\s+(.+)$/i.exec(line))) { const condition = parseExpr(m[1]!); if ("message" in condition) return { statements, index, error: diagnostic(condition.message, position, condition.code) }; const yes = parseBlock(index + 1, ["else", "end if"]); if (yes.error) return yes; let no: { statements: Statement[]; index: number; stop?: string; error?: Diagnostic } = { statements: [], index: yes.index }; if (yes.stop === "else") no = parseBlock(yes.index + 1, ["end if"]); if (no.error || no.stop !== "end if") return { statements, index, error: diagnostic("Missing end if.", position, "block") }; statements.push({ kind: "if", condition, then: yes.statements, else: no.statements }); index = no.index + 1; continue; }
      if ((m = /^for each\s+([a-z][a-z0-9_]{0,39})\s+in\s+([a-z][a-z0-9_]{0,39})\s+limit\s+(\d+)$/i.exec(line))) { const limit = Number(m[3]); if (limit > MAX_ITERATIONS || limit < 0) return { statements, index, error: diagnostic(`Loop limit cannot exceed ${MAX_ITERATIONS}.`, position, "loop_limit") }; const body = parseBlock(index + 1, ["end for"]); if (body.error || body.stop !== "end for") return { statements, index, error: diagnostic("Missing end for.", position, "block") }; statements.push({ kind: "forEach", variable: m[1]!, source: m[2]!, limit, body: body.statements }); index = body.index + 1; continue; }
      const simple = parseSimple(line, position); if (simple.error) return { statements, index, error: simple.error }; statements.push(simple.statement!); index++; } return { statements, index } };
  const result = parseBlock(0, []); if (result.error || result.index < lines.length) return { ok: false, diagnostics: [result.error ?? diagnostic("Unexpected block terminator.", lines[result.index]!.position, "block")] }; return { ok: true, script: { statements: result.statements } };
}
function parseSimple(line: string, position: number): { statement?: SimpleStatement; error?: Diagnostic } { let m: RegExpExecArray | null; if ((m = /^go to (card|page)\s+([^\s]+)$/i.exec(line))) return { statement: { kind: "go", target: { type: m[1]!.toLowerCase() as "card" | "page", value: m[2]! } } }; if ((m = /^set\s+([a-z][a-z0-9_]{0,39})\s+to\s+(.+)$/i.exec(line))) { const value = parseExpr(m[2]!); return "message" in value ? { error: diagnostic(value.message, position, value.code) } : { statement: { kind: "set", variable: m[1]!, value } }; } if ((m = /^add\s+(-?\d+(?:\.\d+)?)\s+to\s+([a-z][a-z0-9_]{0,39})$/i.exec(line))) return { statement: { kind: "add", amount: Number(m[1]), variable: m[2]! } }; if ((m = /^submit form\s+([a-z][a-z0-9_-]{0,39})$/i.exec(line))) return { statement: { kind: "submit", formId: m[1]! } }; if ((m = /^show message\s+"((?:[^"\\]|\\.)*)"$/i.exec(line))) return { statement: { kind: "show", message: m[1]! } }; if (/^clear fields$/i.test(line)) return { statement: { kind: "clear" } }; if ((m = /^lookup\s+([a-z][a-z0-9_-]{0,39})\s+by\s+(.+)\s+into\s+([a-z][a-z0-9_]{0,39})$/i.exec(line))) { const conditions = m[2]!.split(/\s+and\s+/i).map((p) => /^([a-z][a-z0-9_-]{0,39})\s*=\s*([a-z][a-z0-9_]{0,39})$/i.exec(p.trim())).filter((x): x is RegExpExecArray => x !== null).map((x) => ({ column: x[1]!, variable: x[2]!, secret: ["pin", "pin_hash"].includes(x[1]!.toLowerCase()) })); if (!conditions.length) return { error: diagnostic("Lookup conditions must use column = variable.", position, "lookup_condition") }; return { statement: { kind: "lookup", table: m[1]!, conditions, into: m[3]! } }; } return { error: diagnostic(`Unsupported command: ${line}`, position, "command") }; }

export function validateStack(stack: Stack): Diagnostic[] { const d: Diagnostic[] = []; const ids = new Set<string>(); const pages = new Set<number>(); for (const c of stack.cards) { if (ids.has(c.id)) d.push(diagnostic(`Duplicate card id: ${c.id}`, 0, "duplicate_card")); ids.add(c.id); if (pages.has(c.page)) d.push(diagnostic(`Duplicate card page: ${c.page}`, 0, "duplicate_page")); pages.add(c.page); if (c.fields.some((f, i) => c.fields.findIndex((x) => x.id === f.id) !== i)) d.push(diagnostic(`Duplicate field on card: ${c.id}`, 0, "duplicate_field")); for (const source of [c.onEnter ?? "", ...c.buttons.map((b) => b.script)]) { const p = parseCardScript(source); if (!p.ok) d.push(...p.diagnostics); else walk(p.script.statements, (s) => { if (s.kind === "go" && s.target.type === "card" && !stack.cards.some((x) => x.id === s.target.value)) d.push(diagnostic(`Unknown card: ${s.target.value}`, 0, "target")); if (s.kind === "go" && s.target.type === "page" && !stack.cards.some((x) => x.page === Number(s.target.value))) d.push(diagnostic(`Unknown page: ${s.target.value}`, 0, "target")); if (s.kind === "lookup" && !Object.prototype.hasOwnProperty.call(stack.tables, s.table)) d.push(diagnostic(`Unknown table: ${s.table}`, 0, "table")); }); } if (!c.buttons.length && !c.fields.length) d.push(diagnostic(`Card ${c.id} has no way out.`, 0, "dead_end")); } if (!ids.has(stack.startCard)) d.push(diagnostic(`Unknown start card: ${stack.startCard}`, 0, "start_card")); return d; }
function walk(statements: Statement[], fn: (s: Statement) => void): void { for (const s of statements) { fn(s); if (s.kind === "if") { walk(s.then, fn); walk(s.else, fn); } if (s.kind === "forEach") walk(s.body, fn); } }

export type StackState = { cardId: string; variables: Record<string, Value>; fields: Record<string, string>; message?: string; error?: string };
export type StackEvent = { type: "button"; key: string } | { type: "enter" } | { type: "lookup_result"; row: Record<string, string> | null; into: string };
export type Effect = { type: "navigate"; cardId?: string; page?: number } | { type: "message"; text: string } | { type: "submit"; formId: string; fields: Record<string, string> } | { type: "clear_fields" } | { type: "lookup"; table: string; conditions: { column: string; variable: string; secret: boolean }[]; into: string };
export type RunResult = { state: StackState; effects: Effect[]; steps: number };
export function cardBlocks(stack: Stack, cardId: string): Block[] { return (stack.cards.find((c) => c.id === cardId)?.blocks ?? []) as Block[]; }
function evalExpr(e: Expr, vars: Record<string, Value>, row: Record<string, string> | undefined): Value { if (e.kind === "text" || e.kind === "number") return e.value ?? null; if (e.kind === "variable") return vars[String(e.value)] ?? null; if (e.kind === "row") return row?.[e.column ?? ""] ?? null; const l = evalExpr(e.left!, vars, row); if (e.kind === "not") return !Boolean(l); if (e.kind === "concat") return String(l ?? "") + String(evalExpr(e.right!, vars, row) ?? ""); const r = evalExpr(e.right!, vars, row); if (e.kind === "boolean") return e.operator === "and" ? Boolean(l) && Boolean(r) : Boolean(l) || Boolean(r); if (e.kind === "compare") return e.operator === "=" ? l === r : e.operator === "<>" || e.operator === "!=" ? l !== r : e.operator === ">" ? Number(l) > Number(r) : e.operator === "<" ? Number(l) < Number(r) : e.operator === ">=" ? Number(l) >= Number(r) : Number(l) <= Number(r); const n = (Number(l) + (e.kind === "subtract" ? -Number(r) : Number(r))); return Number.isFinite(n) ? n : null; }
export function run(stack: Stack, state: StackState, event: StackEvent): RunResult { const card = stack.cards.find((c) => c.id === state.cardId); if (!card) return { state: { ...state, error: "This card is not available." }, effects: [], steps: 0 }; if (event.type === "lookup_result") return { state: { ...state, variables: { ...state.variables, [event.into]: event.row } }, effects: [], steps: 1 }; const source = event.type === "enter" ? card.onEnter : card.buttons.find((b) => b.key === event.key || (b.key === "digit" && b.digit === event.key))?.script; if (!source) return { state, effects: [], steps: 0 }; const p = parseCardScript(source); if (!p.ok) return { state: { ...state, error: p.diagnostics[0]?.message ?? "Script error." }, effects: [], steps: 1 }; const next: StackState = { ...state, variables: { ...state.variables } }; const effects: Effect[] = []; let steps = 0; let row: Record<string, string> | undefined; const exec = (list: Statement[]): boolean => { for (const s of list) { if (++steps > MAX_STEPS) return false; if (s.kind === "if") { if (!exec(Boolean(evalExpr(s.condition, next.variables, row)) ? s.then : s.else)) return false; } else if (s.kind === "forEach") { const sourceValue = next.variables[s.source]; const values = Array.isArray(sourceValue) ? sourceValue : sourceValue && typeof sourceValue === "object" ? [sourceValue] : []; for (const value of values.slice(0, Math.min(s.limit, MAX_ITERATIONS))) { row = value as Record<string, string>; next.variables[s.variable] = value; if (!exec(s.body)) return false; } } else if (s.kind === "go") effects.push(s.target.type === "card" ? { type: "navigate", cardId: s.target.value } : { type: "navigate", page: Number(s.target.value) }); else if (s.kind === "set") next.variables[s.variable] = evalExpr(s.value, next.variables, row); else if (s.kind === "add") next.variables[s.variable] = Number(next.variables[s.variable] ?? 0) + s.amount; else if (s.kind === "submit") effects.push({ type: "submit", formId: s.formId, fields: { ...next.fields } }); else if (s.kind === "show") { next.message = s.message; effects.push({ type: "message", text: s.message }); } else if (s.kind === "clear") { next.fields = {}; effects.push({ type: "clear_fields" }); } else if (s.kind === "lookup") effects.push({ type: "lookup", table: s.table, conditions: s.conditions, into: s.into }); } return true; }; if (!exec(p.script.statements)) return { state: { ...next, error: "This action took too long." }, effects, steps: MAX_STEPS }; return { state: next, effects, steps }; }
