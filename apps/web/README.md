# @teletext/web

The Next.js app (public reader, publisher dashboard, API routes) and the Convex backend in `convex/`.
Project overview, setup and tests are in the [root README](../../README.md).

```
src/app/                 routes: / and /p/[number] (reader), /dashboard/** (publishers), /api/**
src/components/reader/   reader UI, settings
src/components/teletext/ our own teletext screen renderer (MIT)
src/components/dashboard/ editor pieces: block editor, fact panel
src/lib/                 system pages (index, not found), templates
convex/                  schema, queries, mutations, seed data
public/sw.js             service worker (offline pages)
```

Heads-up for contributors and agents: this is Next.js 16. Read `AGENTS.md` and the docs in
`node_modules/next/dist/docs/` before changing framework code.
