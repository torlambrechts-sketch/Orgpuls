# CLAUDE.md — HeiTuva

HeiTuva is a Norwegian-market survey SaaS with a statutory-compliance wedge (Arbeidsmiljøloven § 4-3, Åpenhetsloven §§ 4–5, Likestillingsloven § 26/ARP, aml. kap. 2A). This file is the contract for every coding session. Read `DECISIONS.md` and `docs/HeiTuva_Implementation_Plan.md` before starting any phase.

## Stack (fixed — do not substitute)
- Next.js (App Router) + TypeScript `strict` + Tailwind + shadcn/ui, deployed on Vercel
- Supabase: Postgres + Auth + RLS + Storage + Edge Functions + pg_cron + pgmq — project region **eu-central-1**
- GitHub + Vercel Git integration; Supabase branch per PR
- i18n: next-intl, messages loaded from `ui_messages` table (seeded from `/messages/*.json`), tag-based revalidation
- Email: provider adapter in `lib/mail/` — Amazon SES eu-north-1 (see DECISIONS Q6)

## Design fidelity — pixel-perfect, non-negotiable
- The design source of truth is `/design-reference/` (the Claude Design handoff bundle). Read `project/HeiTuva.dc.html` for any screen before building it. **Match the visual output exactly. Do not restyle, do not substitute components, do not "improve" spacing, colors, or copy.** Recreate the rendering in React/Tailwind; never copy the prototype's internal structure (`sc-if`/`sc-for`, inline styles).
- Theme tokens (Tailwind theme, CSS vars):
  `--bg #FCF6E9 · --sf #FFFDF6 · --sf2 rgba(25,21,16,.05) · --ink #191510 · --mut #5F5849 · --line #E8DFC9 · --ac #F5C64A · --acf #191510 · --ac2 #A8D5D2 · --ac3 #FBD5C4 · --sbg #FBEBBE · --sbg2 #F6EEDD`
  radius 16px · shadow `0 2px 10px rgba(25,21,16,.05)` · fonts: Playfair Display (display), DM Sans (body), Bricolage Grotesque (logo only) · base 14px · focus outline `3px solid #191510, offset 2px` · entry animation fade + 6px translateY, .25s ease
- Desktop app pixel-perfect at ≥1280px. Respondent-facing surfaces — `/s/[token]`, report share links, splash — mobile-first pixel-perfect at 380–420px.
- **All app screens are responsive down to 390px (DECISIONS Q15).** Below 1280px there is no design to match, so follow `docs/RESPONSIVE.md` exactly — it is a specification, not a suggestion. The do-not-invent rule is relaxed ONLY to the patterns in that file; anything it does not cover is a stop-and-ask. Tokens never change across breakpoints; no feature may be hidden on mobile.
- Every UI string comes from next-intl (`no` is the source language). **Never hard-code user-facing text.** Norwegian copy must match the design bundle verbatim.

## Security invariants — violating any of these fails the PR
1. **k-anonymity, k=5, database-enforced.** Clients never select from `responses` or `answers` (no RLS select policy exists for them — do not add one). All result reads go through the SECURITY DEFINER RPCs (`aggregate_results`, `get_quotes`, heatmap RPCs) which return `insufficient_data` for any cell with n < 5 and strip group labels below threshold.
2. **Anonymity is structural.** Anonymous submissions: `invitation_id` NULL, no user id, no IP/user-agent anywhere, `submitted_hour` truncated to the hour. The DB CHECK constraint enforcing this stays. The only write path is `rpc.submit_response` (token-validated, single transaction: mark `responded_at`, insert unlinked response).
3. RLS on every table, org-scoped via `app.is_org_member` / `app.has_role`. New table ⇒ RLS + policies in the same migration + a test.
4. Role semantics: `administrator` (settings/privacy/users), `redaktor` (create/send), `leser` (aggregates only — no quote-RPC group filters, no named free text).
5. Tokens hashed at rest (SHA-256), constant-time compare, expiry honored. Signed URLs only for Storage.
6. Zod validation at every server boundary. Service-role key server-side only.
7. No respondent free text in logs, error payloads, or analytics. Sentry scrubbing configured.
8. Schema changes only via `supabase/migrations/`. Never edit applied migrations; add new ones.

