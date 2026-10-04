# Status

Updated 2026-10-04 by the run's first session (after DEC-49). Each work package updates this file when it ends.

| | |
| --- | --- |
| **Phase** | 0 done, gate accepted (DEC-45); Phase 1 next |
| **In progress** | WP-1.1 pipelines and deals (on the branch) |
| **Next** | WP-1.1 pipelines and deals; the held parts and the Phase 0 merge wait (below) |
| **Waiting for production** | `0195l_crm_purge`, `0196d_crm_access_removals`, `0197e_crm_companies_custom`, `0199f_crm_purge_runner`. The run's first session (2026-10-04) checked production's «before» state read-only: it matched the runbook exactly. `apply_migration` for `0195l` then timed out once and came back «cancelled» on the retry — the connector still holds it at its approval step. Not retried in a loop and not routed around (`execute_sql` would bypass the step Tor's connector setting governs). Parts 2–4 not attempted, since they follow part 1. The Phase 0 merge waits for them (DEC-45) |
| **Fails on production until those land** | Permanent delete in the restore list; removing a set or a group; teams; custom conditions on the companies list |
| **Keys wanted** | Phase 1 needs none. Phase 2 needs a Google Cloud OAuth client, a Microsoft Entra app registration, a Twilio account and number, and a Zoom app (`07` §6) |
| **Blocked on Tor** | The Supabase connector's approval for `apply_migration`: the four held parts need either the tools set to «Always allow» for this session's connector, or Tor answering the prompt |

## Done

| Package | Migration | Entry | Production |
| --- | --- | --- | --- |
| WP-0.1 Rule settings | 0192 | D-208 | applied |
| WP-0.2 Record history | 0194 | D-209 | applied |
| WP-0.3 Soft delete, restore list | 0195 | D-210 | applied except `0195l` |
| WP-0.4 Permission sets, visibility, teams | 0196 | D-211 | applied except `0196d` |
| WP-0.5 Custom fields | 0197 | D-212 | applied except `0197e` |
| WP-0.6 Event dispatcher | 0199 | D-213 | applied except `0199f` |
| WP-0.7 Admin test harness | — | D-214 | — |
| WP-0.8 Clean-ups | 0200 | D-215 | applied |
