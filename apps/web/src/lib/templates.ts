// Page templates (publisher-dashboard requirement 6): each template is a set of fields that
// produces renderer blocks.
import type { Block } from "@teletext/core";

export type TemplateField = { key: string; label: string; kind: "text" | "textarea"; placeholder?: string; help?: string };
export type Template = { id: string; name: string; description: string; fields: TemplateField[]; build: (v: Record<string, string>) => Block[] };

const lines = (s: string | undefined) => (s ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
const pairs = (s: string | undefined) =>
  lines(s).map((l) => {
    const [label, ...rest] = l.split(/\s*[:|]\s*/);
    return { label: (label ?? "").trim(), value: rest.join(": ").trim() };
  });
const title = (s: string | undefined, fallback: string) => (s?.trim() || fallback).toUpperCase().slice(0, 38);

export const TEMPLATES: Template[] = [
  {
    id: "notice",
    name: "Notice",
    description: "A short announcement with key details.",
    fields: [
      { key: "title", label: "Headline", kind: "text", placeholder: "TERM 1 EXAM RESULTS" },
      { key: "body", label: "Main message", kind: "textarea", placeholder: "Results are now available." },
      { key: "details", label: "Details (one per line, Label: value)", kind: "textarea", placeholder: "Collect reports: Fri 13 Nov\nTime: 09:00 - 15:00\nPlace: Main hall" },
      { key: "contact", label: "Contact line", kind: "text", placeholder: "Questions? Call the office: 0800 000 0000" },
    ],
    build: (v) => [
      { type: "heading", level: 1, text: title(v.title, "NOTICE") },
      ...(v.body?.trim() ? [{ type: "paragraph", text: v.body } as Block] : []),
      ...(pairs(v.details).length ? [{ type: "keyvalue", rows: pairs(v.details) } as Block] : []),
      ...(v.contact?.trim() ? [{ type: "paragraph", text: v.contact } as Block] : []),
    ],
  },
  {
    id: "results",
    name: "Results table",
    description: "A table of results, scores or prices. Long tables split across screens with the header repeated.",
    fields: [
      { key: "title", label: "Title", kind: "text", placeholder: "JSS3 MATHS RESULTS" },
      { key: "header", label: "Column names (comma separated)", kind: "text", placeholder: "ID, Name, Grade, Score" },
      { key: "rows", label: "Rows (one per line, comma separated)", kind: "textarea", placeholder: "1001, A. Bello, A, 86\n1002, C. Eze, B, 74" },
      { key: "note", label: "Note under the table", kind: "text" },
    ],
    build: (v) => [
      { type: "heading", level: 2, text: title(v.title, "RESULTS") },
      {
        type: "table",
        header: (v.header ?? "").split(",").map((c) => c.trim()).filter(Boolean),
        rows: lines(v.rows).map((r) => r.split(",").map((c) => c.trim())),
      },
      ...(v.note?.trim() ? [{ type: "paragraph", text: v.note } as Block] : []),
    ],
  },
  {
    id: "alert",
    name: "Alert",
    description: "An urgent message shown in red.",
    fields: [
      { key: "title", label: "Headline", kind: "text", placeholder: "CLOSURE ALERT" },
      { key: "alert", label: "Alert (shown in red)", kind: "textarea", placeholder: "The school is closed on Wed 25 Nov." },
      { key: "more", label: "More information", kind: "textarea" },
    ],
    build: (v) => [
      { type: "heading", level: 1, text: title(v.title, "ALERT") },
      ...(v.alert?.trim() ? [{ type: "paragraph", tone: "alert", text: v.alert } as Block] : []),
      ...(v.more?.trim() ? [{ type: "paragraph", text: v.more } as Block] : []),
    ],
  },
  {
    id: "timetable",
    name: "Timetable",
    description: "Times and places, for example bus stops or opening hours.",
    fields: [
      { key: "title", label: "Title", kind: "text", placeholder: "ROUTE 12" },
      { key: "rows", label: "Rows (one per line: Stop, Time, Status)", kind: "textarea", placeholder: "Central, 14:40, On time\nMarket Rd, 14:46, Delayed 5 min" },
      { key: "note", label: "Note", kind: "text" },
    ],
    build: (v) => [
      { type: "heading", level: 2, text: title(v.title, "TIMETABLE") },
      { type: "table", header: ["Stop", "Time", "Status"], rows: lines(v.rows).map((r) => r.split(",").map((c) => c.trim())) },
      ...(v.note?.trim() ? [{ type: "paragraph", text: v.note } as Block] : []),
    ],
  },
  {
    id: "faq",
    name: "FAQ",
    description: "Questions and answers.",
    fields: [
      { key: "title", label: "Title", kind: "text", placeholder: "QUESTIONS AND ANSWERS" },
      { key: "qa", label: "One per line: Question? | Answer", kind: "textarea", placeholder: "When are reports ready? | Fri 13 Nov" },
    ],
    build: (v) => [
      { type: "heading", level: 1, text: title(v.title, "FAQ") },
      ...lines(v.qa).flatMap((l): Block[] => {
        const [q, a] = l.split("|").map((s) => s.trim());
        return [{ type: "heading", level: 2, text: q ?? "" }, { type: "paragraph", text: a ?? "" }];
      }),
    ],
  },
  {
    id: "events",
    name: "Events",
    description: "A list of dates and events.",
    fields: [
      { key: "title", label: "Title", kind: "text", placeholder: "EVENTS THIS MONTH" },
      { key: "events", label: "One per line: Date: Event", kind: "textarea", placeholder: "Sat 21 Nov: Sports day\nFri 4 Dec: Carol service" },
    ],
    build: (v) => [{ type: "heading", level: 1, text: title(v.title, "EVENTS") }, { type: "keyvalue", rows: pairs(v.events) }],
  },
];
