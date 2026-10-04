# Next session: the held production parts, then the merge

Updated 2026-10-04 after the Phase 0 report (`reports/phase-0.md`) and Tor's review (DEC-44 to DEC-47). The report is written and the gate is accepted (DEC-45), so this session does **step 1 only**, then the merge. Before opening it, Tor checks claude.ai › Customize › Connectors › Supabase › tool permissions: `apply_migration` → allowed (DEC-44).

Written 2026-10-04 at the end of WP-0.8 (DEC-39, DEC-40). The WP-0.8 session opened this session at Tor's word
(DEC-42). It starts from branch
`ccr-39a2fb73-jgkg09` at `afb2343` or later; if the session is given another branch, bring this one into it first
(merge, never rewrite), so the Phase 0 work is there. Read `CLAUDE.md`, `docs/IMPLEMENTATION_PLAN.md`,
`docs/DECISION_LOG.md`, `docs/DEVIATIONS.md` (D-207 to D-215), `INSTRUCTIONS.md` (R10, R11, A10, A11) and
`DECISIONS.md` before starting.

Production is Supabase project `jmhhszsnjfqgclxzhciq` (eu-central-1), reached through the Supabase connector.

## 1. Apply the four held parts, in this order

Each was held at the Supabase connector's approval step on claude.ai because its text holds `delete from` or
`drop function` (DEC-28, DEC-29, DEC-33, DEC-34). The connector's permission is read when a session starts, which is
why this is a new session; Tor allows `apply_migration` there before opening it (DEC-41). The files are in `held-parts/`, copied exactly from the migrations, and are applied
exactly as they are.

| Order | File | `apply_migration` name | What it does | Record in |
| --- | --- | --- | --- | --- |
| 1 | `0195l_crm_purge.sql` | `0195l_crm_purge` | `app.crm_purge`, `app.crm_purge_due`, closed to clients; the nightly job | D-210 |
| 2 | `0196d_crm_access_removals.sql` | `0196d_crm_access_removals` | removing a set or a group, saving or removing a team | D-211 |
| 3 | `0197e_crm_companies_custom.sql` | `0197e_crm_companies_custom` | the companies list takes custom-field conditions (the three-argument form goes) | D-212 |
| 4 | `0199f_crm_purge_runner.sql` | `0199f_crm_purge_runner` | the purge job runs through `app.crm_run`, counted and monitored | D-213 |

**Before (drift check, read-only).** Production on 2026-10-04 held none of the seven objects below and no
`orgpuls-crm-purge` job. It held `public.admin_crm_companies(text, text, uuid)` with md5 `7b2395e7ca2c26560a8f44fd2f9531e8`,
`app.crm_run(text)` with md5 `98430e8db983e15f3731b46a618593a5`, and `app.crm_limit(text)`. md5 here is always
`md5(rtrim(pg_get_functiondef(oid), E'\n'))`. If anything differs, stop and find out why before applying.

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

**Advisors.** Production's security advisors held 488 findings on 2026-10-04: 304 `authenticated` definer calls,
31 `anon`, 152 tables with RLS and no policy, and the leaked-password setting. Afterwards expect 492: the four 0196d
calls are added, the companies list's three-argument form is replaced by its four-argument form, and nothing else
changes. The `anon` class stays at 31.

**If the connector still holds a call,** do not retry it, split it differently or reword it to get past the
pattern. Tell Tor which call is held and that it needs approving at claude.ai › Customize › Connectors › Supabase
› tool permissions (`apply_migration` → allowed, DEC-28). Then stop without merging (§ 2, last paragraph).

On 2026-10-04, after Tor's go-ahead (DEC-42), the WP-0.8 session tried `0195l_crm_purge` once. The connector
answered «MCP tool call requires approval», and nothing reached the project.

**Record** each landed part in its D-entry's hosted paragraph, replacing its «Not yet on hosted» sentence. Write
the date, the md5 check, the grants and the advisor change, as the earlier parts were recorded. Also update
`05-GAP-FEATURES.md` where a status depends on these parts (the purge, CRM-12; sets, groups and teams, SEC-07 to
SEC-09; custom conditions on the companies list, CUS-01).

On 2026-10-04 the Phase 0 report session ran the drift check twice, and both matched the table above. It tried
`0195l`, `0196d` and `0197e` once each and `0195l` once more after the report. Every call was held, and production
is unchanged at 488 advisor findings (DEC-43).

## 2. When all four have landed: the merge

The gate is accepted (DEC-45) and the deviations without a recorded decision are accepted (DEC-46). Once the four
parts are on production and verified as above:

1. Re-run the gates on a rebuilt local stack: `npm run test:db`, `npx vitest run`,
   `npm run e2e -- --project admin --project admin-phone`, tsc, lint, `npm run verify:i18n`, `npx next build`. The
   figures to match are in `reports/phase-0.md` § 5 (122 suites, 792 unit tests, 143 admin tests).
2. Merge to main (DEC-23) through a pull request, never by rewriting history.
3. Renumber this branch's D-entries once, to the numbers free on main, with a note mapping old to new (DEC-32).
4. Move the CI step «Admin smoke» into main's single job.
5. Let this branch's `0191` give way to main's `0198` (DEC-36).

**If any part is still held,** do not merge. The admin screens would reach production users with permanent delete,
removing sets and groups, teams and custom conditions failing. Record the hold in D-210 to D-213 and stop for Tor.

## 3. Stop for Tor

End with what landed, the merge or why it waits, and any question left, asked as `CLAUDE.md` says.
