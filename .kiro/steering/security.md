# Security and privacy rules

- Authentication: Hexclave. Convex verifies Hexclave JWTs via `convex/auth.config.ts`.
  Identify users by `identity.subject` (the Hexclave user id).
- Authorization lives in Convex functions, not in the UI. Every org-scoped function uses the
  `orgQuery` / `orgMutation` wrappers and the permission table. UI checks only hide buttons.
- Public reads (pages, index, search) go through public Convex queries that return only
  published, non-expired content and only reader-safe fields.
- Lookups and form submissions (Stage 2) run on the server only. The browser never receives a whole table.
- PINs are hashed (bcryptjs or WASM argon2, in a Convex action) on upload. Plain PINs are never stored or logged.
- Rate limit failed lookups (5 per ID and per IP in 10 minutes). "Not found" and "wrong PIN"
  return the same message. Store only hashes of IDs and IPs.
- Rate limit AI requests per organization and public writes (views, reports) per IP.
- Secrets only in environment variables: Next.js secrets in `.env.local` / Vercel, Convex
  secrets (GEMINI_API_KEY) in the Convex dashboard. `RATE_LIMIT_SALT` lives in the Next.js environment because the route
  handlers hash visitor IPs before calling Convex. `.env.example` lists names only.
- Never prefix a secret with NEXT_PUBLIC_.
- Uploaded CSVs: size limit, row limit, column limit, strict parsing.
- Demo data is fake. No real names, IDs or phone numbers.
- Form pages show a short privacy notice before collecting anything.
- Do not send personal data (lookup tables, form submissions) to Gemini.
