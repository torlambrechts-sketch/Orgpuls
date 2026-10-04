# Status

Updated 2026-10-04 by the session that restarted the run (DEC-49). Each work package updates this file when it ends.

| | |
| --- | --- |
| **Phase** | 0 done, gate accepted (DEC-45); Phase 1 next |
| **In progress** | — |
| **Next** | Apply the four held parts (`NEXT-SESSION.md`), merge Phase 0 to main, then WP-1.1 pipelines and deals |
| **Waiting for production** | `0195l_crm_purge`, `0196d_crm_access_removals`, `0197e_crm_companies_custom`, `0199f_crm_purge_runner`. Sessions started before Tor set the connector's tools to «Always allow» (2026-10-04) asked for approval on every call, and the prompts came back «cancelled». The run's session, started after the change, applies them first (`NEXT-SESSION.md`) |
| **Fails on production until those land** | Permanent delete in the restore list; removing a set or a group; teams; custom conditions on the companies list |
| **Keys wanted** | Phase 1 needs none. Phase 2 needs a Google Cloud OAuth client, a Microsoft Entra app registration, a Twilio account and number, and a Zoom app (`07` §6) |
| **Blocked on Tor** | Nothing |

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