## Data-not-code
Question types, template packs, statutory duties, report sections, quality-flag rules, benchmarks, feature flags, and UI messages are **data** (seeded tables / registries). One renderer per question type keyed off the registry. Adding a pack/duty/language is a migration or a row, not a component.

## Testing gates (CI must be green to merge)
- `tsc --noEmit`, ESLint
- Unit tests (Vitest)
- **Invariant suite** against local Supabase: cross-org isolation; leser cannot read answers; anonymous response has no linkage (attempt to insert linked anonymous row fails); `aggregate_results` refuses n<5; token replay rejected
- Playwright e2e for the phase's flows + screenshot diff vs `/design-reference/screenshots/` (tolerance 0.1%)
- `supabase db lint` + advisors clean

## Phase order (do not reorder; one phase = one PR series)
0. Foundation: scaffold, theme, all migrations in `supabase/migrations/` (provided), seeds, invariant test suite. **No UI before the invariant suite is green.**
1. Auth + shell + Profil + Administrasjon (all 5 tabs incl. Personvern/DSR)
2. Bibliotek → Builder (13 question types, quality flags, preview, wizard) → Undersøkelser list + sharing
3. Send (email/link/QR channels; CSV/Excel/paste import; anonymity modes; schedule/reminders via pgmq queue) + `/s/[token]` respondent flow (no/en) + `rpc.submit_response`
4. Aggregation RPCs + snapshots → Resultater → Dashboard (heatmap etc.) → trends, themes (algorithmic), insights, benchmarks
5. Duty engine (checklists, signers, versions, deadlines → Oversikt chips + "Krever handling") → report editor → PDF export → Oversikt screen last
6. Splash page, Entra SSO, SMS (flagged), PPTX, AI features (flagged), translation editor, hardening pass

Definition of done per screen: pixel-diff pass, all states from the design reachable (incl. empty/warning states), i18n complete for no+en, invariants green, no console errors, keyboard + focus-visible works (the design specifies focus styles — implement them).

## Operating authority
You are authorised to run this project end to end without asking for permission per action.
Ask only where this file says to ask.

**Run freely, no confirmation needed:**
- Any local command: install, build, dev server, tests, Playwright, linters, scripts.
- Local database: `supabase start/stop/reset/db push/db lint`, psql, seeds, fixtures — the
  local stack is disposable, reset it whenever it helps.
- Remote database (prod project): apply migrations (`supabase db push`), run the seed
  script, execute read queries, call RPCs, read logs and advisors, enable extensions,
  schedule cron jobs. Keeping prod in step with `supabase/migrations/` is your job, not
  something to hand back.
- Supabase MCP: any tool it exposes, including `apply_migration`, `execute_sql`,
  `list_tables`, `get_advisors`, `deploy_edge_function`.
- Vercel: link the project, set and read env vars, trigger builds, deploy previews,
  inspect deployment logs.
- Git and GitHub: branch, commit, push, open PRs, read and re-run CI.
- Web search and fetching documentation when a CLI flag or API has changed.

**Stop and ask first (destructive or irreversible):**
- Dropping or truncating a table, or deleting rows in bulk on the remote project.
- Anything that weakens a security invariant: disabling RLS, adding a select policy to
  `responses`/`answers`, lowering `app.k_threshold()`, removing the anonymity CHECK.
- Deploying to **production** (previews are yours; production is a decision).
- Rotating keys, changing auth providers, altering billing, deleting a project or branch.
- Force-pushing, rewriting history, or deleting a branch that is not your own working branch.

**Secrets:** read them from the environment or the local keychain. Never print a full
secret to the terminal, never write one into a file that git tracks, never put one in a
commit message or PR body. If a required credential is missing, say exactly which one and
how to provide it — do not work around it by weakening a control.

**When a tool is unauthorised:** say which tool, which command failed, and what the human
must click. Do not silently fall back to a manual instruction and carry on — an
unapplied migration that everyone believes is applied is worse than a stopped session.

