# The admin against the Phase A baseline

WP-0.7 (D-214), 2026-10-04: every admin page captured by `qa/e2e/admin-pages.spec.ts` at 1440 and at 390
(a plain 390 × 900 window, as the baseline was), compared by `scripts/verify/admin-baseline-diff.mjs` with
`screens/baseline/`. Pages that differ by 0.5 % or more are listed; 92 of 116 differ by less (dates and
times). Each listed page was opened and its change attributed:

| Page | Why it differs |
| --- | --- |
| audit, orgs_id | Data: every admin read is audited since WP-0.4 (D-211), and the harness's own runs add rows; the organisation page shows its audit trail |
| admins | Users & roles: permission sets, teams and visibility groups (WP-0.4, D-211) |
| ops | The CRM jobs card (WP-0.6, D-213) |
| crm_prospects_id, crm_contacts_id | History (WP-0.2, D-209), delete and restore (WP-0.3, D-210), who sees it (WP-0.4, D-211), custom fields (WP-0.5, D-212) |
| crm_prospects | Bulk delete (D-210) and the custom-condition filter (D-212) |
| crm_contacts | Import with custom columns (D-212) and the restore links (D-210) |
| cms_site | The route now opens the front page's editor (`?path=/`); the baseline caught its not-found state |
| crm_pipeline, crm_tasks, crm_inbox, crm | Data: the same cards and rows in another order, and days counted since a stage change or a due time |

| Width | Page | Height then → now | Differs |
| --- | --- | --- | --- |
| 1440 | audit | 1965 → 28926 px | 93.27 % |
| 390 | audit | 5207 → 29517 px | 83.96 % |
| 390 | cms_site | 900 → 1924 px | 56.87 % |
| 390 | admins | 1103 → 2504 px | 56.41 % |
| 1440 | ops | 1593 → 2972 px | 47.17 % |
| 390 | ops | 2016 → 3447 px | 43.02 % |
| 1440 | admins | 900 → 1558 px | 42.62 % |
| 1440 | orgs_id | 3552 → 5862 px | 39.66 % |
| 390 | orgs_id | 4986 → 7716 px | 35.80 % |
| 1440 | crm_contacts_id | 1684 → 2249 px | 26.52 % |
| 1440 | crm_prospects_id | 1863 → 2420 px | 24.97 % |
| 390 | crm_contacts_id | 2503 → 3130 px | 24.40 % |
| 1440 | cms_site | 900 → 1109 px | 23.92 % |
| 390 | crm_prospects_id | 2937 → 3559 px | 21.96 % |
| 390 | crm_prospects | 2919 → 2970 px | 9.22 % |
| 1440 | crm_prospects | 1783 → 1834 px | 7.60 % |
| 390 | crm_contacts | 3113 → 3158 px | 6.32 % |
| 1440 | crm_contacts | 2033 → 2060 px | 3.27 % |
| 390 | crm_tasks | 1113 → 1113 px | 2.43 % |
| 390 | crm_inbox | 1698 → 1698 px | 2.10 % |
| 390 | crm_pipeline | 1199 → 1199 px | 1.93 % |
| 390 | crm | 1862 → 1862 px | 0.67 % |
| 1440 | crm_inbox | 1068 → 1068 px | 0.63 % |
| 1440 | crm_tasks | 900 → 900 px | 0.54 % |

116 pages compared, 92 under 0.5 % left out.
No baseline (pages added since Phase A): 1440/crm_fields.png, 1440/crm_restore.png, 1440/settings_access.png, 1440/settings_integrations.png, 1440/settings_rules.png, 390/crm_fields.png, 390/crm_restore.png, 390/settings_access.png, 390/settings_integrations.png, 390/settings_rules.png.
