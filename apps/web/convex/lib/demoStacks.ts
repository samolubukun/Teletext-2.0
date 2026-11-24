// Demo Stage 2 stacks for Greenfield High (fake people and IDs only).
// Definitions are checked with the same schema and validator as publisher saves.
import { stackSchema, validateStack, type Stack } from "../../../../packages/stacks/src/index";

export type DemoLookupRow = { lookupId: string; pin: string; values: Record<string, string> };
export type DemoSubmission = { reference: string; status: "open" | "done"; hoursAgo: number; fields: Record<string, string> };
export type DemoStack = { name: string; definition: Stack; rows: DemoLookupRow[]; submissions: DemoSubmission[] };

const heading = (text: string) => ({ type: "heading", level: 1, text });
const paragraph = (text: string) => ({ type: "paragraph", text });

const lookupStack: Stack = {
  version: 1,
  id: "exam-results",
  title: "Term 1 Exam Results Lookup",
  template: "lookup",
  startCard: "lookup",
  tables: { results: { columns: ["student_id", "pin_hash", "name", "grade", "score", "remarks"] } },
  cards: [
    {
      id: "lookup",
      page: 412,
      title: "EXAM RESULTS LOOKUP",
      blocks: [
        heading("EXAM RESULTS LOOKUP"),
        paragraph("Enter your Student ID and PIN to see your Term 1 result."),
        paragraph("Demo: try ID 1001 with PIN 1234, or ID 1002 with PIN 5678"),
      ],
      fields: [
        { id: "sid", label: "Student ID", type: "text", maxLength: 12 },
        { id: "pin", label: "PIN", type: "secret", maxLength: 8 },
      ],
      buttons: [{ key: "green", label: "SHOW RESULT", script: "lookup results by student_id = sid and pin_hash = pin into row" }],
    },
  ],
};

const formStack: Stack = {
  version: 1,
  id: "parent-inquiry",
  title: "Parent Inquiry & Absence Form",
  template: "form",
  startCard: "contact",
  tables: {},
  cards: [
    {
      id: "contact",
      page: 420,
      title: "CONTACT SCHOOL OFFICE",
      blocks: [
        heading("CONTACT SCHOOL OFFICE"),
        paragraph("Report an absence or ask the office a question."),
        paragraph("Privacy: the office reads your answers. We keep them only to reply."),
      ],
      fields: [
        { id: "parent_name", label: "Parent Name", type: "text", maxLength: 60 },
        { id: "student_name", label: "Student Name", type: "text", maxLength: 60 },
        { id: "message", label: "Reason / Message", type: "text", maxLength: 200 },
      ],
      buttons: [{ key: "green", label: "SEND", script: "submit form contact" }],
    },
  ],
};

const quizQuestion = (id: string, page: number, number: number, question: string, answerId: string, options: string[], correct: string, next: string) => ({
  id,
  page,
  title: `QUESTION ${number} OF 3`,
  blocks: [heading(`QUESTION ${number} OF 3`), paragraph(question)],
  fields: [{ id: answerId, label: "Your answer", type: "choice" as const, maxLength: 60, options }],
  buttons: [{ key: "green" as const, label: "NEXT", script: `if ${answerId} = "${correct}"\nadd 1 to score\nelse\nend if\ngo to card ${next}` }],
});

const quizStack: Stack = {
  version: 1,
  id: "library-trivia",
  title: "School Library Trivia Quiz",
  template: "quiz",
  startCard: "intro",
  tables: {},
  cards: [
    {
      id: "intro",
      page: 430,
      title: "LIBRARY TRIVIA QUIZ",
      blocks: [heading("LIBRARY TRIVIA QUIZ"), paragraph("Three questions about our school library. Pick one answer for each.")],
      fields: [],
      buttons: [{ key: "green", label: "START", script: "set score to 0\ngo to card q1" }],
    },
    quizQuestion("q1", 431, 1, "Which system do most libraries use to sort non-fiction books?", "a1", ["Dewey Decimal", "Alphabet only", "Colour code"], "Dewey Decimal", "q2"),
    quizQuestion("q2", 432, 2, "How many days can a student keep a book?", "a2", ["7 days", "14 days", "30 days"], "14 days", "q3"),
    quizQuestion("q3", 433, 3, "Who may borrow books from the library?", "a3", ["Only teachers", "Every student", "Nobody"], "Every student", "done"),
    {
      id: "done",
      page: 434,
      title: "QUIZ COMPLETE",
      blocks: [heading("QUIZ COMPLETE"), paragraph("Press SCORE to see how many you got right.")],
      fields: [],
      buttons: [
        { key: "green", label: "SCORE", script: 'if score > 2\nshow message "Perfect! 3 out of 3. Great reader!"\nelse\nif score > 1\nshow message "Well done! 2 out of 3."\nelse\nshow message "Good try. Visit the library and read more."\nend if\nend if' },
        { key: "red", label: "PLAY AGAIN", script: "set score to 0\ngo to card intro" },
      ],
    },
  ],
};

const pupils: Array<[string, string, Record<string, string>]> = [
  ["1001", "1234", { name: "Ada Bello", grade: "A", score: "92%", remarks: "Distinction in Sciences" }],
  ["1002", "5678", { name: "Chidi Okonkwo", grade: "B+", score: "84%", remarks: "Credit in Mathematics" }],
  ["1003", "2468", { name: "Zainab Abubakar", grade: "A-", score: "88%", remarks: "Excellent Arts performance" }],
];

export function demoStacks(): DemoStack[] {
  const stacks: DemoStack[] = [
    { name: "Term 1 Exam Results Lookup", definition: lookupStack, rows: pupils.map(([lookupId, pin, values]) => ({ lookupId, pin, values })), submissions: [] },
    {
      name: "Parent Inquiry & Absence Form",
      definition: formStack,
      rows: [],
      submissions: [
        { reference: "TT-9A4F12", status: "open", hoursAgo: 3, fields: { parent_name: "Mrs. N. Adeleke", student_name: "Tobi Adeleke", message: "Requesting medical leave for Thursday dental appointment." } },
        { reference: "TT-3C7E81", status: "done", hoursAgo: 27, fields: { parent_name: "Dr. K. Mensah", student_name: "Kofi Mensah", message: "Confirming bus route change to Route 4B." } },
      ],
    },
    { name: "School Library Trivia Quiz", definition: quizStack, rows: [], submissions: [] },
  ];
  for (const stack of stacks) {
    const parsed = stackSchema.safeParse(stack.definition);
    const problems = parsed.success ? validateStack(parsed.data) : [{ message: parsed.error.message }];
    if (problems.length > 0) throw new Error(`Demo stack "${stack.name}" is invalid: ${problems[0]?.message ?? ""}`);
  }
  return stacks;
}
