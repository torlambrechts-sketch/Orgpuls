# 04 — Gap against the admin specification (Appendix 2)

Phase A output (A3.4) for `docs/crm-enrichment/INSTRUCTIONS.md`, written 2026-10-03 on branch `ccr-39a2fb73-jgkg09`. Read-only: no application code or database was changed. Every fact cites `path:line`; where the inventory says a range was not read in full, that range is an open item, not a finding. 

---

# Appendix 2 (platform admin) checked against the code

Repository: /home/user/Orgpuls, read on 2026-10-03, read-only. Paths are relative to the repository root.

How to read the citations:
- `lib/supabase/middleware.ts` line numbers are the file's own lines. `middleware.ts` only calls `safeUpdateSession`.
- A migration is cited as `NNNN_name.sql:lines`, or by the table or function it defines.
- A decision is cited as `DEVIATIONS D-xxx` or `DECISION_LOG X-xxx`, with its line in that file.

The admin is called "Sentral" in the code (X-095). It has six roles, not four: `super_admin`, `support`, `finance`, `analyst`, `marketing` (0055:37) and `editor` (0125:6).

The SUMMARY counts below are computed from the section tables.

## SUMMARY (rows per section by status)

| Section | Implemented | Partial | Missing | Conflict | Unknown | Total |
|---|---|---|---|---|---|---|
| 1 Principles | 3 | 2 | 1 | 2 | 0 | 8 |
| 2 Access model | 7 | 2 | 2 | 2 | 0 | 13 |
| 3 Analytics | 5 | 9 | 11 | 0 | 0 | 25 |
| 4 Organisations | 10 | 6 | 7 | 0 | 0 | 23 |
| 5 Users & support access | 8 | 0 | 11 | 1 | 0 | 20 |
| 6 Content management | 0 | 6 | 2 | 0 | 0 | 8 |
| 7 Data / privacy | 2 | 5 | 3 | 1 | 0 | 11 |
| 8 Billing | 0 | 3 | 7 | 1 | 0 | 11 |
| 9 Communication & support | 2 | 3 | 1 | 0 | 0 | 6 |
| 10 System operations | 0 | 3 | 2 | 1 | 0 | 6 |
| 11 Web analytics | 9 | 3 | 2 | 0 | 0 | 14 |
| 12 Marketing CRM | 13 | 4 | 0 | 0 | 0 | 17 |
| 13 Ticketing | 15 | 6 | 3 | 0 | 0 | 24 |
| 14 Best practices | 4 | 6 | 2 | 0 | 0 | 12 |
| **Total** | **78** | **58** | **54** | **8** | **0** | **198** |

The most significant findings:
1. **Bug: the `editor` role cannot be granted from the UI.** Admin › Users & roles offers the editor role: `app/(admin)/admin/admins/page.tsx:22,38` builds its list from `ROLES` (`lib/admin/api.ts:23`). But the latest `public.admin_set_admin` (`0055_crm.sql:1071`) accepts only `('super_admin','support','finance','analyst','marketing')`. No later migration redefines it, so granting `editor` returns `invalid_role`. 0125 and 0126 added the enum value and its gates, but never updated the grant function. The tests insert editors directly with SQL (`supabase/tests/admin_roles_invariants.sql:31`), so they do not catch this.
2. **The anonymity threshold differs from the spec on purpose.** The spec says 5 everywhere. The product has a floor of 3 and a default of 5 (D-198, `0150_k_floor_three.sql:1-40`). The admin's "groups below threshold" count uses each round's own k (`0150:180`, which rewrites `admin_org_detail`).
3. **Not every admin read writes an audit row.** About 40 `admin_*` readers have no `app.admin_log` call. Most are content, CRM or settings readers; customer-scoped ones are listed in row 1.6. Two consequences:
   - The audit CSV export and the web-report CSV export are not themselves audited (`admin_audit_list`, `admin_web_report` in 0121).
   - Customer-scoped readers that only open alongside a logged `org.view` are not logged on their own: `admin_org_cancellation`, `admin_org_owner`, `admin_notice_recipients`, `admin_ticket_mail`, and `admin_attention` (dashboard).
4. **Whole areas are missing on purpose, each with a documented reason:**
   - Billing and money: no Stripe, no plan catalogue as rows, no MRR on screen (D-93, D-163, D-164, D-170).
   - Support access and impersonation (D-107; X-095 "no «Open as customer»").
   - Per-user admin actions, product-usage KPIs, NPS, the incident register, backups, maintenance mode, an IP allowlist and login alerts.

---

## 1. Principles

