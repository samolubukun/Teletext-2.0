# Kiro usage checklist (for the Technological Implementation score)

Judges look for deep, honest use of Kiro. Status as of Wed 11 Nov 2026. Evidence goes in `docs/kiro-notes.md`
and `docs/screenshots/`.

| Kiro feature | What we have | Still to do |
| --- | --- | --- |
| **Specs** | 5 of ~6 Stage 1 specs: page-format-and-renderer, reader-app, offline-pwa, publisher-dashboard, ai-condenser. Each has requirements, design with correctness properties, and tasks with honest checkboxes. | data-connectors spec (Sheets/RSS) if time; Stage 2 specs only if Gate C passes |
| **Steering** | 7 docs: product, teletext-style, tech, testing, security, ai-usage, cardscript (file-match). | Note which doc changed Kiro's output most (candidate: `tech.md` "read the Next.js 16 docs first") |
| **Hooks** | Core tests on save, Boundary guard, Spec sync, AI type-check and tests, Style guard, Secret guard (`node scripts/pre-submit.mjs --secrets-only`). | Screenshot one hook catching a real problem |
| **Property-based testing** | 15 renderer properties plus reader entry, range allocation, workflow, plan limits, permissions and fact-guard properties (about 60 tests). | Raise to `FC_RUNS=10000` before submission; keep the shrunk P8 counterexample as a regression test (done) |
| **MCP** | Convex MCP server is the planned source. Config file is `.kiro/settings/mcp.json` (see below). | Use it once for a real task and write down one thing it could not do |
| **Powers** | None installed. | Check the Powers list in Kiro for Convex, Vercel or GitHub and install if one fits |
| **Custom agent** (optional) | none | A "content reviewer" agent whose instructions are `teletext-style.md` |
| **IDE vs CLI** | IDE only so far | Try the CLI once and say which you preferred for what |

## MCP settings to paste into `.kiro/settings/mcp.json`

The agent cannot write that folder, so create the file yourself:

```json
{
  "mcpServers": {
    "convex": {
      "command": "npx",
      "args": ["-y", "convex@latest", "mcp", "start"],
      "disabled": false,
      "autoApprove": ["tables", "data", "functionSpec", "logs"]
    }
  }
}
```

## Real bugs found by the tests and live runs (for the write-up and the video)

1. P8 counterexample: a 150-character heading broke "a heading is never the last line of a screen".
2. Yoruba combining tone marks were reported as "emoji removed".
3. The phone number "0800 000 0000" split across two lines in a golden snapshot.
4. Fact guard glued label lines ("Where / Main Hall / Fees") into a fake name (first live Gemini run).
5. A time regex swallowed the sentence's full stop ("8am.").
6. The AI turned "between 9am and 3pm" into "9am and 3pm". The fact guard cannot catch changed meaning; the
   fix is a prompt rule plus human review.

## Hackathon admin (from the plan)

- Request the free Kiro credits (deadline Dec 1, 12:00 PM PT) and join the Discord.
- Public repo with MIT licence visible in the About box and `/.kiro` committed.
- Submit by Thu 3 Dec; deadline is Fri 4 Dec, 14:00 PT (23:00 Nigeria).
