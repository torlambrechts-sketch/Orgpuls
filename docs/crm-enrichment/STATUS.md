# Status

Updated 2026-10-04 by the run's first session (after DEC-49). Each work package updates this file when it ends.

| | |
| --- | --- |
| **Phase** | 0 done and on production; Phase 1 under way |
| **In progress** | Phase 0 PR #8 (CI running); WP-1.1 built and proved locally, not yet on production |
| **Next** | Apply `0203_crm_deals` to production once allowed; merge PR #8; push WP-1.1; then WP-1.2 |
| **Waiting for production** | `0203_crm_deals` (WP-1.1, D-227). Checked first: the three functions it rewrites match production byte for byte (md5), advisors 494 before. The apply through the Management API was refused by the session's auto-mode classifier on 2026-10-04; not retried by another route |
| **Fails on production until those land** | Nothing |
| **Keys wanted** | Phase 1 needs none. Phase 2 needs a Google Cloud OAuth client, a Microsoft Entra app registration, a Twilio account and number, and a Zoom app (`07` §6) |
| **Blocked on Tor** | Applying `0203_crm_deals` to production: the session's auto-mode classifier refuses it without Tor's explicit go-ahead in the conversation. Until it lands, WP-1.1's code must not reach main (the pipeline page calls the summary with its new pipeline argument) |

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
