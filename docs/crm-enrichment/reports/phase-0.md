# Phase 0 report — Foundations

Written 2026-10-04 on branch `ccr-39a2fb73-jgkg09`, from `6d2d8bb` (the handover `afb2343` plus the brief's
decision entries), for Tor's review (`INSTRUCTIONS.md` A5, A11; DEC-23). Every figure below was re-run in this
session, on a local stack rebuilt from migrations (`supabase start`, CLI 2.119.0, then `npm run qa:up`). None was
copied from the handover. Where a figure differs from the handover, the report says so.

**Summary.** The eight work packages WP-0.1 to WP-0.8 are built and their gates pass locally. Production holds
every Phase 0 migration **except the four held parts**. In this session the Supabase connector held each part
again («MCP tool call requires approval»), and nothing reached the project (§ 1). The exit gate's four flows
and its custom-field journey pass end to end on the local stack. The Phase 0 scope is met for each flow, but only
one of the four (SF-02) is fully Implemented; § 3 says which steps belong to later phases. Tor decides whether
that meets the gate (question 2).

## 1. Production: the four held parts

| Order | Part | Drift check before (read-only) | Applied | Record |
| --- | --- | --- | --- | --- |
| 1 | `0195l_crm_purge` | Matched the brief: none of the seven objects, no `orgpuls-crm-purge` job; `admin_crm_companies(text, text, uuid)` `7b2395e7…`, `app.crm_run(text)` `98430e8d…`, `app.crm_limit(text)` present | **Held** at the connector, once | D-210 |
| 2 | `0196d_crm_access_removals` | Same check (objects independent of 0195l) | **Held**, once | D-211 |
| 3 | `0197e_crm_companies_custom` | Same check | **Held**, once | D-212 |
| 4 | `0199f_crm_purge_runner` | — | **Not tried**: it schedules the purge through the runner, which would fail every night while `app.crm_purge_due()` is absent (D-213) | D-213 |

After the holds, the same read-only query gave the same state as before. No new function or job exists,
`admin_crm_companies(text, text, uuid)` keeps its md5, and `supabase_migrations` lists no `0195l`, `0196d`,
`0197e` or `0199f`. The security advisors hold the same **488** findings: 304 `authenticated` definer calls, 31
`anon`, 152 tables with RLS and no policy, and the leaked-password setting. The brief's expected 492 depends on
the parts landing.

What this means on production until the parts land (as D-210 to D-213 record): nothing is purged, and «Delete
permanently» answers `failed`. Sets and groups cannot be removed, and no team can be made. The companies list has
no custom conditions. The monitor shows the restore list purge as not scheduled. The admin screens that call these
ship only with the merge, so no production user meets them before then (DEC-23). **The parts must land before
the merge.**

The retry the brief asks for after this report is recorded in § 10.

## 2. IDs completed, with status changes

From the history of `05-GAP-FEATURES.md` over the Phase 0 commits (`226797b` → `a51d175`). Totals went from
0 Implemented, 52 Partial, 127 Missing, 4 Conflict to **1 Implemented, 59 Partial, 119 Missing, 4 Conflict**.

| ID | Before | After | Package |
| --- | --- | --- | --- |
| CUS-04 Formula fields | Missing | **Implemented** | WP-0.5 |
| SF-02 Record change and event publication | Missing | **Implemented** | WP-0.2, WP-0.6 |
| CUS-01 Custom fields | Missing | Partial | WP-0.5 |
| CUS-02 Field quality rules | Missing | Partial | WP-0.5 |
| CUS-03 Pipeline-specific and read-only fields | Missing | Partial | WP-0.5 |
| CRM-12 Restore data | Missing | Partial | WP-0.3 |
| PIP-17 Duplicate and restore | Missing | Partial | WP-0.3 |
| SEC-08 Visibility groups | Missing | Partial | WP-0.4 |
| AUT-09 Monitoring and limits | Missing | Partial | WP-0.6 |
| SF-38 Field and configuration registry | Missing | Partial | WP-0.5 |
| CUS-07, SEC-07, SEC-09, PIP-04, PIP-10, PIP-12, CRM-01, CRM-09, INS-10 | Partial | Partial, with more evidence | WP-0.1–0.8 |
| SF-01, SF-15, SF-26, SF-32, SF-35 | Partial | Partial, with more evidence | WP-0.2–0.6 |
| UF-02 Work a deal to won or lost | 0 / 3 / 4 | 1 / 2 / 4 (step 4 Implemented) | WP-0.5 |
| UF-09 Set up the sales process | 0 / 2 / 3 | 1 / 2 / 2 (step 2 Implemented) | WP-0.5 |
| Settings: contact rule, consent source on import, typed reason | Conflict / Partial | Implemented | WP-0.1 |
| Settings: second-admin approval, days in the restore list | Missing / — | Implemented | WP-0.3 |
| Setting: who sees a new company | — | Implemented | WP-0.4 |
| Settings: count limits, technical safeguards | Missing | Partial | WP-0.1, 0.4, 0.5, 0.6 |
| Test data (NFR) | Partial | Implemented | WP-0.7 |
| Job runtime, Monitoring (NFR) | Partial | Partial, with more evidence | WP-0.6 |