| Item | Status | Evidence | Missing or different |
|---|---|---|---|
| 1.1 No admin screen shows individual answers | Implemented | `0049_platform_admin.sql:12-15` (header promise); `supabase/tests/admin_invariants.sql` check 3 "no admin function reads a response-level table"; `admin_org_detail` returns rounds as invited/answered/groups-below counts (`0049:305-325`); `app/(admin)/admin/orgs/[id]/page.tsx:403-442` | — |
| 1.2 A 5-answer threshold in every admin view, export and impersonation | Conflict | `0150_k_floor_three.sql:1-40` (k_floor 3, k_min 5, threshold 3..10); `0150:180` rewrites admin_org_detail to `g.answered < app.k_round(r.id)`; growth analytics floor at k_min 5 (`0150:10-12`, D-182 "never below k = 5"); health score refuses below k (D-181 G5 review, `health_score_invariants` row 8) | Deliberate difference: the floor is 3 and the default is 5 (CLAUDE.md, DEVIATIONS D-198 line 10109). Admin counts follow each round's frozen k, so a group can count as "not below" at 3. There is no impersonation (see 5.12), so the "impersonation" part does not apply. |
| 1.3 Orgpuls is the data processor; the admin sees metadata by default | Implemented | `0049:12-15`; `admin_org_detail` returns counts, dates and Brreg facts (`0049:274-347`); employees are never listed (`admin_user_search` excludes them, `0049:401`); provider errors are masked (`0049:487`) | — |
| 1.4 Least privilege by role | Partial | Menu gating in `lib/admin/access.ts:11-25`; each RPC checks its own role, e.g. `admin_org_list` (super/support/finance) at `0118:77`, `admin_org_detail` hides users, rounds and timeline from finance (`0049:271,297,306,332`); 0126 shuts the editor out of 8 readers (`0126_admin.sql:125-146`) | Roles go beyond the spec's four (`marketing`, `editor`). Analyst reaches more than dashboards (see 2.2). |
| 1.5 Everything audited: every admin read of customer-scoped data and every write, with who/what/when/reason | Partial | `app.admin_audit` with who (admin_id/email/role), what (action, org, target), when (`at`) and reason (`0049:79-95`); `app.admin_log` (`0049:113-123`); writes require a reason of at least 5 characters (e.g. `admin_extend_trial` `0049:363`, `admin_cancel_org` `0065:27`, `admin_delete_now` `0064:377`); test `admin_invariants.sql` check 9 | No `admin_log` in: `admin_attention` (0116), `admin_audit_list` (0049), `admin_org_cancellation` (0066), `admin_org_owner` (0118), `admin_notice_recipients` and `admin_ticket_mail` (0134), `admin_web_report` (0121), `admin_site_settings` (0126), the CMS/legal/translation/module readers, and several CRM readers (`admin_crm_journeys`, `_partners`, `_tasks`, `_sequence`, `_segment_preview` …). Some writes record no reason (e.g. `admin_note_add` `0049:396`, `admin_site_indexing_set` `0126:164`). |
| 1.6 Data not code: plans, question sets, tiltak library, email templates, feature flags are rows | Conflict | Rows: question modules (`0067`), CRM templates (`0056` `crm_templates`), growth registries (`0142`), mail streams and templates registry (`0144`). Code: plans `lib/billing/read.ts:10-14` and `app.plan_monthly_nok` (`0049:186-189`); feature flags `lib/flags.ts:1-59` (env + JSON); tiltak library `lib/playbook/registry.ts` (code registry + messages); transactional mail texts are `messages/*.json`, overridable through `app.message_overrides` (`0101`) | D-170: "No «Edit plans»: the price list is code, and a price change is a release". Flags are environment/JSON, not rows. Playbook is a code registry by design. |
| 1.7 EU residency | Implemented | `vercel.json` `"regions": ["fra1"]`; CLAUDE.md Supabase eu-central-1; DECISION_LOG X-055 (lines 1773-1777: Supabase Frankfurt, Vercel fra1, Brevo) | Brevo's location is not stated in the repository. |
| 1.8 Impersonation respects the threshold | Missing | No impersonation exists. DEVIATIONS D-107 line 4797-4802 ("View as customer" not built, owner's decision); DECISION_LOG X-095 line 2742 "no «Open as customer»"; D-164 line 7292 | Deliberately not built. |

## 2. Access model

| Item | Status | Evidence | Missing or different |
|---|---|---|---|
| 2.1 A separate surface with its own middleware | Implemented | `lib/supabase/middleware.ts:116-124` (admin host, 30-min idle cookie), `:156-168` (admin host rewrites every path to /admin; /admin returns 404 on public hosts), `:110` (`/admin/login` public), `:250-261` (idle check); own layouts `app/(admin)/admin/layout.tsx:52-56`, `app/(adminauth)/admin/layout.tsx`; host rules D-98 (DEVIATIONS 4196) | It is a branch of the shared middleware, not a separate file. DECISION_LOG lines 3089-3090 still list admin.orgpuls.com DNS/env and the first super-admin as open (D-98 says the hosts are known in code). |
| 2.2 Roles Super-admin / Support / Finance / Read-only analyst with the can-see/can-do matrix | Conflict | `0049:22` enum; `lib/admin/access.ts:11-25` (BY_ROLE); X-058 role table (DECISION_LOG 1857-1864) | Can-see: support has orgs, health, users, ops, web, tickets (`access.ts:13`); finance has orgs, health, web, acquisition, billing (`:14`); analyst has dashboard, web, seo, acquisition, crm, cms, modules, growth (`:17`). The spec says "dashboards only" for the analyst. Can-do: super-admin plans and flags have no UI or RPC; support has no resend invite, reset MFA or support-access request; finance has no change plan, credits, refunds or discounts (none exist, D-93). Extra roles: marketing and editor. |
| 2.3 A `platform_admins` table (user_id, role, mfa_enforced, created_by) separate from customer memberships | Implemented | `0049:24-32` (also `active`, `product_id`); separation triggers `0049:37-60`; tests `admin_invariants.sql` checks 6-7 | — |
| 2.4 Admin reads go through server handlers / security-definer functions that check the role and write an audit row | Partial | Every `admin_*` RPC is SECURITY DEFINER and gated by `app.is_platform_admin` or `app.admin_role` (`0049:64-76`); grants revoke anon (`0049:637-656`); `admin_invariants.sql` check 2 | The role check is everywhere; the audit row is not (see 1.5). |
| 2.5 The service-role key never reaches the browser | Implemented | No `service_role` or `SERVICE_ROLE` reference under `app/`, `lib/`, `components/` (grep, no matches); `lib/supabase/` has only anon, server, read and write clients | — |
| 2.6 RLS stays on; admin access is a named policy path `is_platform_admin(role)` | Implemented | `app.is_platform_admin(p_roles)` `0049:74-76`; admin tables have RLS on and no policy (`0049:34-35,99,137,154`); customer tables have no admin policy (`0049:15`) | Different mechanism: there are no RLS policies for admins. Admin access is only through definer functions calling `is_platform_admin`. Same intent. |
| 2.7 Response-level tables unreachable from admin functions | Implemented | `admin_invariants.sql` check 3; X-058 (DECISION_LOG 1850-1855); growth firewall `app.growth_firewall()` rules (D-182, DEVIATIONS 8457-8481) | — |
| 2.8 Only aggregate views with n>=5 | Conflict | `0150:180` (round k, minimum 3); `admin_org_detail` rounds (`0049:318-324`) | Same as 1.2: the floor is 3 (D-198). |
| 2.9 Admin role only after a second factor | Implemented | `app.admin_role()` requires `aal2` (`0049:64-72`); layout `app/(admin)/admin/layout.tsx:55-56`; MFA page `app/(adminauth)/admin/mfa/page.tsx:13-50`; `admin_invariants.sql` check 5; Settings shows it as always on (D-170) | — |
| 2.10 Session timeout of about 30 minutes idle | Implemented | `lib/supabase/middleware.ts:122` `ADMIN_IDLE_MS = 30*60*1000`, `:250-261`; login notice `app/(adminauth)/admin/login/page.tsx:8,14` | — |
| 2.11 Optional IP allowlist | Missing | No IP check in `lib/supabase/middleware.ts` or the admin layout | — |
| 2.12 Admin login alerts to Slack or e-mail | Missing | `admin_record_login` only writes the audit row `admin.login` (`0049:206-212`), called from `lib/admin/actions.ts:87` | No alert channel. |
| 2.13 Separate admin identities | Partial | Triggers `0049:37-60`; D-90 "Becoming an admin" (DEVIATIONS 3742-3753) | A super-admin grants roles only to accounts that already exist (`admin_set_admin`). No invite flow. The editor grant is broken (see the bug in SUMMARY). |

## 3. Analytics

| Item | Status | Evidence | Missing or different |
|---|---|---|---|
| 3.1 Activation funnel: 8 steps per signup cohort | Partial | `public.admin_funnel` (`0049:542-581`, revised in 0050 and 0094): per month, created, employees_uploaded, survey_scheduled, survey_sent, result_unlocked, results_viewed, measure_created, converted; rendered in `components/admin/Business.tsx:19-70` | Step 1 counts every organisation created, not "with Brreg lookup". The Growth funnel separately counts org.brreg_verified (D-183, DEVIATIONS 8741-8744). |
| 3.2 Drop-off per step | Partial | `Business.tsx:54-58` shows each step as n and % of created | Percentage is of the cohort, not of the previous step. The Growth funnel has "% of previous" for its own stages (`app/(admin)/admin/growth/funnel/page.tsx`, D-183). |
| 3.3 Median time per step | Missing | Only `median_hours_to_first_send` (`0049:561-562`) | No per-step medians. |
| 3.4 Median time from signup to first send | Implemented | `0049:561-562`; post-signup sends only (D-91, DEVIATIONS 3829-3830); `Business.tsx:59-61` | — |
| 3.5 MRR and ARR | Partial | `admin_kpis` computes mrr and arr from `app.plan_monthly_nok` (`0049:531-532`) | Not rendered: D-163 (DEVIATIONS 7249-7253) "No recurring revenue … waits for billing"; the snapshot card was removed. |
| 3.6 Net new MRR (new/expansion/contraction/churn) | Missing | — | D-107 (DEVIATIONS 4793-4796): no subscription ledger. |
| 3.7 Paying orgs, active trials, trials expiring in 7 days | Implemented | `admin_kpis` `0049:526-530`; dashboard `app/(admin)/admin/page.tsx:98-99`; attention list `0116` (trials within 7 days) | — |
| 3.8 Trial→paid by cohort and by source | Partial | Cohort: funnel `converted` (`0049:560`). Source: web sources with signups, activated and paid (D-91, DEVIATIONS 3814-3816); `admin_kpis.conversion` (`0049:534-535`) | Overall conversion is computed but not rendered. There is no cohort-by-source matrix. |
| 3.9 Logo and revenue churn | Missing | Cancellations exist (`app.billing.cancelled_at`, 0064) and are listed on Billing (`app/(admin)/admin/billing/page.tsx:43-49`), but no churn rate | D-107. |
| 3.10 Cohort retention curves | Missing | — | — |
| 3.11 ARPA | Missing | — | No money (D-170). |
| 3.12 Tier distribution | Implemented | Plan cards per plan with customers, trials and cancelling: `app/(admin)/admin/billing/page.tsx:28-41,55-70` | Counts only, no revenue. |
| 3.13 Customers by industry (NACE), size, fylke | Missing | NACE and municipality only on the org detail (`orgs/[id]/page.tsx:301-303`); none on lists or dashboards | — |
| 3.14 Surveys per month, main vs pulse | Missing | Not in any admin reader. The event catalogue counts survey.sent over 7 days (D-182, `admin_growth_events`) | — |
| 3.15 Average response rate | Partial | Per round on the org detail (`orgs/[id]/page.tsx:431`); the org list RPC returns last_invited and last_answered (`0118:93`) but the page does not render them | No platform-wide average. |
| 3.16 Reminder effectiveness | Missing | Only reminders_sent per round (`0049:311`) | — |
| 3.17 Share of groups hidden by the threshold | Partial | Groups below threshold per round on the org detail (`0049:320`, `orgs/[id]/page.tsx:432`) | No platform-wide share. |
| 3.18 Tiltak created with owner/deadline and share closed on time | Partial | Measures total, open, overdue and closed per org (`0049:326-331`) | No platform aggregate. No "on time" share. |
| 3.19 Logins by role | Partial | Health score counts accounts signed in within 30 days (D-182, DEVIATIONS 8569-8570); per-user last sign-in on the org detail | No breakdown by role. |
| 3.20 Comments posted and share answered | Missing | — | — |
| 3.21 Feature adoption per org | Missing | `product_events` records 4 page views (`0049:142-154`) and feeds the funnel only | — |
| 3.22 Marketing attribution: UTM and referrer on signup | Implemented | `app.org_attribution` (0050), read on the server (0059, D-104); org detail Source panel (`orgs/[id]/page.tsx:312-329`) | — |
| 3.23 Signups, activation and paid per channel | Implemented | Web analytics sources and campaigns (D-91, DEVIATIONS 3814-3816); `/admin/acquisition` (D-107) | — |
| 3.24 Health score per org (last admin login, cadence vs årshjul, response trend, tiltak activity, payment status) | Partial | `app.health_score` / `app.health_parts` (0141): cycle on schedule 30, action items 25, logins 15, last round's rate 15, NPS 10 (no source), no open P1 5 (D-182, DEVIATIONS 8541-8553); account health 0-100 (0060, D-105) on `/admin/health` and the org detail (`orgs/[id]/page.tsx:298`) | No payment status (no ledger). The rate is the last round only, not a trend. NPS has no source and the score tops out at 90. |
| 3.25 Flag at-risk customers before renewal | Missing | — | No renewal date (D-165 says renewal waits for billing). |

## 4. Organisations

| Item | Status | Evidence | Missing or different |
|---|---|---|---|
| 4.1 List search: name, org.nr, admin e-mail | Implemented | `admin_org_list` `0118:108-112`; UI `app/(admin)/admin/orgs/page.tsx:59-69` | — |
| 4.2 Filter: status (trial/active/past due/cancelled/suspended) | Partial | States active, trial, ended, cancelling, churned, demo (`lib/admin/customers.ts:9-25`); segments at `orgs/page.tsx:44-46` | No "past due" or "suspended": there are no invoices. "Ended" covers grace and read-only (D-164, DEVIATIONS 7280-7284). |
| 4.3 Filter: price tier | Implemented | Plan filter `orgs/page.tsx:75-84` | — |
| 4.4 Filter: employee band, industry, fylke, signup source, trial days left, health | Missing | Only plan and owner filters (`orgs/page.tsx:73-101`) | Owner is an extra filter (D-164). |
| 4.5 Columns: name, status, plan, employees | Implemented | `orgs/page.tsx:106-112,141-176` | Employees are shown as seats used against the plan. |
| 4.6 Columns: org.nr, last survey sent, response rate, health, MRR, signup date | Missing | The RPC returns org_number, last_sent, last_invited/answered, mrr and created_at (`0118:85-93`); none is rendered | MRR is withheld on purpose (D-164 "No money"). The others have no recorded reason. |
| 4.7 Saved views | Partial | "Each segment and filter is an address, so a view can be linked" (`orgs/page.tsx:15-16,39-43`) | No stored named views. |
| 4.8 Detail: Brreg header | Implemented | `admin_org_detail` registry_* fields (`0049:279-282`); Account panel `orgs/[id]/page.tsx:299-305` | Shown in the Account panel, not the header. |
| 4.9 Detail: users and roles | Implemented | `0049:297-304`; `orgs/[id]/page.tsx:378-401` (support and super-admin only) | — |
| 4.10 Detail: structure counts and groups below threshold | Implemented | `0049:292-296,320`; `orgs/[id]/page.tsx:131-140,432` | The threshold is the round's k (1.2). |
| 4.11 Detail: surveys as metadata | Implemented | `0049:305-325`; `orgs/[id]/page.tsx:403-442` | Kinds and statuses are shown as database codes (D-90 left open). |
| 4.12 Detail: tiltak counts | Implemented | `0049:326-331`; `orgs/[id]/page.tsx:137` | — |
| 4.13 Detail: billing | Partial | Trial, confirmation, invoice e-mail, ref, EHF and DPA (`orgs/[id]/page.tsx:142-181`) | No subscription, invoices or payments (D-164). |
| 4.14 Detail: timeline | Implemented | `0049:332-344`; `orgs/[id]/page.tsx:444-455` | — |
| 4.15 Detail: internal notes and tags | Partial | `app.admin_org_notes` and `admin_note_add` (`0049:126-137,381-398`); `orgs/[id]/page.tsx:331-347` | No tags on organisations. CRM contacts have tags, organisations do not. |
| 4.16 Detail: audit trail | Implemented | `admin_audit_list(p_org)` (`0049:439-459`); `orgs/[id]/page.tsx:537-552` | — |
| 4.17 Action: extend/reset trial, with reason, audited | Partial | `admin_extend_trial` (`0049:354-379`, 1-60 days, reason, audited `trial.extend`); `orgs/[id]/page.tsx:163-180` | No "reset trial". |
| 4.18 Action: change plan, discount, complimentary | Missing | No RPC; plan is set only by the customer's `save_billing` (X-057) | D-93, D-164 ("name, contact and plan are the customer's own"). |
| 4.19 Action: suspend/reactivate | Partial | Closest is a cancellation (read-only from the last day) and withdraw: `admin_cancel_org` (`0065:16-46`), `admin_cancel_withdraw` (0064); UI `orgs/[id]/page.tsx:183-246` | No suspend state separate from cancellation or trial expiry. |
| 4.20 Action: re-sync Brreg | Missing | No admin action (`lib/admin/actions.ts` exports, lines 38-790) | — |
| 4.21 Action: transfer ownership | Missing | "Edit customer" sets Orgpuls' internal account owner (`admin_set_account_owner`, 0118), not the customer's owner | — |
| 4.22 Action: merge duplicate orgs with the same org.nr | Missing | — | — |
| 4.23 Action: export org data | Missing | No admin RPC or route for it | — |

Deleting an organisation is covered in section 7 (row 7.4), with the support-access items in section 5.

## 5. Users & support access

| Item | Status | Evidence | Missing or different |
|---|---|---|---|
| 5.1 User search by e-mail or name | Implemented | `admin_user_search` (`0049:402-436`); `app/(admin)/admin/users/page.tsx:1-82` | Admins are excluded from it, and so are respondents. |
| 5.2 Memberships | Implemented | `0049:421-423`; `users/page.tsx:53-62` | — |
| 5.3 Last login, MFA status | Implemented | `0049:419-420`; `users/page.tsx:72-73` | — |
| 5.4 Auth method | Missing | Not returned by `admin_user_search` | `member_identities` (0155) exists but is not read here. |
| 5.5 Pending invites | Implemented | `0049:424-427`; `users/page.tsx:63-71` | — |
| 5.6 Action: resend invite or magic link | Missing | No admin action (`lib/admin/actions.ts`) | — |
| 5.7 Action: reset MFA | Missing | — | — |
| 5.8 Action: change e-mail | Missing | — | — |
| 5.9 Action: deactivate user / remove from org | Missing | — | — |
| 5.10 Action: mark billing contact | Missing | — | — |
| 5.11 Respondents: per-survey counts only; no admin edit of bounced addresses; no respondent→answer lookup | Implemented | Counts only (`0049:305-325`); `address_problems` shown to the daglig leder only, the admin sees counts (`admin_email_log` 0053; D-97, DEVIATIONS 4148-4160); `admin_invariants.sql` checks 3 and 8 | — |
| 5.12 Support access: the customer grants or approves a request | Missing | No table or RPC | D-107 (DEVIATIONS 4797-4802), X-095 decision "no «Open as customer»" (DECISION_LOG 2742) |
| 5.13 Support access time-boxed to 24/72 h, read-only by default | Missing | — | Same decision. |
| 5.14 Visible banner in the customer app and the customer's audit log | Missing | — | Same decision. |
| 5.15 Support access inherits the threshold and role scope | Missing | — | Same decision. |
| 5.16 Support access: every page view logged | Missing | — | Same decision. |
| 5.17 Personvern request queue with 30-day due dates and status | Implemented | Ticket queue `personvern` (`0051:33`); `legal_due` = created + 30 days for category personvern (`0051:143-145`); overdue counts legal_due (`0051:396-399`); contact-form topic routes to Personvern (D-92, DEVIATIONS 3853-3858) | Built as a ticket queue, not a separate register. |
| 5.18 Respondents: no admin edit of addresses | Implemented | No admin write on employees exists (no RPC) | — |
| 5.19 Users shown to the right roles only | Implemented | `admin_user_search` super/support (`0049:409`); org-detail users only for support/super (`0049:297`) | — |
| 5.20 Respondent counts per survey use the threshold | Conflict | `0150:180` | k floor 3 (D-198). |

## 6. Content management

| Item | Status | Evidence | Missing or different |
|---|---|---|---|
| 6.1 Versioned question set: published versions immutable, old→new mapping | Partial | Industry modules are versioned and published versions are immutable (`0067_question_modules.sql:1-30`). `app.module_sync` writes the next version, moves unanswered rounds (statements matched by code) and carries translations (`0122_simple_modules_legal.sql:1-20`). Admin › Modules (`app/(admin)/admin/modules/page.tsx`) | The core QPS statements are seeded data (0002) with no admin versioning. Modules are edited as files and synced, not edited in the admin (X-096). |
| 6.2 Pulse templates | Missing | Pulse cadence is a per-org wheel setting (`0019_year_wheel.sql:23-35`) | No admin-managed pulse templates. |
| 6.3 Tiltak library per factor and score band, with configurable ranking | Partial | `lib/playbook/registry.ts` (3 measures per factor, code + messages); module action suggestions (`0067` `module_action_suggestions`) | No score band, no ranking setting, not editable in the admin (data in code by design). |
| 6.4 Legal references per factor with last-reviewed date | Partial | `app.legal_reviews` (0122: review per document, with date and stored text); Admin › Legal review (`app/(admin)/admin/legal/page.tsx`); module `law` items | Reviewed per document, not per factor. X-078 says legal review is a record, not a gate. |
| 6.5 E-mail and SMS templates (invitation, reminder, verneombud notice, results ready, trial expiring, payment failed) with preview and test-send | Partial | Texts are `mail.*` messages, overridable and approvable through Admin › Translations (`0101_translations_admin.sql:9-13`, `app/(admin)/admin/translations/page.tsx`); trial mails (0060, D-105); the customer's own "Send test til meg" (0127, D-171); CRM campaigns have preview and test (D-101) | No transactional preview or test-send in the admin. No "payment failed" mail (no payments). Editing is by import, not a template editor. |
| 6.6 Årshjul defaults per org size | Missing | Only column defaults, the same for every size (`0019:26-31`) | — |
| 6.7 Help texts and in-app announcements | Partial | Public-site notice `admin_site_notice(_set)` (0123, D-168), which "never reach[es] the product"; help articles are a code registry (`lib/help/articles.ts:1-14`) | No in-app announcement. Help texts are not edited in the admin. |
| 6.8 Every change records author, date and version, with rollback | Partial | CMS revisions and restore (0114 `cms_revisions`, `admin_cms_restore`); translation log (0084 `item_translation_log`); immutable module versions; audit log for admin writes | Not uniform across all content. Message overrides have approvals but no rollback UI. |

## 7. Data / privacy

| Item | Status | Evidence | Missing or different |
|---|---|---|---|
| 7.1 DPA per org (version, date, by whom, re-acceptance prompt) | Partial | `app.dpa_versions` and `app.dpa_signatures` (0047, X-055); new versions 0149, 0151, 0166, 0177, 0186; admin sees version, date and signer (`0049:289-291`, `orgs/[id]/page.tsx:152-157`); the customer tab compares against the current version (`components/oppsett/DpaTab.tsx:35-36`) | The "prompt" is only in Oppsett › Databehandleravtale. No proactive prompt was found. |
| 7.2 Retention per customer, default 2 years, with a purge-job report | Conflict | Data is kept while the agreement lasts and deleted 30 days after it ends; the purge report is `app.deletion_log`, the dry run `app.deletion_preview()` (0136, D-176, DEVIATIONS 7711-7816); Ops shows it (`app/(admin)/admin/ops/page.tsx:154-206`) | D-176: "Nothing promises a retention period for a live organisation's own data, so none is built". No 2-year default and no per-customer setting. |
| 7.3 Deletion queue with grace, execution log, confirmation | Implemented | `admin_cancel_org` sets deletion 30 Oslo days after the last day (`0065:16-46`); daily `orgpuls-deletion` cron (`0064_cancellation.sql:311`); `deletion_log`; Ops lists pending and done (`ops/page.tsx:154-206`) | — |
| 7.4 Delete org: scheduled with grace, confirmed by typing org.nr, super-admin only | Partial | `admin_delete_now`: super-admin, cancellation required, org.nr typed, reason, audited before deleting (`0064:367-394`); UI `orgs/[id]/page.tsx:211-225` | Scheduling the cancellation (the deletion clock) is allowed for support and finance too (`0065:24`). No second-admin approval. |
| 7.5 Customer data export, logged | Missing | No customer-data export in the admin. The customer downloads the report in the product | — |
| 7.6 Audit log append-only | Implemented | Triggers reject update, delete and truncate (`0049:101-111`); `admin_invariants.sql` check 10; no FKs, so it outlives accounts | — |
| 7.7 Audit log searchable by admin, org, action, date; covers admin actions, support sessions, role changes, exports; retained longer | Partial | Area chips by action prefix (`app/(admin)/admin/audit/page.tsx:21-29`, `lib/admin/audit.ts:1-44`); org filter through `admin_audit_list(p_org)` (org page only); latest 500 rows (`audit/page.tsx:13`), CSV of 1000 (`audit/export/route.ts:18`); role changes `admins.set` (`0055:1087`); nothing prunes (D-170, DEVIATIONS 7507-7510) | No search by admin, date or free action text. Not all exports are logged (audit and web CSV exports). No support sessions to log. |
| 7.8 Anonymity guardrails: monitoring n<5 and re-identification alerts | Partial | Structural: `app.growth_firewall()` seven rules computed live and shown on the Event catalogue (D-182, DEVIATIONS 8457-8481); complementary suppression (0034); groups below k per round on the org detail | No monitoring dashboard or alert for re-identification risk. |
| 7.9 Subprocessor register (source for the public list) | Partial | Annex 3 of the DPA text in `messages/no.json` (~line 6814); X-055 lists Supabase, Vercel and Brevo | Text, not a register or table. Not single-sourced to a public list. |
| 7.10 Incident register with a 72 h clock | Missing | — | The DPA draft states a 36 h breach notice (DECISION_LOG 3080, D-87). No register exists. |
| 7.11 Backups: last success and last restore test | Missing | — | Outside the repository (D-176, DEVIATIONS 7806-7807). |

## 8. Billing

| Item | Status | Evidence | Missing or different |
|---|---|---|---|
| 8.1 Plan catalogue (bands, monthly/annual price, 25 % MVA, features, active/archived, price versions) | Conflict | Plans in code: `lib/billing/read.ts:10-14`, `app.plan_monthly_nok` (`0049:186-189`); bands shown on Billing (`billing/page.tsx:28-41`) | D-170: "the price list is code". No annual price, MVA, features, archive or versions. |
| 8.2 Lifecycle: trial/active/past due/suspended/cancelled/deleted | Partial | `app.org_access()` trial/grace/read_only/active (0052, D-94); cancellation and deletion (0064-0066); admin states (`lib/admin/customers.ts:9-25`) | No past due. Suspended is approximated by read-only. |
| 8.3 Band reconciliation flag and notify | Partial | Seats used vs plan max (`lib/admin/customers.ts:41-51`, `orgs/page.tsx:152-165`) | The bar caps at 100 %. No over-band flag, no notification. |
| 8.4 Subscription view | Partial | Billing panel on the org detail (`orgs/[id]/page.tsx:142-181`); confirmations and cancellations on Billing (`billing/page.tsx:43-49`) | Not a subscription record. |
| 8.5 Invoice list, status, PDF, resend | Missing | — | D-93, D-164 ("The Invoices slot holds the billing and agreement facts"). |
| 8.6 Failed payments, dunning, manual retry | Missing | — | D-93; D-182 omits `payment.failed`. |
| 8.7 Credits, refunds, one-off discounts, coupon codes | Missing | — | D-93, D-103 (coupons wait for billing). |
| 8.8 Complimentary and partner accounts | Missing | `app.partners` (0143) are CRM partners, not billing accounts | — |
| 8.9 Revenue reports and accounting export | Missing | — | D-94 (Fiken not integrated). |
| 8.10 EHF via PEPPOL | Missing | Only the `ehf` flag is collected (0048, X-057) | DECISION_LOG 3087: invoicing is outside the product. |
| 8.11 Stripe as source of truth, mirrored via webhooks | Missing | Recommended in `docs/BILLING_RECOMMENDATION.md` (D-93) | Not built. |

## 9. Communication & support

| Item | Status | Evidence | Missing or different |
|---|---|---|---|
| 9.1 E-mail/SMS log per org (sent, delivered, opened, bounced, complained) | Partial | `admin_email_log` per day, kind and channel with sent, failed, pending, delivered, bounced, complaints (0049:494-511, 0053); per-recipient states (`admin_notice_recipients`, 0134); `orgs/[id]/page.tsx:457-535` | No "opened", on purpose: D-97 (DEVIATIONS 4162-4167) does not track opens or clicks on product mail. |
| 9.2 Deliverability per sending domain with spike alert | Implemented | Ops card with 30 days and an alert past 2 % bounce or 0.1 % complaints (`ops/page.tsx:17-75`); Deliverability page with streams per domain and an SPF/DKIM/DMARC check (`app/(admin)/admin/deliverability/page.tsx`, 0144, D-185) | The alert shows only on the page. No push notification. |
| 9.3 Lifecycle messaging driven by funnel events, editable in the admin | Partial | Trial mails queued by `app.lifecycle_plan()` every 15 minutes (`0060_lifecycle.sql:125`, D-105); texts editable as message overrides | The steps and timing are SQL, not editable rows. Only an on/off setting exists (`0060:33-41`), with no admin UI. |
| 9.4 Broadcasts (in-app banner or e-mail to a segment) | Partial | E-mail to a segment through CRM campaigns (D-101) | No in-app banner for customers. The site notice is public-site only (D-168). |
| 9.5 Support inbox linking org↔ticket | Implemented | `tickets.org_id`/`user_id` (`0051:107-108`); org detail tickets panel (`orgs/[id]/page.tsx:249-267`) | — |
| 9.6 Feedback and NPS per org | Missing | `health_parts` marks NPS `no_source` (D-182, DEVIATIONS 8548-8553) | — |

## 10. System operations

| Item | Status | Evidence | Missing or different |
|---|---|---|---|
| 10.1 Job monitor (queued/running/failed, manual retry) | Partial | `admin_ops`: job_runs, 14-day outbox queue, failures (`0049:465-492`); `ops/page.tsx:77-152` | Only the scheduler's job runs and the outbox. No other cron jobs (17 listed in migrations), no manual retry. |
| 10.2 Integrations status (Brreg, e-mail, payment, SMS; last success, error rate) | Partial | Settings › Integrations reads Ops (`app/(admin)/admin/settings/page.tsx:9-24`); SEO runs status (`admin_seo` `0126:89-94`); Brreg polls (0143) on the triggers page | No single status board. No payment integration. |
| 10.3 Feature flags, global and per org | Conflict | `lib/flags.ts:1-59` (environment variable plus `flags.signed-off.json`, all orgs); per-org pilots for modules and locales (`admin_module_pilot` 0068, `admin_locale_pilot` 0085) | Not rows, not admin-managed (data-not-code differs). |
| 10.4 Errors link filtered by org | Missing | No error tracker in the repository (grep sentry: none) | — |
| 10.5 Maintenance mode and status banner | Missing | Only the public-site notice (0123), which never reaches the product (D-168) | — |
| 10.6 Admin user management (invite, role, MFA status, deactivate; super-admin only) | Partial | `admin_list_admins` and `admin_set_admin` (super only, reason, audited; `0049:584-634`, `0055:1059-1090`); `app/(admin)/admin/admins/page.tsx` | "Invite" is a grant to an account that already exists (D-170). The editor role cannot be granted (bug in SUMMARY). |

## 11. Web analytics

| Item | Status | Evidence | Missing or different |
|---|---|---|---|
| 11.1 Visitors, sessions, pages per visit, bounce by day/week/month | Implemented | `admin_web` (0050/0054/0059), `admin_web_report` (0121); `app/(admin)/admin/web/page.tsx`; D-167 | Visitors are counted per day because the hash rotates daily (D-91). |
| 11.2 Sources (organic, paid, social, referral, direct, e-mail UTM) | Implemented | `app.web_channel` (0050), plus AI as a channel (D-104) | — |
| 11.3 Campaign view with manual spend, visits, signups, activated, paid, cost per paid | Partial | `app.marketing_spend`, `admin_spend_add`, `/admin/acquisition` (0062/0063, D-107); campaigns with signups, activated and paid (D-91) | Cost is computed per channel, not per campaign. |
| 11.4 Top landing pages and content performance | Implemented | `/admin/web/pages` (D-167); `admin_seo` content performance (`0126:95-106`) | — |
| 11.5 Search Console data | Partial | `orgpuls-seo` function, daily cron `0061_seo.sql:175`, `app.seo_search` | Waits for `GSC_SERVICE_ACCOUNT` (D-106, DECISION_LOG 3092). |
| 11.6 Website funnel (visit→pricing/platform→Kom i gang→org.nr→account created) | Implemented | D-91 (DEVIATIONS 3812-3813); D-167 | — |
| 11.7 Signup form drop-off, including failed Brreg | Missing | Beacon kinds are only `view` and `cta` (`0050_web_analytics.sql:41`) | — |
| 11.8 Persona entry clicks (4 "Hvem er du" cards) | Missing | — | D-91 (DEVIATIONS 3826-3827): the site has no such cards. |
| 11.9 First/last touch on the org | Implemented | `org_attribution` (0050, 0059, D-104) | — |
| 11.10 Cookieless web_events, daily-rotating salt hash, bot filtering | Implemented | `0050:28-33,89-93,127-140` | — |
| 11.11 Search Console nightly import | Partial | Cron `23 3 * * *` (`0061:175`) | Not configured (as 11.5). |
| 11.12 Marketing analytics separate from product | Implemented | Separate closed tables (`web_events`, `web_salts`, `org_attribution`), RLS on with no policy (X-059) | — |
| 11.13 Never track respondents in the survey flow | Implemented | `/s`, `/bli-med`, `/auth`, `/admin`, `/api` are refused (`0050:122`); the beacon is mounted in the marketing layout only (X-059) | — |
| 11.14 Dashboard in the admin | Implemented | `/admin/web`, `/web/pages`, `/web/goals`, `/web/visits` | — |

## 12. Marketing CRM

| Item | Status | Evidence | Missing or different |
|---|---|---|---|
| 12.1 Hard rule: respondents are never contacts | Implemented | `crm_invariants.sql` (D-101, DEVIATIONS 4315-4317); firewall rule "no contact who shares an address with an employee" (D-182, DEVIATIONS 8469-8470) | — |
| 12.2 Contact types: prospect / trial user / customer user / former customer | Implemented | D-101 (DEVIATIONS 4310-4312); D-165 line 7320 | — |
| 12.3 Fields: name, e-mail, company, org.nr, role, source, consent status and date, tags | Implemented | `0055_crm.sql:64-89` | — |
| 12.4 Auto-link to org and user | Implemented | `crm_contacts.user_id`/`org_id` (`0055:72-73`); `app.crm_sync` (0055, 0117) | — |
| 12.5 Activity timeline (mails received, opened, clicked; site visits after click) | Partial | Contact page with each CRM mail's delivery, open, click and unsubscribe (D-101, DEVIATIONS 4313-4314); `app/(admin)/admin/crm/contacts/[id]/page.tsx` | Site visits after a click are not built, on purpose (D-101, DEVIATIONS 4370-4371). |
| 12.6 CSV import with a consent source required per row | Implemented | D-101 (DEVIATIONS 4321-4322); `admin_crm_import` (0055, 0141) | — |
| 12.7 Segments as saved filters on contact and org data | Implemented | `crm_segments`, `admin_crm_segment_*` (0055); filters include employee count and NACE (D-101, DEVIATIONS 4332-4338) | — |
| 12.8 Campaign editor with Orgpuls templates, mobile preview, test-send | Implemented | D-101 (4341-4344), D-103 templates (0056), designed mail (0113, D-160) | — |
| 12.9 Types newsletter / one-off / promotion with coupon / product announcement | Partial | `crm_campaigns.kind` (`0055:121`) | No coupons (D-103). |
| 12.10 Scheduling | Implemented | `crm_campaigns.status`/`scheduled_at` (`0055:128-129`), `admin_crm_campaign_schedule` | — |
| 12.11 A/B subject test | Implemented | D-103 (DEVIATIONS 4532-4534) | — |
| 12.12 Automated sequences triggered by events, on the same engine as lifecycle messaging | Partial | Follow-up sequences (0111), journeys (0120, D-166) | Triggered by stage, no-reply or no-click, not by product events. The lifecycle mail (0060) is a separate engine (D-166, D-185). |
| 12.13 Reporting: delivered/opened/clicked/unsubscribed/bounced, plus UTM-attributed signups and conversions | Implemented | D-101 (4346-4352), D-103 (4535-4545) | — |
| 12.14 Consent basis per contact | Implemented | `basis` (`0055:75`); consent ledger `app.consent_records` (0141, D-182) | — |
| 12.15 Unsubscribe link and sender identity; one-click unsubscribe takes effect at once | Implemented | RFC 8058 header to /api/avmeld plus footer (D-101, DEVIATIONS 4323-4326); public paths `lib/supabase/middleware.ts` (`/avmeld`, `/api/avmeld`) | — |
| 12.16 Separate marketing and transactional streams | Implemented | `ORGPULS_MARKETING_FROM`; the domain must differ and be authenticated (D-101, DEVIATIONS 4353-4359); nyheter.orgpuls.com authenticated (X-065) | — |
| 12.17 Suppression list across all sends | Partial | `app.crm_suppression` (hashes) for CRM sends (`0055:95`); product mail uses `app.address_problems` (0053) | Not one list across transactional and marketing. Transactional mail does not consult the CRM suppression list. |

Lists and the preference centre (D-103) go beyond the spec.

## 13. Ticketing

| Item | Status | Evidence | Missing or different |
|---|---|---|---|
| 13.1 Types: question / service request / incident / problem | Implemented | `0051_tickets.sql:30` | — |
| 13.2 Priority from impact × urgency | Implemented | `app.ticket_priority_of(impact, blocking, category)` (`0051:70-82`), applied by trigger (`0051:134-155`) | Urgency is the `blocking` flag. Personvern is at least high. |
| 13.3 Incidents linked to a problem; resolving notifies linked tickets | Implemented | `problem_id` (`0051:114`); resolving a problem writes a note on each linked incident and sets it to waiting_us (`0051:465-520`) | The notification is an internal note, not a mail to the customer. |
| 13.4 Known errors to the help centre and status banner | Missing | — | — |
| 13.5 Service requests execute admin actions from the ticket, audited | Missing | — | D-179 (DEVIATIONS 7994-7995): still carried out on the org page. |
| 13.6 Queues Support/Billing/Sales/Personvern with routing, reassignment, escalation | Partial | `0051:33`; contact topics route to queues (D-92); queue and assignee can be changed (`0051:483`) | No escalation mechanism. |
| 13.7 Tables tickets, ticket_messages, ticket_links, ticket_events with RLS, support/super-admin only | Implemented | `0051:94-195` (RLS on, no grant); admin RPCs for super/support (e.g. `0135:308,370`) | `ticket_links` links rounds only. |
| 13.8 Channel: contact form (ticket, plus CRM prospect if consented) | Implemented | `submit_contact` (0051); consent checkbox creates a pending contact (D-101, DEVIATIONS 4386-4387) | — |
| 13.9 Channel: in-app help capturing context | Implemented | `submit_help_request` (org, role, page) (`0051` header lines 7-8); help-panel form with page path (0132, D-174) | — |
| 13.10 Channel: e-mail in, threaded | Missing | — | D-92, D-179 (DECISION_LOG 3093). |
| 13.11 No respondent channel | Implemented | `0051:22-23`; X-060 | — |
| 13.12 Statuses new/open/waiting customer/waiting us/resolved/closed | Implemented | `0051:31` | — |
| 13.13 Priorities low/normal/high/urgent | Implemented | `0051:32` | — |
| 13.14 Categories (9) | Implemented | `0051:34-36` | Matches the spec's list. |
| 13.15 Assignee, internal notes, @mentions, attachments | Partial | assignee `0051:113`; `internal` notes `0051:164`; mentions `ticket_mentions` (0135, D-179) | No attachments (D-179, DEVIATIONS 7989-7993). |
| 13.16 Links to org/user/survey/invoice | Partial | org and user `0051:107-108`; survey `ticket_links.round_id` `0051:187-191` | No invoice link (no invoices). |
| 13.17 History on the org detail | Implemented | `admin_org_tickets` (0051); `orgs/[id]/page.tsx:249-267` | — |
| 13.18 Canned replies editable | Implemented | `admin_canned_reply_save`/`_active` (0135); `app/(admin)/admin/tickets/canned/page.tsx` | — |
| 13.19 Personvern tickets go to the personvern queue with 30 days | Implemented | `0051:143-145` | — |
| 13.20 SLA first response urgent 4h / high 1d / normal 2d / low 5d; resolution 2/5/10/20 business days; overdue highlighting | Implemented | `0051:84-91` (4/8/16/40 and 16/40/80/160 business hours, 8-hour day); holidays (0132, D-174); overdue flag (`0051:396-399`) | — |
| 13.21 Reporting: volume by category and lifecycle stage, TTFR, TTR, reopen rate | Partial | `admin_ticket_report`: weekly volume, by queue, by type, first reply and resolution met/missed with medians, CSAT (`0135:300-360`); `app/(admin)/admin/tickets/reports/page.tsx` | No volume by category or lifecycle stage. No reopen rate. |
| 13.22 CSAT | Implemented | `app.ticket_csat`, `/vurdering` (0135, D-179) | — |
| 13.23 Self-service help centre with article suggestions; ticket-to-article loop | Partial | In-app help centre registry (`lib/help/articles.ts:1-14`) | No article suggestions and no ticket-to-article loop. |
| 13.24 Ticket content restricted to support and super-admin; retention and deletion; never attach survey answers | Partial | Restriction: support and super-admin only (X-060). Tickets are deleted with the organisation (D-108, DEVIATIONS 4832-4833). Nothing references a response table (`0051:22-23`, `ticket_invariants.sql` test 3) | The restriction and "no survey answers" are met. There is no general ticket-retention rule beyond deleting with the org; the privacy statement says "så lenge det trengs" (D-176). |

## 14. Best practices

| Item | Status | Evidence | Missing or different |
|---|---|---|---|
| 14.1 Suppression against differencing attacks | Implemented | `0034_complementary_suppression.sql:1-19`; per-group participation suppression (0073, D-123) | — |
| 14.2 Comment screening | Partial | Names in respondent text are masked (`app.mask_patterns`, 0095; former names 0190 lines 1-30) | No content-moderation queue. |
| 14.3 One typed events table with object_action names | Implemented | `app.event_catalogue` and `app.growth_events` (0141, D-182, DEVIATIONS 8371-8395) | `product_events` (0049) remains a second, narrower table. |
| 14.4 Metric definitions as SQL views in git | Partial | Metrics are SQL in migrations, but as functions, not views (`app.health_parts`, `app.growth_gate_value` 0142, `admin_funnel`) | Not views. |
| 14.5 Stripe mirror | Missing | — | D-93. |
| 14.6 product_id on every admin table; org.nr as shared key | Partial | product_id on `platform_admins`, `admin_audit`, `admin_org_notes`, `product_events` (0049), `tickets`, `canned_replies` (0051), `crm_contacts` (0055), `crm_companies`, `web_events` | Missing on `account_owners`, `marketing_spend`, `kpi_daily`, `deletion_log`, `ticket_csat`, `cms_pages`, `growth_*`, `brreg_*`, `consent_records`, `mail_streams`, `seo_search`, `platform_settings`. org.nr links CRM companies to orgs (D-103). |
| 14.7 Safe destructive actions (preview, second-admin approval, soft delete) | Partial | Dry run `app.deletion_preview()` (0136); 30-day grace and withdraw (0064-0066); org.nr confirmation (`0064:387-389`) | No second-admin approval. |
| 14.8 Separate admin identities, quarterly access review, logged break-glass | Partial | Separate identities (`0049:37-60`) | No access-review workflow. No break-glass mechanism. |
| 14.9 Seeded demo tenant Lumio AS / Kari Nordmann | Implemented | `scripts/qa/seed.mjs:2,47,171` (local QA only) | The hosted demo is Nordvik Anlegg AS (`scripts/seed/design-fixture.mjs:1001`). |
| 14.10 SPF/DKIM/DMARC on both subdomains, with warm-up | Partial | DKIM authenticated on nyheter.orgpuls.com (X-065); check on the Deliverability page (0144) | SPF is missing and DMARC is `p=none`: DECISION_LOG 3131 (open item). Streams are orgpuls.com and nyheter.orgpuls.com, not two subdomains (D-185). No warm-up. |
| 14.11 List hygiene (double opt-in newsletter; stop mailing after 6-12 months with no engagement) | Implemented | Double opt-in and 12-month rule (D-101, DEVIATIONS 4318-4330) | — |
| 14.12 Ticket-to-article loop | Missing | — | Overlaps 13.23. |

