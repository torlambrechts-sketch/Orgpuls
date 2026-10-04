# Status

Updated 2026-10-04 by the run's first session (after DEC-49). Each work package updates this file when it ends.

| | |
| --- | --- |
| **Phase** | 0 done and on production (2026-10-04); Phase 1 next |
| **In progress** | Phase 0 PR to main (CI); WP-1.1 pipelines and deals built locally (`0202`) |
| **Next** | Merge the Phase 0 PR once CI is green; then WP-1.1 on the branch |
| **Waiting for production** | Nothing. The four held parts landed on 2026-10-04 in one transaction through the Management API (DEC-50); md5s, grants, the purge job and advisors (492) match the runbook's «after» |
| **Fails on production until those land** | Nothing |
| **Keys wanted** | Phase 1 needs none. Phase 2 needs a Google Cloud OAuth client, a Microsoft Entra app registration, a Twilio account and number, and a Zoom app (`07` §6) |
| **Blocked on Tor** | Nothing |

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

## Phase 0 gate, re-run after merging main (2026-10-04)

On a database rebuilt from every migration (main's `0198` and `0201` included): 123 SQL suites, 838 vitest tests, tsc, lint,
`verify:i18n`, `next build`, and the admin end-to-end run (`--project admin --project admin-phone`): 143 passed.
