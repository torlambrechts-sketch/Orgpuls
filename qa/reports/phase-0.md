# Engagement phase 0 — Foundation

Branch `feat/engagement-p0`. The hand-off is docs/implementation/engagement-phases.md; the
decisions taken for it are in docs/DECISION_LOG.md (2026-09-26, 2026-09-27) and
docs/DEVIATIONS.md (D-121, D-123).

## How the gates run here

| Gate | Command | Notes |
| --- | --- | --- |
| G1 | `npm run typecheck && npm run lint` | The repository uses npm; the document's `pnpm` commands are the same scripts |
| G2 | `npm test && npm run test:db && npm run e2e -- --grep @p0.2` | `test:db` runs all 44 SQL suites (participation_invariants included) against the local stack |
| G3 | `npm run test:invariants` | tests/invariants/invariants.sql (I1, I2, I4–I7) and qa/e2e/invariants.spec.ts (I3) |
| G4 | `npm run qa:visual -- --step p0.2`, then every PNG opened | |
| G5 | `npm run e2e && npm run qa:visual -- --all` | |

The QA stack is the Supabase CLI's local stack (`npm run qa:up`) and never the hosted
project. `scripts/qa/seed.mjs` refuses any non-loopback database or Supabase URL, and did so
in this session when the environment still pointed at production.

## P0.1 Discovery and flags

- docs/implementation/step0-findings.md is reused; its § 4 maps the engagement document onto
  the schema.
- The fourteen flags are in lib/flags.ts. They are off unless named in `ORGPULS_FLAGS`; the QA
  stack runs with `*`.

## P0.2 QA harness, seed and baselines

| Screen id | Project | Screenshot | Global checklist | Step checklist | Notes |
| --- | --- | --- | --- | --- | --- |
| r-intro | mobile | qa/screenshots/p0/p0.2/r-intro-mobile.png | pass | pass (recorded) | The flow has no intro screen of its own; the first screen is statement 1. Out of scope here; phase 1 adds the picker to an intro |
| r-intro | small | qa/screenshots/p0/p0.2/r-intro-small.png | pass | pass (recorded) | As above |
| r-question | mobile | qa/screenshots/p0/p0.2/r-question-mobile.png | pass | pass | |
| r-question | small | qa/screenshots/p0/p0.2/r-question-small.png | pass | pass | |
| r-submit | mobile | qa/screenshots/p0/p0.2/r-submit-mobile.png | pass | pass | The last statement with "Send inn"; nothing is submitted, so the link stays fresh |
| r-submit | small | qa/screenshots/p0/p0.2/r-submit-small.png | pass | pass | |
| m-results | desktop | qa/screenshots/p0/p0.2/m-results-desktop.png | fail 4 (recorded) | pass | axe color-contrast on 2 nodes (`text-faint` #8a8272 on #fffdf6, 3.74:1). Pre-existing design token; recorded in qa/known-issues.json, not fixed (§ P0.2) |
| m-factor | desktop | qa/screenshots/p0/p0.2/m-factor-desktop.png | fail 4 (recorded) | pass | Same two nodes |
| m-actions | desktop | qa/screenshots/p0/p0.2/m-actions-desktop.png | pass | pass | |
| m-comments | desktop | qa/screenshots/p0/p0.2/m-comments-desktop.png | pass | pass | |

Global checklist item 6 now holds on every screen: Økonomi (n = 3) shows no number, band or
count, and neither does Salg, which shields it.

### Baselines

- **Created:** all ten (qa/baselines/{mobile,small,desktop}/…).
- **Intentionally updated:**
  - `m-results` and `m-factor` after 0073 (D-123). The heat map no longer prints "6 svar"
    and "3 svar" beside Salg and Økonomi.
  - `m-actions` because the seed rebuilt the two live measures' deadlines around the day it
    ran (D-121).

Two captures of the same seed compared clean.

## P0.3 Invariants on the current product

**First run: I4 failed.** Participation was shown per group, including live counts for a
group of three. This was a hard stop, reported in qa/BLOCKED.md, and Tor decided (DECISION_LOG
2026-09-27). The fix shipped to main as 0073 (D-123): no participation count for a group
under k, nor for one that would give it away. BLOCKED.md was removed with the fix merged in.

**Second run: all green.**

| Id | Result | Evidence |
| --- | --- | --- |
| I1 | pass | No reader returns a value for Økonomi; Salg is `protected` with it |
| I2 | pass | No column or foreign key on any respondent-content table names a person, an invitation or a token (the list includes the tables later phases add) |
| I3 | pass (mobile, small) | /s/{token}: no foreign or analytics request; nothing but the page carries the token; the server log has no token, user agent or address |
| I4 | pass | Participation and `n` are null for Økonomi and Salg; no client-callable function returns who answered |
| I5 | pass | Every token column is a bytea `_hash`; Lumio's invitations are 32-byte digests |
| I6 | pass | No locale or language column on answer or content tables |
| I7 | pass | No client-callable function queues a message to non-responders; no client may read invitations |

**axe summary:** eight of ten captures are clean. The two recorded color-contrast findings
are in qa/known-issues.json.