**Found in this review:** `SF-34 Rule settings` still reads «Missing» in `05-GAP-FEATURES.md:430`. Nothing
updated it when WP-0.1 built the registry. It is a gate flow, and its evidence is in § 3. The row is corrected to
Partial in this commit.

## 3. The exit gate

`07-IMPLEMENTATION-PLAN.md` § 3: *a custom field works end to end on existing companies and contacts; SF-01, SF-02,
SF-34, SF-38.* Run on the local stack. Production cannot be exercised through the admin screens until they ship
with the merge (DEC-23).

| Gate item | Evidence (re-run 2026-10-04) | Result | Steps outside Phase 0 |
| --- | --- | --- | --- |
| A custom field end to end on existing companies and contacts | Journey `a custom field: added, on the form and the page, filled, and archived` (`qa/e2e/admin-journeys.spec.ts:113`); `crm_fields_invariants.sql` (CFI 1–12: reads, filters, import, history, hidden/read-only, formulas, versions) | **Pass** | — |
| SF-01 Permission and visibility check | `crm_access_invariants.sql` (CAI: role gate, set, visibility owner/group/sub-groups/everyone, refusals, audit, firewall through helpers), `crm_campaign_access_invariants.sql`; CFI 5 (field rules); journey `a deal: … deleted, restored and removed for good` | **Pass** for steps 1–4 and 6 | Step 5, entitlements (ENT-01) |
| SF-02 Record change and event publication | `crm_history_invariants.sql` (CHI 2, 6: change, changelog and event in one transaction), `crm_events_invariants.sql` (CEI 2, 3, 6: once per subscriber, retries that block no one); journey `operations: the CRM jobs …` | **Pass**, Implemented | Further subscribers as they are built |
| SF-34 Rule settings | `crm_rules_invariants.sql` (19 checks): the registry is asked (17), defaults refuse nothing (2–5), each rule on blocks and names its setting (6–11), every change logged (12–14) | **Pass** for steps 1, 2, 4, 5 | Step 3 «warn»: no rule warns today. Step 6: the firewall is outside the registry by construction (the registry's areas are contacts, audit, limits, deletion, access), but no test asserts it |
| SF-38 Field and configuration registry | CFI 2, 4, 7, 8, 9 (versioned rows, readers, quality rules on save and stage move) | **Pass** for steps 1–3 within companies and contacts | Translations and the catalogue (CUS-05), reports and API (INS, INT), the demo tenant's configuration (CUS-08) |

## 4. Migrations added

| Migration | Package | Deviation entry | On production |
| --- | --- | --- | --- |
| `0191_crm_definer_grants.sql` | Q1 fix | D-207 | Yes (2026-10-03). Main carries it as `0198` (PR #7, D-216 there); this copy gives way at the merge (DEC-36) |
| `0192_crm_rule_settings.sql` | WP-0.1 | D-208 | Yes |
| `0193_crm_engagement_window.sql` | WP-0.1 (DEC-22) | D-208 | Yes |
| `0194_crm_record_history.sql` | WP-0.2 | D-209 | Yes (with `_track_body`) |
| `0195_crm_soft_delete.sql` | WP-0.3 | D-210 | In parts `0195a`–`0195k`; **`0195l` (the purge) held** |
| `0196_crm_access.sql` | WP-0.4 | D-211 | In parts `0196a`–`c`, `e`–`n`; **`0196d` held** |
| `0197_crm_fields.sql` | WP-0.5 | D-212 | In parts `0197a`–`d`, `f`, `g`; **`0197e` held** |
| `0199_crm_dispatcher.sql` | WP-0.6 | D-213 | In parts `0199a`–`e`; **`0199f` held** (waits for `0195l`) |
| `0200_crm_cleanups.sql` | WP-0.8 | D-215 | Yes |

`0198` is main's, from PR #7 (D-216 there). WP-0.7 added no migration (D-214).

## 5. Tests

| Kind | Command | Result 2026-10-04 | Handover |
| --- | --- | --- | --- |
| Database | `npm run test:db` on the rebuilt stack | **122 of 122 suites pass**, including the design figures | 122 ✓ |
| Unit | `npx vitest run` | **792 tests in 74 files pass** | 792 / 74 ✓ |
| End-to-end, admin | `npm run e2e -- --project admin --project admin-phone` | **143 of 143 pass** (13.4 min): the sign-in setup, three journeys, 63 pages at 1440 and at 390, the smoke at both widths, teardown | 143 |
| Visual | `screens/phase-0/report.json` (WP-0.4–0.8 captures) | 73 of 73 captures: HTTP 200, no overflow, no console error (§ 6) | — |
| Accessibility | axe on every admin page at 1440 and 390 in the run above; `qa/known-issues.json` | **No violation** on any of the 63 admin pages at either width. `qa/known-issues.json` has no admin entry (WP-0.8 cleared the nine 390 px scroll regions); its two entries are respondent pages | — |
| Type check, lint, i18n, build | `npx tsc --noEmit`, `npm run lint`, `npm run verify:i18n`, `npx next build` | all exit 0 | ✓ |
| `supabase db lint --local --level warning` | | exit 0; **warnings in 22 functions**: 16 of the "variable initialised from a text literal" kind (`'{}'` into `text[]`/`jsonb`), and 6 older ones with unused or shadowed variables, a missing RETURN or an IMMUTABLE marking. Five of the 16 are Phase 0's (`app.crm_formula_compile`, `app.crm_formula_eval`, `app.crm_custom_import`, `app.crm_field_value`, `public.admin_crm_import`), as WP-0.5's checklist recorded; the rest predate Phase 0 | **Differs**: the handover said one warning, in `admin_ticket_update` |
| Wiring audit | `node scripts/audit/wiring.mjs` | 6 findings, all predating Phase 0: A-03 (`bht_name`), A-04 (two translation calls), A-05 (two superseded approvals), `admin_legal_set` | 6 ✓ |
| `npm audit --omit=dev` | | AUD-18 only (PostCSS inside `next`, fixed only by a Next major) | ✓ |

## 6. Visual verification

Captured at 1440 and 390 by the WP scripts, opened and inspected by the session that took them (D-208 to
D-215). WP-0.1 to WP-0.3's 34 captures predate `report.json`, and their inspection is recorded in D-208 to D-210:
`CRM-01-*` (contact rule, history), `CRM-12-*` (deleted, restore empty and populated, approval pending), `CUS-07-rules-*`,
`PIP-01-pipeline-capped`, `PIP-04-history*`, `PIP-10-bulk-delete-approval-preview`, `SET-rules-deletion`. Issues
found and fixed during capture are in each D-entry. `report.json` holds none.

| Screen | State | Width | File | Result |
| --- | --- | --- | --- | --- |
| PIP-17 | company-delete-preview | 1440 | `PIP-17-company-delete-preview-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| PIP-17 | company-delete-preview | 390 | `PIP-17-company-delete-preview-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| PIP-10 | bulk-delete-preview | 1440 | `PIP-10-bulk-delete-preview-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| PIP-10 | bulk-delete-preview | 390 | `PIP-10-bulk-delete-preview-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| SEC-07 | access-empty | 1440 | `SEC-07-access-empty-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| SEC-07 | access-empty | 390 | `SEC-07-access-empty-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| SEC-07 | access-populated | 1440 | `SEC-07-access-populated-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| SEC-07 | access-populated | 390 | `SEC-07-access-populated-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| SEC-07 | set-editor | 1440 | `SEC-07-set-editor-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| SEC-07 | set-editor | 390 | `SEC-07-set-editor-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| SEC-08 | group-editor | 1440 | `SEC-08-group-editor-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| SEC-08 | group-editor | 390 | `SEC-08-group-editor-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| SEC-08 | company-visibility | 1440 | `SEC-08-company-visibility-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| SEC-08 | company-visibility | 390 | `SEC-08-company-visibility-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| SEC-07 | prospects-narrowed | 1440 | `SEC-07-prospects-narrowed-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| SEC-07 | prospects-narrowed | 390 | `SEC-07-prospects-narrowed-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| SET-rules | access | 1440 | `SET-rules-access-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| SET-rules | access | 390 | `SET-rules-access-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| CUS-01 | fields-company | 1440 | `CUS-01-fields-company-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| CUS-01 | fields-company | 390 | `CUS-01-fields-company-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| CUS-01 | fields-contact | 1440 | `CUS-01-fields-contact-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| CUS-01 | fields-contact | 390 | `CUS-01-fields-contact-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| CUS-01 | field-long-options | 1440 | `CUS-01-field-long-options-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| CUS-01 | field-long-options | 390 | `CUS-01-field-long-options-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| CUS-03 | field-access | 1440 | `CUS-03-field-access-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| CUS-03 | field-access | 390 | `CUS-03-field-access-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| CUS-04 | field-errors | 1440 | `CUS-04-field-errors-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| CUS-04 | field-errors | 390 | `CUS-04-field-errors-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| CUS-02 | company-page | 1440 | `CUS-02-company-page-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| CUS-02 | company-page | 390 | `CUS-02-company-page-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| CUS-02 | required-refused | 1440 | `CUS-02-required-refused-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| CUS-02 | required-refused | 390 | `CUS-02-required-refused-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| CUS-02 | board-refused | 1440 | `CUS-02-board-refused-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| CUS-01 | contact-page | 1440 | `CUS-01-contact-page-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| CUS-01 | contact-page | 390 | `CUS-01-contact-page-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| CUS-01 | companies-filter | 1440 | `CUS-01-companies-filter-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| CUS-01 | companies-filter | 390 | `CUS-01-companies-filter-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| CUS-01 | segment-conditions | 1440 | `CUS-01-segment-conditions-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| CUS-01 | segment-conditions | 390 | `CUS-01-segment-conditions-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| CUS-01 | import-remarks | 1440 | `CUS-01-import-remarks-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| CUS-01 | import-remarks | 390 | `CUS-01-import-remarks-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| SF-26 | ops-crm-jobs | 1440 | `SF-26-ops-crm-jobs-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| SF-26 | ops-crm-jobs | 390 | `SF-26-ops-crm-jobs-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| SF-02 | rules-loop-window | 1440 | `SF-02-rules-loop-window-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| SF-02 | rules-loop-window | 390 | `SF-02-rules-loop-window-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| SF-26 | ops-crm-jobs-alert | 1440 | `SF-26-ops-crm-jobs-alert-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| SF-26 | ops-crm-jobs-alert | 390 | `SF-26-ops-crm-jobs-alert-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| SF-26 | dashboard-job-failures | 1440 | `SF-26-dashboard-job-failures-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| SF-26 | dashboard-job-failures | 390 | `SF-26-dashboard-job-failures-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| SF-26 | ops-crm-jobs-retried | 1440 | `SF-26-ops-crm-jobs-retried-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| WP08-campaigns | lifecycle | 1440 | `WP08-campaigns-lifecycle-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| WP08-campaigns | lifecycle | 390 | `WP08-campaigns-lifecycle-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| WP08-campaigns | lifecycle-off | 1440 | `WP08-campaigns-lifecycle-off-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| WP08-campaigns | lifecycle-off | 390 | `WP08-campaigns-lifecycle-off-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| WP08-partners | share | 1440 | `WP08-partners-share-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| WP08-partners | share | 390 | `WP08-partners-share-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| WP08-restore | confirmed | 1440 | `WP08-restore-confirmed-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| WP08-campaign | full | 1440 | `WP08-campaign-full-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| WP08-readonly | campaigns | 1440 | `WP08-readonly-campaigns-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| WP08-readonly | campaigns | 390 | `WP08-readonly-campaigns-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| WP08-readonly | campaign | 1440 | `WP08-readonly-campaign-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| WP08-readonly | campaign | 390 | `WP08-readonly-campaign-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| WP08-readonly | lists | 1440 | `WP08-readonly-lists-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| WP08-readonly | lists | 390 | `WP08-readonly-lists-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| WP08-readonly | segments | 1440 | `WP08-readonly-segments-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| WP08-readonly | segments | 390 | `WP08-readonly-segments-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| WP08-readonly | templates | 1440 | `WP08-readonly-templates-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| WP08-readonly | templates | 390 | `WP08-readonly-templates-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| WP08-readonly | stages | 1440 | `WP08-readonly-stages-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| WP08-readonly | stages | 390 | `WP08-readonly-stages-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| WP08-readonly | contacts | 1440 | `WP08-readonly-contacts-1440.png` | HTTP 200, overflow 0 px, 0 console errors |
| WP08-readonly | contacts | 390 | `WP08-readonly-contacts-390.png` | HTTP 200, overflow 0 px, 0 console errors |
| WP08-growth | plan-region | 390 | `WP08-growth-plan-region-390.png` | HTTP 200, overflow 0 px, 0 console errors |

**Against the Phase A baseline** (`screens/phase-0/admin-baseline-diff.md`, WP-0.7): of 116 page captures, 92
differ by less than 0.5 % (dates and times). The 24 that differ more are each attributed to an intended change
(audit growth, Users & roles, the CRM jobs card, history, restore, fields, the CMS route) or to data order. Ten
pages are new since Phase A and have no baseline: `crm_fields`, `crm_restore`, `settings_access`,
`settings_integrations` and `settings_rules`, each at two widths.

## 7. Security checklists

Each package has its checklist in `security/` (WP-0.1 16 items, WP-0.2 10, WP-0.3 12, WP-0.4 15, WP-0.5 18,
WP-0.6 18, WP-0.7 14, WP-0.8 15). Every item reads as met, with its evidence. Open across them:

- Item 15 (db lint) understated the warning count only in the handover. The checklists themselves say
  «warnings only» and name the class (§ 5).
- Production's advisors: each package added only to the deliberate classes, `authenticated` definer calls gated
  inside and tables with RLS and no policy. The `anon` class has stayed at 31 since D-207.
- The anonymity firewall: no CRM function, view or grant reaches an answer table. `crm_access_invariants` follows
  calls through helpers (DEC-08). The respondent invariants pass.

## 8. Settings added, with defaults

All in `app.crm_setting_defs`, shown on Admin › Settings › CRM rules, each tested in both states
(`crm_rules_invariants.sql` and each package's suite). Every default leaves the feature unrestricted (A9).

| Key | Kind | Default | Options | Added in | Applies to |
| --- | --- | --- | --- | --- | --- |
| `contact_rule` | choice | none | none / source_and_basis / opt_in_only | 0192 | CRM-01, CRM-04, LGN-04, PRO-05, PRO-07, WEB-04, AIA-07, MTG-05, MOB-01 |
| `import_consent_source` | choice | off | off / required | 0192 | CRM-09 |
| `typed_reason` | choice | off | off / on | 0192 | CRM writes |
| `limit_contact_import_rows` | limit | unlimited | — | 0192 | CRM-09 |
| `limit_register_import_rows` | limit | unlimited | — | 0192 | CRM-09, LGN-04 |
| `limit_bulk_move` | limit | unlimited | — | 0192 | PIP-10 |
| `limit_company_read` | limit | unlimited | — | 0192 | PIP-01, PIP-10 |
| `limit_contact_read` | limit | unlimited | — | 0192 | CRM-01 |
| `limit_campaign_blocks` | limit | unlimited | — | 0192 | CMP-01 |
| `limit_sequence_mails` | limit | unlimited | — | 0192 | AUT-12 |
| `limit_test_sends_per_hour` | limit | unlimited | — | 0192 | CMP-01, COM-05 |
| `mailable_engagement_months` | limit | 12 | — | 0193 (DEC-22) | CMP-03, CMP-04, CMP-08 |
| `delete_approval` | choice | off | off / on | 0195 | CRM-12, PIP-10, CRM-11 |
| `restore_window_days` | limit | 30 | — (unlimited allowed) | 0195 | CRM-12, SF-15, PIP-17 |
| `default_visibility_company` | choice | everyone | everyone / group_tree / group / owner | 0196 | SEC-08 |
| `limit_permission_sets` | limit | unlimited | — | 0196 | SEC-07 |
| `limit_visibility_groups` | limit | unlimited | — | 0196 | SEC-08 |
| `limit_custom_fields` | limit | unlimited | — | 0197 | CUS-01 |
| `limit_field_options` | limit | unlimited | — | 0197 | CUS-01 |
| `limit_event_loop` | limit | 10,000 | — (off allowed) | 0199 | SF-02, AUT-09 |

The two non-unlimited defaults are Tor's decisions or the brief's source values: 12 months (DEC-22), 30 days
(the brief's CRM-12), 10,000 (the brief's source value for loop protection, A9). Two keys are not in the brief's
register by name, `restore_window_days` and `default_visibility_company`. They follow DEC-07, which made every fixed
rule a setting, and `05-GAP-FEATURES.md` records both.

## 9. Deviations, with Tor's decision

| Entry | What differs | Tor's decision |
| --- | --- | --- |
| D-207 | Two CRM helpers closed to clients (0191) | DEC-01, DEC-13, DEC-36 |
| D-208 | Fixed caps and existing checks became settings, unrestricted by default (loosening what existed) | DEC-04, DEC-07, DEC-22 |
| D-209 | CRM events have their own catalogue and outbox (`app.crm_event_types`), not the brief's «single typed events table»: `app.growth_events` refuses UUIDs by design | **None recorded** — question 3 |
| D-210 | Soft delete by flag, not a trash table; 0195 applied to production in parts | DEC-24, DEC-25, DEC-27; the held part DEC-28, DEC-29, DEC-34 |
| D-211 | `app.crm_can(action)` instead of `(action, entity)`; visibility enforced in the definer calls, not RLS policies (the tables are closed to clients, so a policy would never run) | DEC-11, DEC-12, DEC-29, DEC-31 for the scope; **the two design differences have no recorded decision** — question 3 |
| D-212 | One GIN index per table instead of expression indexes per field (an index per new field would be a schema change outside migrations); hidden/read-only per permission set, not per user; monetary in kroner until CUS-06 | DEC-30, DEC-34 for the scope; **the design differences have no recorded decision** — question 3 |
| D-213 | Deliveries hold only failed or set-aside rows (the read point carries «once»); runs counted per hour, not one row each | DEC-14, DEC-35; **no recorded decision on the storage difference** — question 3 |
| D-214 | Full journeys, 390 and axe run locally; CI runs a short smoke only | DEC-37, DEC-38 |
| D-215 | Campaign pages follow the permission set; figures from data | DEC-31, DEC-39 |

## 10. Not done or not verified, and why

- **The four held parts are not on production** (§ 1). The connector's tool permission for `apply_migration` is
  held at claude.ai › Customize › Connectors › Supabase › tool permissions, and only Tor can change it (DEC-28,
  DEC-41, DEC-42). Retried once after this report, as the brief asks: held again. On 2026-10-04 at about 14:40 UTC, after a fresh read-only drift check that again matched the brief, `0195l_crm_purge` was tried once more, exactly as written. The connector answered «MCP tool call requires approval» and nothing reached the project. `0196d` and `0197e` were not tried a second time, and `0199f` was not tried (it waits for `0195l`). A message relayed from the WP-0.8 session (queued 14:00 UTC) says Tor has allowed `apply_migration` in the connector. The connector still held the call, so the setting has not reached this session, or it applies only to sessions opened after the change (DEC-28: the permission is read when a session starts). Recorded as DEC-43.
- **The admin screens are not exercised on production.** They ship with the merge (DEC-23).
- **SF-34 step 3 («warn») and a test for step 6** (the firewall outside the registry) do not exist (§ 3).
- **WP-0.1–0.3's 34 captures are not in `report.json`.** Their inspection is recorded in prose in D-208–D-210.
- **Bulk changes other than deletes cannot be reverted** (CRM-12) until WP-1.2 (DEC-27).
- **`db lint` warnings** in five Phase 0 functions remain (§ 5). They are of the literal-initialiser kind the
  codebase already has, and no behaviour is affected; all 122 suites exercise these functions.
- **Performance** (A8) was not measured in Phase 0. No targets exist yet (open point 8).
- After approval the brief's post-merge steps remain: renumber this branch's D-entries (DEC-32), move «Admin
  smoke» into main's CI job, and let `0191` give way to main's `0198` (DEC-36).

## 11. Open questions

From «Still open» in `DECISIONS.md` and `06-QUESTIONS.md`, none blocking Phase 0:

- Q7 lead object (the plan follows the brief: its own table), before WP-1.7.
- Q13 threshold (the plan keeps the product rule: floor 3, default 5).
- Open point 2, providers beyond geocoding (Phase 2 onward).
- Open point 5, recording consent and signature level (MTG, DOC).
- Open point 6, the LinkedIn connector and recurring activities (LEA-06, ACT).
- Open point 8, targets and running costs (performance, Phase 7).
- Open point 4, legal review of the unrestricted defaults: recorded as not a gate (CLAUDE.md, X-078).

Raised by this report, asked with it:

1. How the held parts reach production before the merge.
2. Whether the gate as met (§ 3) is accepted, with the remaining steps in later phases.
3. Whether the design deviations without a recorded decision (D-209, D-211, D-212, D-213) are accepted.
4. Whether to clear the `db lint` warnings in Phase 0's functions now or leave them with the older ones.
