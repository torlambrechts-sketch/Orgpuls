# Runbook: the run

For every session that continues the CRM enrichment, from 2026-10-04 (DEC-49; Tor: "You are allowed to start
sessions! I already gave you permission"). CLAUDE.md's rules apply: decide and log, no questions except about a
feature's behaviour or after three failed attempts, no stops, no review waits. The plan is
`07-IMPLEMENTATION-PLAN.md`; where the work stands is `STATUS.md`.

## Start

1. Work on branch `ccr-39a2fb73-jgkg09`. If the session was given another branch, merge this one into it first
   (merge, never rewrite).
2. Read `CLAUDE.md`, this runbook, `07-IMPLEMENTATION-PLAN.md`, `STATUS.md` and `DECISIONS.md` from DEC-40.
3. Start the local stack with `bash scripts/qa/cloud-up.sh`, then `node scripts/seed/sentral-fixture.mjs`.
4. Carry on from «Next» in `STATUS.md`.

## First: the four held parts

Production is Supabase project `jmhhszsnjfqgclxzhciq`, reached through the Supabase connector. The four files in
`held-parts/` are copied exactly from the migrations and are applied exactly as they are. Tor set the connector's
tools to «Always allow» on 2026-10-04. Sessions started before that asked for approval on every call, and their
prompts came back «cancelled». A session started after the change applies them with no prompt.

| Order | File | `apply_migration` name | What it does | Record in |
| --- | --- | --- | --- | --- |
| 1 | `0195l_crm_purge.sql` | `0195l_crm_purge` | `app.crm_purge`, `app.crm_purge_due`, closed to clients; the nightly job | D-220 |
| 2 | `0196d_crm_access_removals.sql` | `0196d_crm_access_removals` | removing a set or a group, saving or removing a team | D-221 |
| 3 | `0197e_crm_companies_custom.sql` | `0197e_crm_companies_custom` | the companies list takes custom-field conditions (the three-argument form goes) | D-222 |
| 4 | `0199f_crm_purge_runner.sql` | `0199f_crm_purge_runner` | the purge job runs through `app.crm_run`, counted and monitored | D-223 |

**Before (read-only).** Production on 2026-10-04 held none of the seven objects below and no `orgpuls-crm-purge`
job. It held `public.admin_crm_companies(text, text, uuid)` with md5 `7b2395e7ca2c26560a8f44fd2f9531e8`,
`app.crm_run(text)` with md5 `98430e8db983e15f3731b46a618593a5`, and `app.crm_limit(text)`. md5 here is always
`md5(rtrim(pg_get_functiondef(oid), E'\n'))`.

**After.** The same query must give exactly this. A dry run on 2026-10-04, applying the four files to the local build
without these objects, reproduced it.

| Object | md5 | `anon` may execute | `authenticated` may execute |
| --- | --- | --- | --- |
| `app.crm_purge(text, uuid[])` | `07a5fb8190bdfdccbd4af4f3ac64f59a` | no | no |
| `app.crm_purge_due()` | `7a662708314786d2513a8faec1bcb3cf` | no | no |
| `public.admin_crm_set_delete(uuid, text)` | `f5fbb99e2ad42f186741e26777989522` | no | yes |
| `public.admin_crm_group_delete(uuid, text)` | `34f492aa597dc2921dba410a875a85bc` | no | yes |
| `public.admin_crm_team_save(uuid, text, uuid, uuid[], text)` | `d4bc3e35821d08c021fb26a5a37ab4ed` | no | yes |
| `public.admin_crm_team_delete(uuid, text)` | `4b7f28e6650f4999fb482508d4e5133b` | no | yes |
| `public.admin_crm_companies(text, text, uuid, jsonb)` | `8d1a1dc3db63ae211c6e205003fb55e7` | no | yes |
| `public.admin_crm_companies(text, text, uuid)` | gone | | |
| job `orgpuls-crm-purge` | `25 2 * * *`, `select app.crm_run('crm_purge')` | | |

**Advisors.** The security advisors held 488 findings on 2026-10-04: 304 `authenticated` definer calls, 31 `anon`,
152 tables with RLS and no policy, and the leaked-password setting. Afterwards expect 492: the four 0196d calls are
added, the companies list's three-argument form is replaced by its four-argument form, and nothing else changes.

**Record** each landed part in its D-entry's hosted paragraph, replacing its «Not yet on hosted» sentence (date,
md5 check, grants, advisor change). Update `05-GAP-FEATURES.md` where a status depends on these parts, and
`STATUS.md`. If a call still asks for approval, do not retry it in a loop. Record it in `STATUS.md`, tell Tor
once in one line, and go on with Phase 1 on the branch. The merge waits for the parts (DEC-45).

## Then: Phase 0 to main

1. Run the gates on a rebuilt local stack:
   - `bash scripts/qa/cloud-up.sh --reset`, then the fixture;
   - `npm run test:db`, `npx vitest run`, `npm run e2e -- --project admin --project admin-phone`;
   - tsc, lint, `npm run verify:i18n`, `npx next build`.
2. Merge main into the branch. Renumber this branch's D-entries once, to the numbers free on main, with a note
   mapping old to new (DEC-32). This branch's `0191` gives way to main's `0198` (DEC-36). The CI step «Admin smoke»
   moves into main's single job.
3. Open a PR to main and merge it once CI is green.

## The loop: every work package

1. **Build** it as `07` §4 describes. Migrations are numbered from `0202` (main took `0201`, DEC-51). Each package brings its server code,
   screens, `en` and `no` messages and tests.
2. **Prove it locally:**
   - the database rebuilt from the migrations, with `npm run test:db`;
   - vitest, tsc, lint, `npm run verify:i18n`, the build;
   - the admin harness over the areas the package touches;
   - its screens with `scripts/qa/admin-shots.mjs`, into `screens/phase-<n>/`.
3. **Production:** apply the package's migrations whole with `apply_migration`. Then check two things: the changed
   functions match the local build (md5), and `scripts/audit/advisors-diff.py` shows only what the package intends.
4. **Record:**
   - a D-entry in `docs/DEVIATIONS.md`, saying what was built and what differs from the brief;
   - the statuses in `05-GAP-FEATURES.md`;
   - the package's rows in the phase report's security table;
   - `STATUS.md`.
5. **Commit and push**, then start the next package.

At the end of a phase, run its gate flows and write `reports/phase-<n>.md` (INSTRUCTIONS.md A11's contents). Then
open a PR to main and merge it once CI is green. Tor reads the reports when Tor chooses.

## Keeping going

Go from package to package without stopping. If a turn ends before the plan does, schedule the next with
`send_later` (claude-code-remote MCP), a few minutes ahead, with the message «Continue the CRM run from STATUS.md».
Stop scheduling when:

- the plan is complete; or
- one blocker has failed three times and only Tor can clear it. Then say so in one line, and name it in
  `STATUS.md`.

Decisions taken on the way go into `DECISIONS.md` as Claude's calls. A package that needs an outside service is
built and tested against the provider's API; its screens say «Not connected» until the key is in, and the key is
listed in `STATUS.md`.
