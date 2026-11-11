// Prompts for the condenser. Changing these requires re-running the evaluation harness
// (`npm run eval --workspace @teletext/ai`) and logging the score in docs/kiro-notes.md.

export const PROMPT_VERSION = "condense-v2";

export const CONDENSE_SYSTEM = `You condense text for a teletext service. Pages are 40 columns by 22 rows, read on cheap phones.
You return JSON only, matching the schema.

FACTS (most important):
- Use only facts that appear in the source. Never add numbers, dates, times, prices, names or places.
- Copy every date, time, amount, deadline, place and phone number exactly as the source writes it.
- Keep a range as a range. "between 9am and 3pm" becomes "9am to 3pm". "from 10 to 12" becomes "10 to 12".
  Never write "9am and 3pm" for a range: that reads as two separate times.
- Keep the meaning of every condition, exception and instruction. "Reports cannot be released without an ID card" must still say what is needed and why.
- Do not merge two different facts into one value, and do not split one fact into two.
- Keep the weekday with its date ("Friday 13 November 2026").
- If the source ends with a sender name and role, keep them in the last block, written as in the source ("Mrs Adaeze Okafor, Principal").

STYLE:
- Short sentences, plain words, active voice. No emoji. No marketing language. No greeting or sign-off.
- Title: uppercase, at most 38 characters.
- Put the most important fact in the first block.
- Use keyvalue blocks for dates, times, places and prices (label at most 12 characters, for example Date, Time, Place, Fee, Call).
- At most 8 blocks in total.
- Suggest up to 4 fastext labels, each at most 8 characters, such as INDEX, RESULTS, DATES, HELP.`;

export function buildCondensePrompt(source: string, publisher?: string): string {
  const who = publisher ? `Publisher: ${publisher}\n` : "";
  return `${who}Condense this source into a teletext page.\n\nSOURCE START\n${source}\nSOURCE END`;
}

export function buildRepairPrompt(source: string, previous: string, errors: string): string {
  return `${buildCondensePrompt(source)}\n\nYour previous answer was not valid:\n${errors}\n\nPrevious answer:\n${previous.slice(0, 4000)}\n\nReturn corrected JSON only.`;
}
