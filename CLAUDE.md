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
1. **k-anonymity, floor 3, default 5, database-enforced.** `app.k_floor()` is a *function*
   returning 3 and `app.k_min()` a function returning 5, the default and the strong
   recommendation — functions, not columns, so no row can lower them. An organisation's
   threshold is 3..10 (under 5 only after an explicit warning, for small teams). A round
   freezes its k when it opens; readers apply `app.k_round(round)`, floored at 3 (D-198).
   Clients never select from `responses`, `answers`, `extra_answers` or
   `response_comments`: those have RLS enabled with **no policy** and no grant, so every
   client role is denied by default. Result reads go through SECURITY DEFINER RPCs that
   apply k per cell.
2. **Anonymity is structural, by absence.** `app.responses` has no column that could
   hold a linkage — not a nullable one, none. It carries a group and an hour truncated
   to the hour. Do not add a column that could identify anyone, and do not add a select
   policy to an answer table. Either silently removes k-anonymity from the whole product.
   The one exception, the owner's decision (X-103): a person who wrote a comment and *says
   yes* to being told when management answers is linked to their conversations in
   `app.thread_recipients`, sealed under a Vault key, with no foreign key to a person, no
   policy and no grant, read only by the dispatcher's claim, and forgotten when the
   conversation closes, when they turn it off, or after a year. Nobody else is linked to
   anything. Do not widen it: no reader for the organisation, no unsealed copy.
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

## Translations ship with the text (X-089)
Every respondent-facing text added or changed — a survey page string (`respond.*`, factor and
extra labels), an invitation, reminder or SMS text (`mail.*`), a core statement, a question outside
the index, or a published module's items, options and factor names — is translated in the same
piece of work into every survey language (pl, uk, lt, sv, da) and, for module texts, English. Best
effort machine drafts following `docs/translations/<lang>.md`, validated with `checkImport`, written
to the registry as origin *machine*; Tor reviews them afterwards. A text is never left untranslated
because a human translator has not seen it yet: an untranslated text takes the whole language out
of the survey (D-133).

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
- `node scripts/audit/wiring.mjs`: every write has a reader and every setting an effect. A new
  column, setting or public RPC ships with its consumer and a test of the effect, or the audit
  fails it. The full verification playbook is the `/audit` skill (`.claude/skills/audit/`).
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
**Build phase — in force until Tor declares the product in production (X-108).** Full authority.
Run everything end to end and report afterwards. Never stop to ask permission for an action;
ask only for a product decision nobody has made (a price, a wording, a market's k).

**Run freely, local and hosted:**
- any local command
- database work: migrations through the Supabase MCP, seeds, data fixes, dropping or truncating a
  table, bulk deletes. Look at the target first and record what was removed in the commit.
- production deploys: push to `main`, Vercel production and preview, edge functions, env vars
- git: branches, commits, PRs, merges. Force-push only a branch this session created, never `main`.
- rotating keys (through env or Vault, never printed) and plan or billing settings
- launching pages and publishing modules. Legal review in admin is a record, not a gate (X-078).

**Not a deployment decision:** weakening a security invariant (above). That covers disabling RLS,
a select policy on an answer table, lowering the k floor, or a column that could link a person.
These are product rules, changed only by an X-entry of Tor's, never as a side effect of shipping.

**Secrets:** read them from the environment. Never print one, never write one into a
tracked file, never put one in a commit message or PR body. If a credential is missing,
say which one and how to provide it — do not work around it by weakening a control.

**When a tool refuses:** a refusal is a technical fact, not Tor saying no.
- Find the cause and take another sanctioned route: a non-destructive migration, another tool,
  a workflow. Say what happened in the report.
- Only when no route exists, say which tool, which command, and what Tor must do.
- Never retry an action an automated classifier denied, and never weaken a control to get past one.

### Deployment playbook
1. **Database first, code second.** Code that needs new schema ships after the hosted migration,
   or works against both the old and the new schema while it is pending (expand → migrate →
   contract). A new RPC parameter is optional with a default, and the app sends it only when it
   differs from the default (D-251).
2. **Hosted migrations go through the Supabase MCP `apply_migration`, with the committed file
   verbatim and named after its file.** CI rebuilds a local database from migrations; it never
   touches the hosted project.
3. **Write migrations without destructive statements.** The Supabase connector answers a `DROP …`
   with `{"status":"cancelled"}` and no prompt reaches anyone. Set objects aside instead:
   - for a function: `alter function … set schema app; … rename to …_retired; revoke all …`
     (0201, 0214);
   - for a table: rename it and revoke its grants.
   A migration not yet applied to the hosted project may be edited to get there. Once applied, it
   is superseded, never edited.
4. **Before every push**, with exit codes read:
   - `npx tsc --noEmit`, `npm run lint`, `npm run verify:i18n`, `npx vitest run`
   - `NEXT_DIST_DIR=.next-build npx next build`, then `git checkout tsconfig.json`
   - when SQL changed: `npm run qa:up -- --reset`, `npm run test:db` and `node scripts/audit/wiring.mjs`
5. **Ship:** push the branch, fast-forward `main` with `git push origin HEAD:main`, and watch the
   commit's «checks, security invariants and screens» job. Vercel deploys `main`.
6. **After:** on hosted, run `list_migrations`, a SELECT that proves the change and
   `get_advisors security`, and check that the production path the change touches still works.
   Then report what shipped.
7. **Local stack:** if `supabase db reset` fails with «volume is in use» by a container Docker cannot
   find, stop dockerd, move `/var/lib/docker/containers/<id>` aside, start dockerd and remove the volume.

### Production phase (later)
When Tor declares the product in production, this replaces the build-phase list. Stop and ask first
before:
- dropping or truncating a table, or bulk-deleting rows, on the hosted project;
- anything that weakens an invariant;
- rotating keys or altering billing;
- force-pushing or rewriting history on a branch that is not your own.
The playbook stays.

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
