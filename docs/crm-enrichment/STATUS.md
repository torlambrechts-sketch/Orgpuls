# Status

Updated 2026-10-05 (third attempt at 0203; see «Waiting for production»). Each work package updates this file when it ends.

| | |
| --- | --- |
| **Phase** | 0 done and on production; Phase 1 under way |
| **In progress** | Phase 0 PR #8 (CI running); WP-1.1 built and proved locally, not yet on production |
| **Next** | Apply `0203_crm_deals` to production once allowed; merge PR #8; push WP-1.1; then WP-1.2 |
| **Waiting for production** | `0203_crm_deals` (WP-1.1, D-227). Checked first: the three functions it rewrites match production byte for byte (md5), advisors 494 before (re-captured 2026-10-04 evening: still 494, `0203` not in `list_migrations`). Two attempts, both refused: the Management API (auto-mode classifier, earlier session), and the Supabase connector's `apply_migration` (2026-10-04 evening, a session started after `.claude/settings.json` allowed `mcp__Supabase__apply_migration`): the call came back «cancelled» and nothing was applied (`app.crm_deals` and `app.crm_pipelines` do not exist). Not retried by another route. Third attempt 2026-10-05, in a session started after commit b5c84d8 (`.claude/settings.json` valid JSON, allowing `mcp__Supabase__*` and `mcp__c7672d37-e57c-4a13-980b-4792691c4c12`): before the call production had no `0203` in `schema_migrations`, no `app.crm_deals`, no `app.crm_pipelines`; `apply_migration` (name `0203_crm_deals`, the file verbatim, md5 `b7f6687965a6643d7b968219ac2cb070`) came back «cancelled»; re-checked afterwards: still none of the three. Read-only `execute_sql` calls on the same connector went through without a prompt, so the refusal is specific to `apply_migration`. No other route tried |
| **Fails on production until those land** | Nothing |
| **Keys wanted** | Phase 1 needs none. Phase 2 needs a Google Cloud OAuth client, a Microsoft Entra app registration, a Twilio account and number, and a Zoom app (`07` §6) |
| **Blocked on Tor** | Applying `0203_crm_deals` to production. Three attempts through the connector's `apply_migration` failed (2026-10-04/05): twice «cancelled», once after Tor said he would approve the call; the reconnected connector then timed out after 60 s twice, and nothing landed (no `app.crm_deals`, no `0203_crm_deals` row in `schema_migrations`, nothing left running). A fourth, 2026-10-05 in another session (after b5c84d8): «cancelled» again, production re-checked unchanged. The way through: paste `held-parts/0203-paste-into-sql-editor.sql` (the migration as written, in one transaction, which also records the migration) into the SQL editor and click Run. The next session then runs the checks (md5 against a local build, one primary deal per company, the advisors diff from 494). Until 0203 lands, WP-1.1's code must not reach main (the pipeline page calls the summary with its new pipeline argument) |

## Done

| Package | Migration | Entry | Production |
| --- | --- | --- | --- |
| WP-0.1 Rule settings | 0192 | D-218 | applied |
| WP-0.2 Record history | 0194 | D-219 | applied |
| WP-0.3 Soft delete, restore list | 0195 | D-220 | applied |
| WP-0.4 Permission sets, visibility, teams | 0196 | D-221 | applied |
| WP-0.5 Custom fields | 0197 | D-222 | applied |
| WP-0.6 Event dispatcher | 0199 | D-223 | applied |
| WP-0.7 Admin test harness | — | D-224 | — |
| WP-0.8 Clean-ups | 0200 | D-225 | applied |
| WP-1.1 Pipelines and deals | 0203 | D-227 | waiting (see above) |

## Phase 0 gate, re-run after merging main (2026-10-04)

On a database rebuilt from every migration (main's `0198` and `0201` included): 123 SQL suites, 838 vitest tests, tsc, lint,
`verify:i18n`, `next build`, and the admin end-to-end run (`--project admin --project admin-phone`): 143 passed.
