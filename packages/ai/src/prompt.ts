// Prompts for the condenser. Changing these requires re-running the evaluation harness
// (`npm run eval --workspace @teletext/ai`) and logging the score in docs/kiro-notes.md.

export const PROMPT_VERSION = "condense-v1";

export const CONDENSE_SYSTEM = `You condense text for a teletext service. Pages are 40 columns by 22 rows, read on cheap phones.
You return JSON only, matching the schema.
Rules:
- Use only facts that appear in the source. Never add numbers, dates, times, prices, names or places.
- Keep every date, time, amount, deadline, place and phone number a reader needs.
- Copy numbers, dates and times exactly as written in the source.
- Short sentences, plain words, active voice. No emoji. No marketing language.
- Title: uppercase, at most 38 characters.
- Put the most important fact in the first block.
- Prefer keyvalue blocks for dates, times, places and prices (label at most 16 characters).
- At most 8 blocks in total.
- Suggest up to 4 fastext labels, each at most 8 characters, such as INDEX, RESULTS, DATES, HELP.`;

export function buildCondensePrompt(source: string, publisher?: string): string {
  const who = publisher ? `Publisher: ${publisher}\n` : "";
  return `${who}Condense this source into a teletext page.\n\nSOURCE START\n${source}\nSOURCE END`;
}

export function buildRepairPrompt(source: string, previous: string, errors: string): string {
  return `${buildCondensePrompt(source)}\n\nYour previous answer was not valid:\n${errors}\n\nPrevious answer:\n${previous.slice(0, 4000)}\n\nReturn corrected JSON only.`;
}