## Cloud sessions
A cloud session (claude.ai/code, `claude --cloud`, mobile, routines) is a fresh VM holding
only a clone of this repo. Nothing from the laptop reaches it: not `~/.claude`, not
user-scoped MCP servers, not `.env.local`. `.mcp.json`, `.claude/settings.json` and
`scripts/cloud-*.sh` are what configure it; `docs/CLOUD_SETUP.md` is the procedure.
- Database work goes through the `supabase` MCP server (execute_sql, apply_migration,
  get_advisors, generate_typescript_types). Do not look for a local Supabase CLI login —
  its installer pulls GitHub release assets the cloud proxy restricts, so it may be absent.
- To look at the app: start the dev server in the background, then use the `playwright` MCP
  server against http://localhost:3000. Screenshots land in `.playwright-mcp/` (gitignored).
  `localhost` is the tested path; `*.vercel.app` previews go through the VM's security proxy
  and headless Chromium may not reach them.
- The browser is whichever Chromium the image already ships, found via
  `PLAYWRIGHT_BROWSERS_PATH` by `scripts/playwright-mcp.sh`, which passes its path explicitly
  so the image's build number and the MCP server's pinned one may differ. Never run
  `playwright install` in a cloud session.
- Do not ask for confirmation on anything the permission rules allow. The deny list is the
  stop list, and it is narrower than the one in Operating authority above — the rules a
  classifier cannot pattern-match (bulk deletes, weakening an invariant, prod deploys) are
  still yours to honour unprompted.
- Writes to `.claude/`, `.mcp.json` and the hook scripts are never covered by allow rules;
  in Auto they go to the classifier and may be refused as self-modification. When that
  happens, say which file and hand over the content — do not route around it.

## Immutability triggers must permit referential maintenance
An append-only or freeze trigger written as "reject any UPDATE or DELETE" will collide
with PostgreSQL's own FK maintenance — `ON DELETE SET NULL` and cascades are UPDATEs and
DELETEs the database issues on your behalf — and the symptom is a parent row that cannot
be deleted, discovered far from the trigger. Write the rule as *"nobody may change this
content"*: compare the columns that carry meaning and reject only when they differ,
allowing FK-driven nulling of reference columns through. Decide the cascade behaviour
deliberately when the trigger is written, not when a delete fails. This has now been
rediscovered four separate times (D50, D51, D57, and the duty-archive case).

## Control substitution
The design's control is authoritative. Substituting a different control for layout or
convenience is restyling and is forbidden. The single exception: where the prototype's
control cannot express a real schema constraint — a free-text field standing in for a
foreign key, because the mock had no database behind it. Then use the real control,
styled exactly as that control class is styled elsewhere in the bundle, and log it as a
deviation with the constraint named (see D56).

## Never fabricate data in the UI
If a value does not exist in the schema, do not render a placeholder that looks like data
(a hard-coded `v1`, an invented count, a 0% derived from an unknown denominator). Render
the real state, render nothing, or render the design's empty/unknown treatment. A fake
value is worse than a gap: it is indistinguishable from a real one in review, and it
survives into screenshots and demos as though it were true.

## Verification
After every phase, run the protocol in VERIFY.md. No phase is complete until its Gate 6 report shows READY FOR REVIEW with evidence. Claims without evidence (command output, file:line, or a screenshot you opened) are not acceptable status.

**A phase gets ONE verification pass and ONE fix pass.** Findings from the fix pass are
logged to the next phase's list, never fixed in a third round. If the fix pass surfaces
something that genuinely cannot ship — a security invariant actually broken, not merely
untested — say so plainly and stop for a decision. Everything else is logged. A phase that
has had its two passes closes.

The verification apparatus itself is frozen: VERIFY.md's seven gates, Gate 5a3
(`verify:policy`), the test census (`tests/census.ts` + `tests/expected-counts.json`) and
the 5a3 allowlist are what exist and they are enough. Do not add gates, meta-checks,
manifests or rules mid-phase. Something interesting that surfaces gets logged for the next
phase, not built. Two numbers carry forward and may only move up: **55 of 71 surfaces
actively checked** by 5a3, and **18 files / 392 tests** in the census manifest.

## When ambiguous
If the design bundle and this file conflict, this file wins on security, the bundle wins on visuals. If something is genuinely unspecified (e.g., a hover state, an error state the prototype lacks), choose the minimal consistent option and log it in `docs/DEVIATIONS.md` — do not invent features.
