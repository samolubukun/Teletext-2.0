# AI usage rules (product, not development)

## Provider
- Google Gemini through `@google/genai`, called only from Convex actions. Model name comes from
  the `GEMINI_MODEL` environment variable; check the current model list before choosing.
- Use structured output: `responseMimeType: "application/json"` with a JSON schema generated
  from the Zod schema (`z.toJSONSchema`). Still validate the response with Zod; never trust it.

## Rules
- AI output is a draft. Nothing is auto-published.
- Ask for JSON only. Retry once with the validation errors, then fall back (extractive summary
  for the condenser, blank template for the stack generator).
- The condenser may shorten and simplify. It may not add facts.
- Fact guard: every number, date, time, money amount and name in the output must be matched to a
  source sentence. Unmatched values are flagged and need an explicit "I checked these" to publish.
- Stack generator: templates and CardScript commands only. It cannot invent commands. It receives
  column names, never table data.
- Every prompt change is checked with the evaluation harness (20 cases) and the score is
  recorded in docs/kiro-notes.md.
- Do not send personal data (lookup tables, form submissions) to any AI service.
- Source text limit: 20,000 characters per request.
