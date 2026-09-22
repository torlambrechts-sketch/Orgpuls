# CLAUDE.md — Orgpuls

Orgpuls measures the psychosocial work environment for Norwegian organisations. Its
wedge is statutory: arbeidsmiljøloven § 4-3 and the regulation's chapter 1A name the
factors an employer must survey, and this product surveys exactly those, with a QPS
Nordic instrument, producing the documentation Arbeidstilsynet asks for.

Its central promise is that no single answer can be traced to a person. That promise is
structural, not procedural — see **Security invariants**. Everything else is negotiable;
that is not.

Read `docs/IMPLEMENTATION_PLAN.md`, `docs/DECISION_LOG.md` and `docs/DEVIATIONS.md`
before starting a segment.

## Stack (fixed — do not substitute)
- Next.js (App Router) + TypeScript `strict` + Tailwind + React 19, deployed on Vercel
- Supabase: Postgres + Auth + RLS — project region **eu-central-1**
- i18n: next-intl, **no locale routing** (no `/no` or `/en` prefix). Messages are JSON
  files in `/messages`; the locale comes from the user's profile, the organisation
  default, or a cookie. `no` is the source language, extracted verbatim from the design.
- Fonts are served from `public/fonts` by `app/fonts.css`, the design bundle's own
  stylesheet. **Do not replace this with `next/font`** — it ships a different build of
  DM Sans and every run of text then differs from the baseline. See D-07.

## Design fidelity — pixel-perfect, non-negotiable
- The source of truth is `design-reference/orgpuls/`. Read `Orgpuls_Offline_Source.html`
  for any screen before building it; it is the rendering the baselines were captured
  from. **Match the visual output exactly. Do not restyle, substitute components, or
  "improve" spacing, colour or copy.** Recreate the rendering in React and Tailwind;
  never copy the prototype's internal structure (`sc-if`, `sc-for`, inline styles).
- Tokens live in `tailwind.config.ts` and are transcribed, not chosen. Every hex there
  appears verbatim in the bundle. The radius scale is a scale: which value a component
  uses is part of its identity — a nav button is 10, a card is 20, a chip is round.
- The pixel gate is `scripts/verify/pixel.mjs`, diffing against
  `design-reference/orgpuls/baselines/`. Tolerance is **0.1% of the screen**, agreed
  with the user. `scripts/verify/shoot.mjs` captures routes the same way the baselines
  were captured; `scripts/verify/probe.mjs` tells you *what* differs when a diff fails,
  so you fix a cause you confirmed rather than one you guessed.
- Every UI string comes from next-intl. **Never hard-code user-facing text.**

## Security invariants — violating any of these fails the PR
1. **k-anonymity, k=5, database-enforced.** `app.k_min()` is a *function* returning 5,
   not a column, so no row can lower it; an organisation may raise it to at most 10.
   Clients never select from `responses`, `answers`, `extra_answers` or
   `response_comments`: those have RLS enabled with **no policy** and no grant, so every
   client role is denied by default. Result reads go through SECURITY DEFINER RPCs that
   apply k per cell.
2. **Anonymity is structural, by absence.** `app.responses` has no column that could
   hold a linkage — not a nullable one, none. It carries a group and an hour truncated
   to the hour. Do not add a column that could identify anyone, and do not add a select
   policy to an answer table. Either silently removes k-anonymity from the whole product.
3. **One write path.** `rpc.submit_response`: token looked up by SHA-256 of the
   plaintext, single transaction, and it never returns the id of the row it wrote, so a
   caller cannot correlate their submission with a record.
4. RLS on every table, org-scoped via `app.is_org_member` / `app.has_role`. New table ⇒
   RLS + policies in the same migration + a test.
5. Roles: `daglig_leder`, `avdelingsleder`, `verneombud`.
6. Zod at every server boundary. PostgREST rows are parsed, not cast — `supabase gen
   types` does not emit the `app` schema, so a cast asserts a shape nothing checks.
7. **No respondent free text in logs, error payloads or analytics.** A person can be
   recognised by what they describe even when nothing about them is stored.
8. Schema changes only via `supabase/migrations/`. Never edit an applied migration; add
   a new one that supersedes it.

Both suites in `supabase/tests/` must pass. `respondent_invariants.sql` proves 21 of the
above against a live schema and raises if any assertion fails.

