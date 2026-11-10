# Product: Teletext 2.0

Teletext 2.0 lets organizations publish short, fast, retro-style info pages that
anyone can read instantly, even on slow networks and cheap phones.

One-line pitch: publish to the public in two minutes, read in two seconds.
Hackathon: Kiroween 2026, category Resurrection. Solo build. Deadline Fri 4 Dec 2026,
14:00 PT (23:00 Nigeria). Submit by Thu 3 Dec.

## Users
- Publishers (paying): school admins, clinic managers, councils, transport unions, NGOs.
- Readers (free): parents, students, patients, commuters, residents.
- Demo persona: a school admin publishing exam results; a parent reading them on a slow phone.

## Principles
1. Fast first: pages under 5 KB, no spinners for normal reads.
2. Number first: typing a page number is the main way to navigate.
3. Authentic retro, modern accessibility.
4. Publishing must take under two minutes.
5. AI output is always a draft. A human reviews before publishing.

## Stages
- Stage 1: reader, publisher dashboard, AI condenser, offline PWA. Must be finished and polished alone.
- Stage 2 (Stacks, the HyperCard layer): interactive cards in packages/stacks, behind STACKS_ENABLED.
  Stage 1 code must never import from packages/stacks.
- Gates: A (Nov 16) renderer passes 10,000 random inputs. B (Nov 24) paste -> condense ->
  publish -> read works end to end. C (Nov 28) one lookup stack works or Stage 2 is cut.
  Feature freeze end of Nov 30.

## Out of scope
SMS/USSD, real payment processing (mock upgrade only), native apps, user comments,
custom domains, multi-language UI.

## Scope discipline
If a request adds a feature not in the MVP list, say so and ask before building it.
A finished Stage 1 beats a broken Stage 1 plus Stage 2.