## Data-not-code
Factors, statements, the questions outside the index and their option sets, round
audiences and UI messages are **data** — seeded tables and registries. One renderer per
question kind, keyed off the row. Adding a factor, a statement or an option is a
migration and a message key, never a component change. The respondent flow numbers its
statements from the ordinals the database holds, not from a hard-coded 1..3.

## Never fabricate data in the UI
If a value does not exist in the schema, do not render a placeholder that looks like
data — an invented count, a hard-coded version, a 0% over an unknown denominator. Render
the real state, render nothing, or render the design's empty treatment. A fake value is
indistinguishable from a real one in review and survives into screenshots as though it
were true. Where a block cannot be backed yet, omit it and log the omission in
`docs/DEVIATIONS.md` with the constraint named.

## Control substitution
The design's control is authoritative. Substituting another for convenience is
restyling and is forbidden. The single exception: where the prototype's control cannot
express a real constraint — a `<button>` standing in for navigation because a prototype
has no router. Then use the real control, styled exactly as that control class is styled
in the bundle, and log it (see D-06).

## Immutability triggers must permit referential maintenance
An append-only trigger written as "reject any UPDATE or DELETE" collides with
PostgreSQL's own FK maintenance — cascades and `ON DELETE SET NULL` are DELETEs and
UPDATEs the database issues on your behalf — and the symptom is a parent row that cannot
be deleted, discovered far from the trigger. Write the rule as *"nobody may change this
content"*: compare the columns that carry meaning, and allow a delete only when the
parent is already gone. This has been rediscovered five separate times.

## Testing gates
- `npx tsc --noEmit`, `npm run lint`, `npm run verify:i18n`, `npx next build`
- The pixel gate for the segment's screens
- Both SQL suites in `supabase/tests/`
- CI additionally rebuilds the database from migrations, runs the fixture generator, and
  asserts the design's published figures — index 61, 64 the year before, "28 av 34 ·
  82 %". If those move, a migration or the generator drifted.

## The fixture
`scripts/seed/design-fixture.mjs` generates the whole scenario backwards from the
design's own numbers: answer distributions whose computed indices are exactly the eleven
the statutory report prints. It is the **only** source of fixture rows — nothing may be
created ad hoc against a database, because a row not emitted there does not survive a
reset. It is idempotent and works against an empty database.

## Definition of done per screen
Pixel diff passes, every state from the design reachable (including empty and warning
states), i18n complete for `no` and `en`, invariants green, no console errors, keyboard
and focus-visible work — the design specifies focus styles, so implement them.

## Operating authority
Run the project end to end without asking permission per action.

**Run freely:** any local command; local and remote database work including applying
migrations and running the seed; the Supabase MCP; Vercel env and preview deploys; git,
branches, commits, pushes, PRs; web search.

**Stop and ask first:** dropping or truncating a table, or bulk-deleting rows, on a
remote project; anything that weakens an invariant (disabling RLS, adding a select
policy to an answer table, lowering the k floor, removing the anonymity constraints);
deploying to production; rotating keys or altering billing; force-pushing or rewriting
history on a branch that is not your own.

**Secrets:** read them from the environment. Never print one, never write one into a
tracked file, never put one in a commit message or PR body. If a credential is missing,
say which one and how to provide it — do not work around it by weakening a control.

**When a tool is unauthorised:** say which tool, which command, and what the human must
do. Do not silently fall back to a manual instruction and carry on.

## Cloud sessions
A cloud session is a fresh VM with a clone of this repo and nothing from a laptop.
`.mcp.json` and `.claude/settings.json` configure it.
- Database work goes through the Supabase MCP. Do not look for a local Supabase CLI
  login — its installer pulls release assets the cloud proxy restricts.
- To look at the app: start the server in the background, then use the Playwright MCP
  against `http://localhost:3000`. `*.vercel.app` previews go through a security proxy
  headless Chromium may not reach.
- Never run `playwright install`; `scripts/playwright-mcp.sh` points at the image's
  Chromium.
- **`.claude/settings.json` is read once, at session start.** Editing it mid-session
  changes nothing until the next one. If a permission blocks you, say so and hand the
  content over — do not try to edit around it, and do not wrap a command to dodge a
  pattern match.

## When ambiguous
If the design bundle and this file conflict, this file wins on security, the bundle wins
on visuals. If something is genuinely unspecified, choose the minimal consistent option
and log it in `docs/DEVIATIONS.md` — do not invent features.
