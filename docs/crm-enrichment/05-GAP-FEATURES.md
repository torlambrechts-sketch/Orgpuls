# 05 — Gap against the CRM enrichment specification

Phase A output (A3.5) for `docs/crm-enrichment/INSTRUCTIONS.md`. Written 2026-10-03 on branch
`ccr-39a2fb73-jgkg09` at the commit that adds this file. No application code or database was changed.

**How the status was set.** Each feature was checked sentence by sentence against what the code does today,
using the evidence in `03-IMPLEMENTED-TODAY.md` (routes, actions, RPCs) and `02-DATABASE.md` (tables,
functions, tests). The strict definition in A3.5 applies: **Implemented** needs every sentence met, tests that
pass *and* a screen seen working. No feature in this file meets that bar in full, so none is marked
Implemented; where most of a feature exists it is **Partial** with the unmet sentences named. **Conflict**
means the code (or a recorded decision) contradicts the specification; those rows are also questions in
`06-QUESTIONS.md`.

Abbreviations in the evidence column:
- `CRM/` = `app/(admin)/admin/crm/`, `LA/` = `lib/admin/`, `CA/` = `components/admin/`, `mig/` = `supabase/migrations/`
- `R` = `app.crm_can_read()` (super_admin, marketing, analyst), `W` = `app.crm_can_write()` (super_admin, marketing), both `mig/0055_crm.sql:505-511`
- "company" = `app.crm_companies`, which today **is** the deal (one per company): see the PIP-03 Conflict

The column *Work package* is left empty: it is filled in Phase B (A4).

## Summary

| Module | Features | Implemented | Partial | Missing | Conflict | Unknown |
| --- | --- | --- | --- | --- | --- | --- |
| PIP Pipeline and deals | 17 | 0 | 8 | 8 | 1 | 0 |
| ACT Activities | 9 | 0 | 2 | 7 | 0 | 0 |
| CRM CRM records | 15 | 0 | 7 | 7 | 1 | 0 |
| CUS Customization | 8 | 0 | 3 | 5 | 0 | 0 |
| LEA Leads | 6 | 0 | 2 | 4 | 0 | 0 |
| COM Email and communications | 14 | 0 | 3 | 11 | 0 | 0 |
| AUT Automation | 12 | 0 | 5 | 7 | 0 | 0 |
| INS Insights and reports | 10 | 0 | 2 | 8 | 0 | 0 |
| PRO Prospecting | 7 | 0 | 2 | 5 | 0 | 0 |
| AIA AI assistant | 7 | 0 | 0 | 7 | 0 | 0 |
| MTG Meeting intelligence | 8 | 0 | 0 | 8 | 0 | 0 |
| MCP AI connector | 3 | 0 | 0 | 3 | 0 | 0 |
| CMP Email marketing | 9 | 0 | 9 | 0 | 0 | 0 |
| PRJ Projects | 9 | 0 | 0 | 9 | 0 | 0 |
| LGN Lead generation | 5 | 0 | 3 | 2 | 0 | 0 |
| WEB Web visitors | 4 | 0 | 1 | 2 | 1 | 0 |
| DOC Documents and e-sign | 6 | 0 | 0 | 6 | 0 | 0 |
| SEC Security and permissions | 11 | 0 | 5 | 6 | 0 | 0 |
| INT Integrations and API | 11 | 0 | 0 | 11 | 0 | 0 |
| MOB Mobile app | 8 | 0 | 0 | 8 | 0 | 0 |
| ENT Plans and entitlements | 4 | 0 | 0 | 3 | 1 | 0 |
| **Total** | **183** | **0** | **52** | **127** | **4** | **0** |

User flows, system flows, settings, Part F entities and Part G non-functional requirements follow the feature
tables, each with its own counts.

---

## Pipeline and deals (PIP)

| ID and name | Status | Evidence | Missing or different | Settings | Depends on | WP |
| --- | --- | --- | --- | --- | --- | --- |
| PIP-01 Kanban pipeline view | Partial | `CA/CrmBoard.tsx:68-249` board; HTML5 drag `:137-171`; optimistic move with rollback `:101-114`; column header count and summed value `:126-160`; read-only users cannot drop `:103,132,163`; move RPC `admin_crm_stage_move` `mig/0093_crm_stages.sql:140` (W) writes stage history (win rate reads it, `mig/0137_crm_win_rate_steps.sql`); test `tests/unit/pipeline.test.ts:4-42` | Cards show no labels and no activity-status icon (planned/overdue/none). No changelog entry per field and no `deal.stage_changed` event in the typed events table. Cards are not paged per stage: one query capped at 500 (`mig/0056_crm_pipeline.sql:845`). No visibility rules beyond role. | Typed reason | PIP-03, SEC-08, events (SF-02) | |
| PIP-02 Pipelines and stages | Partial | Stages are rows: key, name, sort, kind open/won/lost/parked, managed, archived, exit criterion (`LA/crm.ts:254-266`; `CRM/stages/page.tsx:28-60`; `admin_crm_stage_save` `mig/0112_crm_board_inbox.sql:55`); test `supabase/tests/crm_stages_invariants.sql` | Exactly one pipeline; no pipeline entity. No win probability and no rotting threshold per stage. Stages are archived, not deleted, so there is no "target stage for its deals" step. No limiting a pipeline to visibility groups. | — | SEC-08 | |
| PIP-03 Deal record | Conflict | A deal is the company row `app.crm_companies` with `value_nok`, stage, owner, next step/date, lost reason, tags (`LA/crm.ts:308-340`; `admin_crm_company_save` `mig/0119_crm_deal_value.sql:23`) | **Conflict:** the spec makes a deal its own record (many deals per organization, primary person, participants); the code has one deal per company by design. Missing: currency, probability, expected close date, labels, status open/won/lost as a field (it is the stage kind), custom fields, product-derived value, create-with-title-only, full field history. | — | CRM-01, CUS-01, CUS-06, CRM-07 | |
| PIP-04 Deal detail view | Partial | Company page `CRM/prospects/[id]/page.tsx:1-147`: details card, contacts, activity log with kinds, mail summary | No followers, no Won/Lost buttons, no stage progress bar, no tabs (notes, activity, call, email, files, documents, invoice), no Focus list, no History filter, no changelog with field/old/new/user/time/source, no reorderable sidebar. | — | PIP-09, CRM-05, CRM-06, COM-02, DOC, INT-08 | |
| PIP-05 Deal rotting | Missing | Cards show "N days" since stage change (`CA/CrmBoard.tsx:174-180`) but nothing compares it with a threshold | No threshold per stage, no red flag, no owner notification, no idle clock reset rules. | — | PIP-02, SF-26, SF-07 | |
| PIP-06 Deal labels | Partial | Free-text `tags[]` on companies (`LA/crm.ts:308-340`, `LA/crmActions.ts:321-374`) | Not colour-coded, not shown on cards or list rows, no company filter by tag (segments filter contact tags only, `LA/crm.ts:92-108`), no label management behind a settings permission. | — | SEC-07 | |
| PIP-07 Won, lost and lost reasons | Partial | Won/lost are stage kinds; a lost-kind stage asks for a free-text `lost_reason` (`CA/CrmPipelineForms.tsx:131`); won this quarter and win rate shown (`CRM/pipeline/page.tsx:30-31`) | No predefined reason list, no "reason mandatory" setting, no optional comment saved as a note, no explicit reopen that clears status, lost reason is not a reporting dimension. | — | INS-01 | |
| PIP-08 Participants | Missing | A company has many contacts (`CRM/prospects/[id]/page.tsx:84-98`), which is not participation in a deal | No participant link, no suggestion in a composer (there is no 1:1 composer), no bulk import of participants. | — | PIP-03, COM-02 | |
| PIP-09 Followers | Missing | — | No follower table, no notifications. | — | SF-07 | |
| PIP-10 List view | Partial | List view sorted by value (`CA/CrmBoard.tsx:202-223`); companies table (`CRM/prospects/page.tsx:84-117`); bulk stage move ≤500 (`LA/crmActions.ts:406-420`) | No selectable columns, multi-column sort, inline edit, bulk edit of other fields, bulk delete, CSV/XLSX export, visible system ID, admin default columns, bulk-edit permission, changelog per changed deal. | Second-admin approval | SEC-07, CRM-10 | |
| PIP-11 Forecast view | Missing | — | No date columns, totals or drag to change date (and no expected close date field). | — | PIP-03 | |
| PIP-12 Filters | Partial | Company search `?q=` and stage chips (`CRM/prospects/page.tsx:42-77`); contact search and type (`CRM/contacts/page.tsx:55-70`); saved contact segments with 13 dimensions (`LA/crm.ts:92-108`) | No global search across records, no ALL/ANY condition groups, no saved filter visibility or favourite, nothing on leads/activities/projects/products, no custom-field conditions. | — | SF-25, CUS-01 | |
| PIP-13 Archive | Missing | Stages can be archived and `parked` is a stage kind (`LA/crm.ts:254-266`); deals themselves cannot be archived | No archive/unarchive of a deal or lead, no archive view. | — | PIP-16 | |
| PIP-14 Deal card customization | Missing | Card fields are fixed in `CA/CrmBoard.tsx:174-180` | No per-pipeline card field choice. | — | PIP-02 | |
| PIP-15 Closed deals toggle and stage timing | Partial | Stage history exists and feeds win rate (`mig/0137_crm_win_rate_steps.sql`; `supabase/tests/crm_win_rate_invariants.sql`); lost/parked stages listed as links under the board (`CA/CrmBoard.tsx:227-235`) | No toggle to show won/lost on the board, no per-user memory, no progress bar with days per stage. | — | PIP-04 | |
| PIP-16 Capacity and waitlist | Missing | — | No capacity setting, waitlist, or overflow path. (Spec default is no limit; the mechanism still has to exist.) | Plan gates and usage limits | ENT-02 | |
| PIP-17 Duplicate and restore | Missing | — | No duplicate, no soft delete or restore of a company/deal. | — | CRM-12 | |

## Activities (ACT)

| ID and name | Status | Evidence | Missing or different | Settings | Depends on | WP |
| --- | --- | --- | --- | --- | --- | --- |
| ACT-01 Activities | Partial | `app.crm_activities` kinds call/email/reply/meeting/note/task/stage, body, due date, done_at, company, contact, admin (`LA/crm.ts:352`; `admin_crm_activity` `mig/0093_crm_stages.sql:544`; done `admin_crm_task_done` `mig/0143_growth_crm.sql:1488`); auto tasks marked `auto:<key>` (`CRM/prospects/[id]/page.tsx:30-33`) | No time of day or duration, no owner distinct from the logging admin, links only to a company (+contact), not to deal/lead/project; completion does not emit an event that automations can use. Types lack lunch/deadline. | — | PIP-03, SF-36 | |
| ACT-02 Custom activity types and fields | Missing | Kinds are a fixed enum (`LA/crm.ts:352`) | No admin-managed types or activity custom fields. | — | CUS-01 | |
| ACT-03 Calendar and list views | Partial | Task list with open/done/all views (`CRM/tasks/page.tsx:1-150`) | No day/week/month calendar, no filters by user/type, no drag to reschedule, no team view. | — | ACT-09 | |
| ACT-04 Reminders | Missing | Only the inbound-lead SLA clock (`CRM/inbox/page.tsx`) | No reminders by any channel, no daily summary, no notification center. | — | SF-07 | |
| ACT-05 Priority labels | Missing | Priority dot is derived, schema has none (`CRM/tasks/page.tsx:27-28`) | No priority field, filter or sort. | — | — | |
| ACT-06 Bulk activities | Missing | — | No bulk create/edit of activities. | — | SEC-07 | |
| ACT-07 Next-step prompt | Missing | — | No prompt on done; no warning icon for deals without a planned activity. | — | ACT-01 | |
| ACT-08 Activity invites | Missing | — | No guests or calendar invites. | — | ACT-09 | |
| ACT-09 Calendar sync | Missing | — | No Google/Microsoft calendar connection. | — | INT-05, INT-06 | |

## CRM records (CRM)

| ID and name | Status | Evidence | Missing or different | Settings | Depends on | WP |
| --- | --- | --- | --- | --- | --- | --- |
| CRM-01 People and organizations | Partial | Contacts `app.crm_contacts` (`LA/crm.ts:32-55`) and companies (`LA/crm.ts:308-340`), list/detail pages (`CRM/contacts/*`, `CRM/prospects/*`); synced from signed-in users (`app.crm_sync`); respondents never contacts (`supabase/tests/crm_invariants.sql:1-6`) | Person lacks phones, owner, labels-as-labels, custom fields; organization lacks address, labels, custom fields. Detail views show no deals list (one deal = the company), no files, no emails beyond campaign sends. Contacts are not "auto-linked" to `app.organizations` beyond `org_id`; CRM companies and customer orgs are two tables (see 06 Q). | Contact rule | CUS-01, CRM-05 | |
| CRM-02 Contacts timeline | Partial | Per-contact send timeline table (`CRM/contacts/[id]/page.tsx:81-101`) | No one-row-per-record time-axis view, today marker, overdue in red, or look-back/frequency controls. | — | ACT-01 | |
| CRM-03 Contacts map | Missing | — | No geocoding, map or address-based filter. | — | CRM-01 | |
| CRM-04 Contact sync | Missing | — | No address-book sync. | Contact rule | INT-05, INT-06 | |
| CRM-05 File attachments | Missing | — | No files on CRM records. | — | SF-33 | |
| CRM-06 Notes, mentions and comments | Partial | Note-kind activities on companies (`CA/CrmPipelineForms.tsx:165`); @mentions exist in tickets, not CRM | No rich text, no @mention notification, no comment threads, no pinning, nothing on contacts. | — | SF-07 | |
| CRM-07 Product catalog | Missing | — | No products, prices or product lines. | — | CUS-06 | |
| CRM-08 Subscriptions and installments | Conflict | No product lines; no billing mirror: Stripe is absent and billing is invoice/EHF with the price list in code (D-93, D-163, D-164, D-170 in `docs/DEVIATIONS.md`) | **Conflict:** the spec takes Orgpuls recurring figures "from the billing mirror"; no billing mirror exists. Missing: recurring products, installments, MRR/ARR/ACV/TCV per deal. | — | CRM-07 | |
| CRM-09 Import | Partial | Contact CSV import ≤5,000 rows with rejected rows returned (`LA/crmActions.ts:94-123`; `admin_crm_import` `mig/0141_growth_foundations.sql:1057`); company import from Brønnøysund ≤200 (`admin_crm_company_import` `:961`) | No all-entities session, no column-to-field mapping UI (fixed columns, `CA/CrmForms.tsx:167`), no merge-or-create choice, no downloadable skip file, no import history or revert. The admin spec's "consent source required per row" is the code's behaviour today (consent_source column) — the brief makes it a setting, off by default. | Consent source on import; Contact rule | AIA-05, ENT-02 | |
| CRM-10 Export | Partial | Consent ledger CSV with formula-safe cells (`CRM/consent/export/route.ts:1-30`, logs `crm.consent_export`) | No export of contact, company or deal list views, no XLSX, no export permission, no SEC-02 alert. | — | SEC-07, SEC-02 | |
| CRM-11 Merge duplicates | Missing | Org merge in the admin spec is also missing (see 04) | No matching rules, duplicate list, compare view or merge. | Second-admin approval | SF-10 | |
| CRM-12 Restore data | Missing | Contacts can be erased with a reason (`admin_crm_contact_action` `mig/0055_crm.sql:721`) — a hard erase, not a soft delete | No soft delete, 30-day restore list, bulk revert or purge job for CRM records. | Second-admin approval | SF-15 | |
| CRM-13 Related organizations | Missing | — | No parent/daughter/related links. | — | — | |
| CRM-14 Contact labels | Partial | Free-text `tags[]` on contacts, filterable in segments (`LA/crm.ts:92-108`) | No colour, no label set separate from deals/leads, not a managed list. | — | — | |
| CRM-15 Source fields | Partial | Contact `source` (user/newsletter/contact_form/import/manual/event/brreg, plus `demo` written by `mig/0146_demo_signup.sql:106-107` but missing from `LA/crm.ts:15`); company `source` (`LA/crm.ts:308-340`) | No source on leads/deals as a separate record, values differ from the spec list (no API, automation, app, prospect search, web form, chatbot, live chat, web visitors, campaign, messaging), not a reporting dimension. `demo` is not filterable. | — | INS-01 | |

## Customization (CUS)

| ID and name | Status | Evidence | Missing or different | Settings | Depends on | WP |
| --- | --- | --- | --- | --- | --- | --- |
| CUS-01 Custom fields | Missing | Every CRM field is a fixed column | No field definitions, groups or JSON values. | Count limits (options per field) | SF-38 | |
| CUS-02 Field quality rules | Missing | — | No important/required rules or descriptions. | — | CUS-01 | |
| CUS-03 Pipeline-specific and read-only fields | Missing | — | — | — | CUS-01, SEC-07 | |
| CUS-04 Formula fields | Missing | — | — | — | CUS-01 | |
| CUS-05 Languages and locale | Partial | Admin is English by decision, from next-intl `admin` namespace with `locale:'en'` forced (`app/(admin)/admin/layout.tsx:58`); `messages/no.json` carries a near copy that can never render | No per-user interface language, date/number format or time zone; number formatting is mixed en-GB/nb-NO (`CRM/page.tsx:13` vs `CRM/campaigns/page.tsx:62`). | — | — | |
| CUS-06 Currencies | Missing | Value is `value_nok` (`mig/0119_crm_deal_value.sql:23`) | No currency field, rates or conversion. | — | — | |
| CUS-07 Module switches and rule settings | Partial | One-row settings tables: `crm_settings` (customer exception, super_admin only, `mig/0145_brreg_settings_where.sql:65`), SLA, daily cap, reply stage, brreg dry run; feature flags are env + JSON (`lib/flags.ts`) | No settings registry with key/type/options/default/scope; none of the 15 register rows exists as a setting; no module switches; no "which setting blocked you" message. Changes are audited via `app.admin_log`. | All rows of the register | SF-34 | |
| CUS-08 Sandbox | Partial | Local QA tenant Lumio AS / Kari Nordmann (`scripts/qa/seed.mjs:2,47,171`) and admin fixture (`scripts/seed/sentral-fixture.mjs`), local only; hosted demo template "Demobedriften AS" (`scripts/seed/demo-org.mjs`) | No sandbox company inside the admin, no sample records marked as samples and removable in one step. | — | — | |

## Leads (LEA)

| ID and name | Status | Evidence | Missing or different | Settings | Depends on | WP |
| --- | --- | --- | --- | --- | --- | --- |
| LEA-01 Leads inbox | Partial | Inbound inbox of trial sign-ups, contact-form and demo contacts with a first-response SLA (`CRM/inbox/page.tsx:1-109`; `admin_crm_inbox` `mig/0112_crm_board_inbox.sql:117,140-146`); companies in a `lead` stage | No lead object; leads are companies in a stage and therefore **do** appear in the pipeline. No value, labels, archive toggle or sortable columns. | — | PIP-03 | |
| LEA-02 Lead labels | Missing | — | — | — | — | |
| LEA-03 Convert lead and deal | Missing | — | Nothing to convert (no lead object). | — | LEA-01 | |
| LEA-04 Lead creation and import | Partial | Contacts/companies created from contact form, demo request, newsletter signup, Brønnøysund import, CSV import and manually, each with a source (`lib/crm/actions.ts:28-47`; `mig/0146_demo_signup.sql:90-119`; `LA/crmActions.ts:724-738`) | Creates contacts/companies, not leads; no API, chatbot, live chat, prospect search or web-visitor channels. | — | LEA-01, CRM-15 | |
| LEA-05 Lead email | Missing | — | No 1:1 email. | — | COM-01, COM-02 | |
| LEA-06 Messaging inbox and social connector | Missing | — | The LinkedIn connector is undefined in the spec (open point 6). LinkedIn *steps* exist in journeys as manual tasks (`LA/crm.ts:28-30`), which is not a connector. | — | COM-13 | |

## Email and communications (COM)

| ID and name | Status | Evidence | Missing or different | Settings | Depends on | WP |
| --- | --- | --- | --- | --- | --- | --- |
| COM-01 BCC drop-box | Missing | — | — | — | — | |
| COM-02 Two-way email sync and inbox | Missing | Inbox has no message bodies by design (`CRM/inbox/page.tsx:15-19`) | No mailbox connection. | — | INT-05, INT-06 | |
| COM-03 Multiple mailboxes | Missing | — | — | — | COM-02 | |
| COM-04 Team inbox | Missing | Tickets are the shared inbox for support (separate module) | No team mailbox in the CRM. | — | COM-02 | |
| COM-05 Templates, signatures and merge fields | Partial | Campaign templates (seeded, `admin_crm_templates`), placeholders `{firma}`/`{navn}` with a "placeholder left" note (`CRM/templates/page.tsx:52-79`), sender signature (`admin_crm_sender_save`) | Marketing only; no private/shared 1:1 templates, no deal/user merge fields, no personalized hyperlinks, no per-account signature. | — | COM-02 | |
| COM-06 Open and click tracking | Partial | Campaign opens and clicks from Brevo events, Apple proxy opens excluded (`supabase/functions/orgpuls-mail-events/index.ts:156-172`; `record_crm_event`) | Not for 1:1 email; no real-time sender notification; no per-email switch. | Email open and click tracking | COM-02 | |
| COM-07 Group emailing | Missing | Campaigns are the marketing-stream bulk path (CMP) | No sales group email from list views. | Consent checks on sales email; Count limits | COM-02 | |
| COM-08 Email scheduling and outbox | Partial | Campaign scheduling and failure recording via `crm_mail_done` (`supabase/functions/orgpuls-dispatch/index.ts:756-799`) | No 1:1 scheduling, outbox, retry. | — | COM-02 | |
| COM-09 Labels, archiving and warnings | Missing | — | — | — | COM-02 | |
| COM-10 Meeting scheduler | Missing | — | — | — | ACT-09 | |
| COM-11 Video call links | Missing | — | — | — | COM-10 | |
| COM-12 Calling | Missing | — | — | — | provider | |
| COM-13 Messaging | Missing | — | — | — | provider | |
| COM-14 Mail client add-ons | Missing | — | — | — | INT-01 | |

## Automation (AUT)

| ID and name | Status | Evidence | Missing or different | Settings | Depends on | WP |
| --- | --- | --- | --- | --- | --- | --- |
| AUT-01 Workflow builder | Missing | Journeys are campaign chains with no builder; the page says event-triggered entry is not built (`CRM/journeys/page.tsx:106-118`) | No workflow entity, canvas, draft/active state. | Count limits | SF-04 | |
| AUT-02 Event triggers | Missing | Typed events table exists for growth (`growth_events`, see 02) | No record add/update/delete triggers. | Technical safeguards | SF-02 | |
| AUT-03 Date triggers | Missing | — | — | — | SF-26 | |
| AUT-04 Conditions | Partial | Follow-up mails fire on no_reply/no_click/no_open (`LA/crmActions.ts:547-575`) | Only that; no record conditions with AND/OR. | — | AUT-01 | |
| AUT-05 Delay and wait-for | Partial | `follow_days` delay and business-hours sending (`crm_mail_claim` `mig/0137_crm_win_rate_steps.sql:560`) | No delay-until-date, skip weekends, wait-for step, 7-day give-up. | Count limits | AUT-01 | |
| AUT-06 If/else branches | Missing | — | — | Plan gates | AUT-01 | |
| AUT-07 Actions | Partial | Journey steps send mail, move stage on send, create call/LinkedIn tasks (`LA/crm.ts:28-30`; `app.crm_step_tasks`) | No create/update/delete of records, notes, webhooks, Slack/Teams, Asana/Trello; no run history per action. | Consent checks on sales email; Count limits | AUT-01, INT-04 | |
| AUT-08 Workflow templates | Missing | — | — | — | AUT-01 | |
| AUT-09 Monitoring and limits | Missing | — | No run history, overview, failure alert or loop protection for CRM automation. | Technical safeguards | AUT-01 | |
| AUT-10 Ownership and sharing | Missing | — | — | — | SEC-07 | |
| AUT-11 Automatic assignment | Partial | `app.lead_route()` every 5 minutes creates founder/PQL callback tasks by score (`mig/0143_growth_crm.sql:887`) | Not owner assignment; no rules with conditions, assignee types, round robin, priority order or history. | — | SEC-09 | |
| AUT-12 Sequences | Partial | Mail/call/LinkedIn steps, follow-up days, business hours, daily cap, A/B winner, stage-targeted enrollment (`mig/0111_crm_sequences.sql`, `mig/0137_crm_win_rate_steps.sql`; `supabase/tests/crm_sequences_invariants.sql`, `crm_journeys_invariants.sql`) | No canvas, no manual or bulk enrollment of one record, no end-on-reply/stage-change per record, no per-record step and status (in progress/completed/failed), no skip step. | Consent checks on sales email | COM-02 | |

## Insights and reports (INS)

| ID and name | Status | Evidence | Missing or different | Settings | Depends on | WP |
| --- | --- | --- | --- | --- | --- | --- |
| INS-01 Report builder and types | Partial | Fixed reports: marketing overview (`CRM/page.tsx:26-82`), pipeline summary and win rate (`admin_crm_pipeline_summary`), campaign report (`CRM/campaigns/[id]/page.tsx`) | No report builder, measures/dimensions/segments, or the 17 report types. | Count limits | SF-14 | |
| INS-02 Charts | Missing | — | — | — | INS-01 | |
| INS-03 Dashboards | Missing | Admin dashboard `/admin` shows a fixed pipeline panel (`app/(admin)/admin/page.tsx:197-213`) | No user dashboards. | Plan gates | INS-01 | |
| INS-04 Sharing and collaboration | Missing | — | — | — | INS-03 | |
| INS-05 Goals | Missing | — | — | — | SEC-09 | |
| INS-06 Forecast reports | Missing | — | — | — | CRM-08 | |
| INS-07 Custom-field reporting | Missing | — | — | — | CUS-01 | |
| INS-08 Export | Missing | — | — | — | CRM-10 | |
| INS-09 AI report generation | Missing | — | — | — | SF-24 | |
| INS-10 Capacity and freshness | Partial | Reports read live tables (every page is `force-dynamic`, `app/(admin)/admin/layout.tsx:18-19`) | No report count limit and no rollups. | Plan gates | — | |

## Prospecting (PRO)

| ID and name | Status | Evidence | Missing or different | Settings | Depends on | WP |
| --- | --- | --- | --- | --- | --- | --- |
| PRO-01 Feed | Missing | Overview lists due tasks (`CRM/page.tsx:67-80`) | No feed tabs or cards. | — | SF-13 | |
| PRO-02 Feed actions | Missing | — | — | — | PRO-01 | |
| PRO-03 Scoring models | Partial | Lead scoring per contact, fit (Brønnøysund) × intent, read-only, weights in SQL (`CRM/scoring/page.tsx`; `admin_lead_scores` `mig/0143_growth_crm.sql:1407`); only hand-raise is sourced | Scores contacts, not deals; no configurable models, groups +25/+10/−10, AND/OR, per-pipeline activation or preview. The admin health score is not a criterion. | Count limits | PIP-02 | |
| PRO-04 Company enrichment | Partial | Brønnøysund register fills NACE, employees, municipality, general manager on import and "refresh managers" (`LA/crmActions.ts:681-764`; `LA/brreg.ts`) | No address/revenue/LinkedIn/website enrichment, no "only empty fields" guarantee verified, no credits, no hide-default-fields. | — | provider | |
| PRO-05 Person enrichment | Missing | — | — | Contact rule | provider | |
| PRO-06 Bulk enrichment and credits | Missing | — | — | Plan gates | PRO-04 | |
| PRO-07 Reverse lookup | Missing | — | — | Contact rule | PRO-04 | |

## AI assistant (AIA)

All seven are **Missing**: there is no model integration, AI gateway or AI feature in the admin (no LLM SDK in `package.json`).

| ID and name | Status | Evidence | Missing or different | Settings | Depends on | WP |
| --- | --- | --- | --- | --- | --- | --- |
| AIA-01 Assistant chat | Missing | — | — | — | SF-24 | |
| AIA-02 AI notifications | Missing | — | — | — | SF-24 | |
| AIA-03 Email writer | Missing | — | — | — | COM-02 | |
| AIA-04 Email summary and replies | Missing | — | — | — | COM-02 | |
| AIA-05 Import mapping | Missing | — | — | — | CRM-09 | |
| AIA-06 Integration recommendations | Missing | — | — | — | INT-11 | |
| AIA-07 Card scanner | Missing | — | — | Contact rule | MOB-01 | |

## Meeting intelligence (MTG)

All eight are **Missing**: no meetings, recordings or transcription exist.

| ID and name | Status | Evidence | Missing or different | Settings | Depends on | WP |
| --- | --- | --- | --- | --- | --- | --- |
| MTG-01 Pre-call brief | Missing | — | — | — | ACT-09 | |
| MTG-02 Notetaker bot | Missing | — | — | Recording consent notices | provider | |
| MTG-03 Desktop capture | Missing | — | — | — | provider | |
| MTG-04 Transcript and recap | Missing | — | — | — | SF-21 | |
| MTG-05 CRM update suggestions | Missing | — | — | Contact rule | SF-24 | |
| MTG-06 Transcript upload | Missing | — | — | — | MTG-04 | |
| MTG-07 Unscheduled calls | Missing | — | — | — | MTG-03 | |
| MTG-08 Workspace and controls | Missing | — | — | Recording consent notices | SEC-07 | |

## AI connector (MCP)

| ID and name | Status | Evidence | Missing or different | Settings | Depends on | WP |
| --- | --- | --- | --- | --- | --- | --- |
| MCP-01 MCP server | Missing | — | — | API rate limits | INT-01, INT-02 | |
| MCP-02 Tool catalog | Missing | — | — | — | INT-01 | |
| MCP-03 Admin controls | Missing | — | — | — | MCP-01 | |

## Email marketing (CMP)

| ID and name | Status | Evidence | Missing or different | Settings | Depends on | WP |
| --- | --- | --- | --- | --- | --- | --- |
| CMP-01 Email builder | Partial | Campaign studio, 15 block types up to 30, reorder/duplicate/remove, live desktop/phone/inbox preview through the dispatcher's renderer (`CA/CampaignStudio.tsx:381-762`; `LA/crm.ts:22-25`); unsubscribe and List-Unsubscribe on every send (`orgpuls-dispatch/index.ts:756-799`); test `tests/unit/campaign-design.test.ts:37-190` | No drag and drop, no rows/layout with border/background/padding, no HTML/video/social/menu/icon blocks, no blank-or-layout start choice beyond templates. Footer postal address not verified. | — | — | |
| CMP-02 Templates | Partial | Ten seeded templates with a gallery and "use" (`CRM/templates/page.tsx`; `supabase/tests/crm_pipeline_invariants.sql:6`) | No saving a design as a template, no code-your-own HTML, no template versioning in the admin. | — | — | |
| CMP-03 Audience | Partial | Segments over contact and org data with mailable count and preview (`admin_crm_segment_preview` `mig/0055_crm.sql:784`); lists with per-list consent | No engagement or location filters beyond `no_survey_days`; recipient count equals mailable matches (tested in `crm_invariants.sql`) — the acceptance is likely met but not verified on screen. | — | PIP-12 | |
| CMP-04 Marketing status and consent | Partial | Consent ledger (append-only), basis per contact, DOI, suppression list (hashed) across marketing sends, preference centre, RFC 8058 one-click (`mig/0141_growth_foundations.sql`, `mig/0143_growth_crm.sql:1053-1163`; `app/api/avmeld/route.ts`; `supabase/tests/consent_ledger_invariants.sql`) | Status set differs: pending/active/unsubscribed plus suppression reasons, not the seven named (no "pending upgrade", "archived", "bounced" as a status). The suppression list covers CRM sends; whether it covers every product send is Partial per 04. | Consent checks on sales email | — | |
| CMP-05 Scheduling and sending | Partial | Schedule or send now in Oslo time; marketing stream on its own authenticated sender domain (`orgpuls-dispatch/index.ts:741-809`) | No subscriber allowance entitlement. | Plan gates | — | |
| CMP-06 Campaign analytics | Partial | Delivered, bounced, unsubscribed, open/click/CTOR rates against a benchmark, link click map, 72-hour timeline (`CRM/campaigns/[id]/page.tsx:138-274`) | No spam-report figure shown, no total vs unique opens/clicks split, no top locations, no owner engagement notification; "five soft bounces → bounced" not found. | Email open and click tracking | — | |
| CMP-07 Automated campaigns | Partial | A campaign is a journey step targeted at a stage, with automatic follow-ups (`mig/0111_crm_sequences.sql`) | Not a step in a general workflow (no workflows). | — | AUT-01 | |
| CMP-08 Deliverability | Partial | DKIM/DMARC/SPF checks via DNS (`LA/mailDomain.ts:18-58`); the dispatcher refuses to send unless Brevo reports the marketing domain authenticated (`orgpuls-dispatch/index.ts:745-754`); pre-send inbox check blocks scheduling (`lib/crm/deliverability.ts:65-142`) | No account verification step, no list-hygiene warnings (sunset is "not built", `CRM/consent/page.tsx:27-30`). | — | — | |
| CMP-09 Campaign insights | Partial | Per-campaign benchmark against the last ten (`CRM/campaigns/[id]/page.tsx:178-186`) | No campaign reports in an insights area, no campaign-type filter, no multi-campaign comparison chart. | — | INS-01 | |

## Projects (PRJ)

All nine are **Missing**: no boards, projects or tasks outside CRM activities.

| ID and name | Status | Evidence | Missing or different | Settings | Depends on | WP |
| --- | --- | --- | --- | --- | --- | --- |
| PRJ-01 Boards and phases | Missing | — | — | — | — | |
| PRJ-02 Project record | Missing | — | — | — | PIP-03 | |
| PRJ-03 Work items | Missing | — | — | — | PRJ-02 | |
| PRJ-04 Dependencies and timeline | Missing | — | — | — | PRJ-03 | |
| PRJ-05 Project templates | Missing | — | — | — | PRJ-03 | |
| PRJ-06 Project health | Missing | — | — | — | SF-24 | |
| PRJ-07 Collaboration and sharing | Missing | — | — | — | CRM-06 | |
| PRJ-08 Bulk work and import | Missing | — | — | — | PRJ-03 | |
| PRJ-09 Automation and reports | Missing | — | — | — | AUT, INS | |

## Lead generation (LGN)

| ID and name | Status | Evidence | Missing or different | Settings | Depends on | WP |
| --- | --- | --- | --- | --- | --- | --- |
| LGN-01 Chatbot | Missing | — | — | — | LEA-01 | |
| LGN-02 Live chat | Missing | — | — | — | LGN-01 | |
| LGN-03 Web forms | Partial | Contact form files a ticket and joins the newsletter only when ticked (`components/site/ContactBlock.tsx:40-176`; `app/(marketing)/kontakt/actions.ts:22-43`; `submit_contact` `mig/0051_tickets.sql:282-320`); newsletter form with honeypot and DOI (`lib/crm/actions.ts:16-47`) | No form builder, templates, embedding, per-form ID/status, lead creation, owner notification, UTM/cookie/referrer capture on the form (UTM is captured on signup separately), or form statistics. | Form tracking fields | LEA-01 | |
| LGN-04 Prospect search | Partial | Brønnøysund register search by NACE, municipality, size, org form, adding companies with their general manager (`LA/crmActions.ts:681-738`; `LA/brreg.ts`) | A public company register, not a licensed person database; no person filters, saved filters, credits, or leads inbox target. | Contact rule; Plan gates | provider | |
| LGN-05 Embedding and consent | Partial | The fixed rule holds today: web analytics refuses respondent paths and never runs in the survey flow (`supabase/tests/web_invariants.sql`, `growth_firewall_invariants.sql`; see 04 §11) | No embed script for widgets (there are no widgets), no consent wording on forms/widgets, no consent-gated loading setting. | Consent-gated loading | LGN-01 | |

## Web visitors (WEB)

| ID and name | Status | Evidence | Missing or different | Settings | Depends on | WP |
| --- | --- | --- | --- | --- | --- | --- |
| WEB-01 Tracker | Partial | Cookieless beacon `/api/wv` → `track_web_event`, admin web dashboard (`app/api/wv/route.ts:37-77`; `app/(admin)/admin/web/*`) | One site (orgpuls.com); sites are not told apart by hostname. | Web visitor identification | — | |
| WEB-02 Organization identification | Conflict | Web analytics stores only a salted hash of IP + user agent with a daily rotating salt, by design and per the admin spec's cookieless consent position (see 04 §11) | **Conflict:** matching visits to companies needs the network address sent to an IP-to-company source; the current design deliberately keeps no IP. Needs a decision and a legal check (06). | Web visitor identification | provider | |
| WEB-03 Visitor inbox and ranking | Missing | — | — | — | WEB-02 | |
| WEB-04 Convert and reveal | Missing | — | — | Contact rule | WEB-02 | |

## Documents and e-sign (DOC)

All six are **Missing**.

| ID and name | Status | Evidence | Missing or different | Settings | Depends on | WP |
| --- | --- | --- | --- | --- | --- | --- |
| DOC-01 Templates and merge fields | Missing | — | — | — | PIP-03 | |
| DOC-02 Product tables | Missing | — | — | — | CRM-07 | |
| DOC-03 Cloud storage | Missing | — | — | — | INT-05, INT-06 | |
| DOC-04 Trackable links | Missing | — | — | — | DOC-01 | |
| DOC-05 E-signatures | Missing | — | — | Count limits (signers) | DOC-01 | |
| DOC-06 Branding and external signing | Missing | — | — | — | DOC-05 | |

## Security and permissions (SEC)

| ID and name | Status | Evidence | Missing or different | Settings | Depends on | WP |
| --- | --- | --- | --- | --- | --- | --- |
| SEC-01 Security dashboard | Missing | Logins write `admin.login` audit rows only (see 01) | No dashboard. | — | SEC-04 | |
| SEC-02 Security alerts | Missing | — | No login, invite, failed-login, reset or large-export alerts. | — | SF-27 | |
| SEC-03 Security rules | Missing | — | No password/IP/time rules; the admin spec's optional IP allowlist is also missing (04). | — | SF-27 | |
| SEC-04 Device and login history | Missing | — | No device log or remote log-out. | — | SF-27 | |
| SEC-05 Single sign-on | Missing | Entra sign-in exists for customers (`mig/0155_entra_signin.sql`), not for admin staff | No SSO for the admin. | — | — | |
| SEC-06 Two-factor authentication | Partial | TOTP is required for admin roles: `app.admin_role()` only grants a role at aal2 (`mig/0049_platform_admin.sql:64-72`); `/admin/mfa` enrolment | No email code factor, no account recovery, no remembered login email. | — | — | |
| SEC-07 Permission sets | Partial | Role enum `app.platform_role`: super_admin, support, finance, analyst, marketing (0055), editor (0125); CRM read/write functions (`mig/0055_crm.sql:505-511`) | Roles, not permission sets; no per-action sets (create, edit, delete, import, export, bulk edit, change visibility, view reports), no custom sets, no sales/project roles. `editor` cannot be granted from the UI (bug, 04). | Plan gates | open point 10 | |
| SEC-08 Visibility groups | Missing | — | No groups, item visibility or owner-based RLS on CRM rows. | Plan gates | SEC-09 | |
| SEC-09 Users and teams | Partial | Admin users and roles page (`app/(admin)/admin/admins/page.tsx`; `public.admin_set_admin` `mig/0055_crm.sql:1071`) | No teams, no record reassignment on deactivate, no copy access settings, no user overview of followed items. | — | — | |
| SEC-10 Data protection | Partial | EU region (Supabase eu-central-1, Vercel `fra1`); provider secrets in Supabase Vault; survey tables closed to all client roles (CLAUDE.md invariants; `supabase/tests/respondent_invariants.sql`) | Backups and recovery objectives not recorded in the admin; no restore test (04 §7). | — | — | |
| SEC-11 Privacy compliance | Partial | Contact erase and unsubscribe with reason, consent ledger with CSV export, suppression, personvern ticket queue with 30-day clock (04 §13) | No export of one person's CRM data, erasure does not cover emails/recordings/transcripts/enrichment (those modules do not exist), subprocessor register status Partial (04). | — | — | |

## Integrations and API (INT)

All eleven are **Missing** for the CRM. Slack and Teams integrations exist for the *product* (invitations, `mig/0176_teams_channel.sql`, `mig/0185_slack_channel.sql`) and Entra for customer sign-in; none serves the CRM.

| ID and name | Status | Evidence | Missing or different | Settings | Depends on | WP |
| --- | --- | --- | --- | --- | --- | --- |
| INT-01 REST API | Missing | — | No public versioned API; PostgREST is internal. | — | SF-22 | |
| INT-02 Authentication | Missing | — | No personal tokens or OAuth apps. | Count limits | INT-01 | |
| INT-03 Rate limits | Missing | — | — | API rate limits | INT-01 | |
| INT-04 Webhooks | Missing | Inbound Brevo webhook only | No outbound subscriptions. | Technical safeguards; Count limits | SF-23 | |
| INT-05 Google Workspace | Missing | — | — | — | — | |
| INT-06 Microsoft 365 | Missing | Entra/Teams exist for the product only | — | — | — | |
| INT-07 Team chat | Missing | Slack/Teams exist for the product only | No deal events to chat. | — | — | |
| INT-08 Invoicing | Missing | — | — | — | open point 2 | |
| INT-09 Automation platforms | Missing | — | — | — | INT-01, INT-04 | |
| INT-10 App extensions | Missing | — | — | — | INT-02 | |
| INT-11 Integration catalog | Missing | — | — | — | — | |

## Mobile app (MOB)

All eight are **Missing**: there is no mobile client. The admin layout is checked at 390 px by `scripts/verify/sentral-run.mjs --width 390`, which is a responsive web check, not an app.

| ID and name | Status | Evidence | Missing or different | Settings | Depends on | WP |
| --- | --- | --- | --- | --- | --- | --- |
| MOB-01 Core app | Missing | — | — | Contact rule | INT-01 | |
| MOB-02 Focus view | Missing | — | — | — | MOB-01 | |
| MOB-03 Nearby | Missing | — | — | — | CRM-03 | |
| MOB-04 Calls and texts | Missing | — | — | — | COM-12 | |
| MOB-05 Offline mode | Missing | — | — | — | SF-31 | |
| MOB-06 Capture | Missing | — | — | — | CRM-05 | |
| MOB-07 Push notifications | Missing | — | — | — | SF-07 | |
| MOB-08 Mobile extras | Missing | — | — | — | LGN-02 | |

## Plans and entitlements (ENT)

| ID and name | Status | Evidence | Missing or different | Settings | Depends on | WP |
| --- | --- | --- | --- | --- | --- | --- |
| ENT-01 Feature gating | Missing | Env feature flags `lib/flags.ts` are global rollout switches, not plan entitlements | No entitlement table. | Plan gates | — | |
| ENT-02 Usage limits | Missing | — | — | Plan gates | ENT-01 | |
| ENT-03 Plans, add-ons and top-ups | Conflict | Billing is invoice/EHF with the price list in code; no Stripe or plan catalogue rows (D-93, D-163, D-164, D-170) | **Conflict:** the spec says "uses the existing billing"; there is no billing system to buy add-ons or top-ups through. | Plan gates | — | |
| ENT-04 Usage screen and limit handling | Missing | — | — | Plan gates | ENT-02 | |

---

## User flows (Part D)

Each step is given a status. A flow is Implemented only when every step is.

| Flow | Steps Implemented / Partial / Missing | Flow status | Notes per step |
| --- | --- | --- | --- |
| UF-01 Capture and qualify a lead | 0 / 3 / 4 | Partial | 1 Partial (contact form, demo, newsletter, import create contacts with source; no lead object) · 2 Missing (no assignment rules) · 3 Partial (company page shows register data; no chat/form answers) · 4 Partial (log an activity; no 1:1 email/call) · 5 Missing (no labels/archive) · 6 Missing (no conversion) · 7 Missing |
| UF-02 Work a deal to won or lost | 0 / 3 / 4 | Partial | 1 Missing (no warning/rotting) · 2 Partial (company page, no Focus/History) · 3 Partial (mark task done; no prompt) · 4 Partial (drag works; no required fields) · 5 Missing (no products) · 6 Missing as specified (won/lost via stage; no reason list) · 7 Missing (no workflows) |
| UF-03 Daily routine in the feed | 0 / 0 / 5 | Missing | No feed |
| UF-04 Email outreach with tracking | 0 / 0 / 7 | Missing | No 1:1 composer |
| UF-05 Nurture with a sequence | 0 / 3 / 3 | Partial | 1 Partial (journey steps) · 2 Missing (stage-targeted only) · 3 Partial (automatic mail; manual call/LinkedIn tasks) · 4 Partial (tasks for owner) · 5 Missing (no per-record end) · 6 Missing (no per-record status) |
| UF-06 Book a meeting | 0 / 0 / 5 | Missing | — |
| UF-07 Run a meeting with meeting intelligence | 0 / 0 / 6 | Missing | — |
| UF-08 Quote to signature | 0 / 0 / 7 | Missing | — |
| UF-09 Set up the sales process | 0 / 2 / 3 | Partial | 1 Partial (stages, no probability/rotting, one pipeline) · 2 Missing · 3 Missing · 4 Partial (admin users and roles; no teams/groups/sets) · 5 Missing |
| UF-10 Import and clean data | 0 / 1 / 5 | Partial | 1 Missing (no mapping) · 2 Missing · 3 Partial (rejected rows returned on screen) · 4 Missing · 5 Missing · 6 Missing |
| UF-11 Build a workflow | 0 / 0 / 7 | Missing | — |
| UF-12 Set up automatic assignment | 0 / 0 / 5 | Missing | — |
| UF-13 Reports, dashboards and goals | 0 / 0 / 5 | Missing | — |
| UF-14 Scoring and enrichment | 0 / 2 / 4 | Partial | 1 Missing · 2 Missing · 3 Partial (lead scores on contacts) · 4 Partial (Brønnøysund import/refresh) · 5 Missing · 6 Missing |
| UF-15 Security administration | 0 / 1 / 5 | Partial | 2 Partial (TOTP enforced; no SSO) · others Missing |
| UF-16 Connect systems | 0 / 0 / 6 | Missing | — |
| UF-17 Send an email campaign | 1 / 4 / 1 | Partial | 1 Implemented in effect (sending blocked until the marketing domain is authenticated; needs on-screen check) · 2 Partial (no drag builder) · 3 Partial (segments; subscribed-only counts) · 4 Partial (schedule/now) · 5 Partial (bounces suppress; statuses differ) · 6 Missing (no comparison) |
| UF-18 Website visitor to lead | 0 / 1 / 5 | Missing | 6 Partial (contact form) |
| UF-19 Identify web visitors | 0 / 0 / 5 | Missing | 1 the tracker exists but cannot identify companies (WEB-02 Conflict) |
| UF-20 Hand over a won deal to delivery | 0 / 0 / 6 | Missing | — |
| UF-21 Field visit on mobile | 0 / 0 / 5 | Missing | — |
| UF-22 Work through an external AI assistant | 0 / 0 / 5 | Missing | — |
| UF-23 Manage contacts and organizations | 0 / 3 / 4 | Partial | 1 Partial (company page: contacts and activities; no tickets/files) · 2 Partial (add contact; consent source currently required for new contacts) · 3 Partial (note activity; no mention/file) · 4 Missing · 5 Missing · 6 Missing · 7 Missing |
| UF-24 Review and maintain the pipeline | 0 / 2 / 5 | Partial | 1 Partial (company search) · 2 Partial (list view, no columns/inline edit) · 3–7 Missing (bulk stage move only) |
| UF-25 Calls, messages and shared inboxes | 0 / 0 / 6 | Missing | — |
| UF-26 Recurring revenue and forecast | 0 / 0 / 5 | Missing | 5 Conflict with no billing mirror (CRM-08) |
| UF-27 Work with the AI assistant | 0 / 0 / 5 | Missing | — |
| UF-28 Plans and limits | 0 / 0 / 4 | Missing | — |
| UF-29 Set rules and limits | 0 / 1 / 5 | Missing | 4 Partial (setting changes are audited) |

**Counts:** 0 Implemented, 11 Partial, 18 Missing.

## System flows (Part E)

| Flow | Status | Evidence | Missing or different |
| --- | --- | --- | --- |
| SF-01 Permission and visibility check | Partial | Step 1: session + admin role + aal2 (`app.admin_role`); step 2 as roles (`crm_can_read/write`); step 6: refusals return `not_allowed`; reads mostly audited; survey tables closed | No permission sets, no row visibility, no field rules, no entitlements; ~13 CRM reads write no audit row (03). |
| SF-02 Record change and event publication | Missing | `app.admin_log` writes an audit row inside each write RPC; growth events table exists | No changelog entries, no CRM events, no dispatcher to subscribers. |
| SF-03 Email sync | Missing | — | — |
| SF-04 Workflow execution | Missing | Journey claim loop is the nearest engine (`crm_mail_claim`) | No workflows. |
| SF-05 Sequence scheduler | Partial | `crm_mail_claim` computes follow-up times in business hours and creates step tasks | No per-record enrollment, consent setting, end on reply/stage change per record. |
| SF-06 Assignment engine | Missing | `app.lead_route()` creates tasks, not owners | — |
| SF-07 Notifications and reminders | Missing | — | — |
| SF-08 Calendar sync | Missing | — | — |
| SF-09 Import pipeline | Partial | Contact import validates rows and returns rejected rows (`admin_crm_import`) | No mapping suggestion, duplicate rule, capacity check, import ID, skip file, history or revert. |
| SF-10 Duplicate detection and merge | Missing | — | — |
| SF-11 Enrichment | Partial | Brønnøysund lookup on import/refresh | No credits, provider adapter, field-level source and date. |
| SF-12 Scoring | Partial | Lead scores computed on read (`admin_lead_scores`) | Not per deal, no models, no stored score or event. |
| SF-13 Feed generation | Missing | — | — |
| SF-14 Report query | Missing | — | — |
| SF-15 Delete, restore and erasure | Partial | Contact erase with reason; org deletion queue (04) | No CRM soft delete, restore or purge. |
| SF-16 Entitlements and metering | Missing | — | — |
| SF-17 Lead capture from forms and chat | Partial | Contact form → ticket (+newsletter if ticked) with honeypot; demo → contact | No lead creation, assignment or resubmission rule. |
| SF-18 Web visitor identification | Conflict | Cookieless hashing | See WEB-02. |
| SF-19 Campaign send | Partial | Steps 1–6 largely present: audience resolved to mailable, rendered per recipient, sent on the marketing stream, Brevo events update figures and suppression, unauthenticated domain blocks the send (`orgpuls-dispatch/index.ts:741-809`) | Per-address status model differs (CMP-04); suspended-account check not found. |
| SF-20 Document and signature | Missing | — | — |
| SF-21 Meeting intelligence pipeline | Missing | — | — |
| SF-22 API request and rate limiting | Missing | — | — |
| SF-23 Webhook delivery | Missing | — | — |
| SF-24 AI gateway call | Missing | — | — |
| SF-25 Search | Missing | Per-page `ilike` search only | No index. |
| SF-26 Scheduled checks | Partial | pg_cron runs dispatch, lead routing and Brønnøysund polling (01) | No rotting, date-trigger, goal or feed checks; no run record with alert for these. |
| SF-27 Sign-in and security events | Partial | Password + TOTP; `admin.login` audit row | No rules, device/location log, alerts. |
| SF-28 Calls and messages | Missing | — | — |
| SF-29 Contact sync | Missing | — | — |
| SF-30 Live chat routing | Missing | — | — |
| SF-31 Mobile offline sync | Missing | — | — |
| SF-32 Derived values | Partial | Step 5: stage history closes and opens per move (win rate) | No product, schedule, formula or currency derivations. |
| SF-33 Files | Missing | — | — |
| SF-34 Rule settings | Missing | Scattered one-row settings, no registry | — |
| SF-35 Deal lifecycle | Partial | Create, move with history, lost reason (as company) | No field rules, forecast date, stage delete target, archive, duplicate, restore. |
| SF-36 Activity lifecycle | Partial | Create, complete with stamp | No custom types, bulk, calendar, completion event, next-step prompt. |
| SF-37 Records, links and list operations | Partial | Contacts/companies with source | No labels as links, relations, participants, followers, geocoding, bulk edit changelog, list export. |
| SF-38 Field and configuration registry | Missing | — | — |
| SF-39 Campaign authoring and insights | Partial | Studio saves blocks; test send and previews use the dispatcher's renderer; events rolled up per campaign | No template store save, no insights area/comparison. |
| SF-40 Video links and mail client add-ons | Missing | — | — |
| SF-41 Connectors, app platform and AI connector tools | Missing | — | — |
| SF-42 Project lifecycle | Missing | — | — |
| SF-43 User administration and data protection | Partial | Admin role assignment, deactivate (04 §10) | No teams/visibility, transfer on deactivate, copy access, backup records. |
| SF-44 Mobile client | Missing | — | — |
| SF-45 Lead lifecycle | Missing | — | No lead object. |

**Counts:** 0 Implemented, 16 Partial, 28 Missing, 1 Conflict.

## Settings register (Part C, CUS-07)

| Setting | Status | Evidence | What exists |
| --- | --- | --- | --- |
| Contact rule | Conflict | The admin spec's hard rule "only users and prospects who opted in" is partly built: a new contact needs a consent source (`LA/crmActions.ts:40-75`) | The brief makes it a setting, default *no rule*. Today's behaviour is closer to "source and basis required". Changing the default weakens an existing check → R7 and CLAUDE.md "stop and ask". |
| Consent source on import | Conflict | `consent_source` column on the import (`CA/CrmForms.tsx:167`) | Same as above: brief default *off*. |
| Consent and suppression checks on sales email | Missing | No sales email exists | — |
| Email open and click tracking | Missing (as a setting) | Tracking is always on for campaigns | — |
| Form tracking fields | Missing | — | — |
| Web visitor identification | Missing | — | See WEB-02 Conflict. |
| Second-admin approval | Missing | — | — |
| Count limits | Missing | Fixed caps exist in code: 30 blocks per campaign, 5,000 import rows, 500 bulk moves, 200 register imports, daily cap setting (1..5000 or empty = none) | The fixed caps are hard-coded limits, which R5 forbids; each must become a setting or be justified (06). |
| Plan gates and usage limits | Missing | — | — |
| API rate limits | Missing | — | — |
| Technical safeguards | Missing | — | — |
| Anonymity firewall | Partial | Fixed in the database (CLAUDE.md invariants 1–3; `respondent_invariants.sql`, `growth_firewall_invariants.sql`, `crm_invariants.sql`) | Already a constant; new CRM code must keep it. Not in any registry (correct). |
| Typed reason for CRM actions | Partial | Unsubscribe/erase/list-remove/settings already require a reason (`LA/crmActions.ts:77-133,808-816`) | Required on those actions today; the brief makes it a setting, off by default → R7 question. |
| Consent-gated loading of site widgets | Missing | No widgets | — |
| Recording consent notices to attendees | Missing | — | — |

**Counts:** 0 Implemented, 2 Partial, 10 Missing, 3 Conflict.

## Part F — entities and conventions

| Domain | Status | Existing tables (02) | Missing |
| --- | --- | --- | --- |
| Identity | Partial | `app.platform_admins`, `app.admin_audit`, role enum | team, team_member, visibility_group, permission_set |
| Records | Partial | `app.organizations` (customers), `app.crm_companies`, `app.crm_contacts`, suppression, consent ledger | organization_relation, label, follower; **two company tables** (customer orgs and CRM companies) need a decision |
| Sales | Partial | stages (`crm_stages`), stage history, companies-as-deals | pipeline, deal, deal_participant, lead, lost_reason, saved_filter (segments exist for contacts) |
| Products | Missing | — | all |
| Activities | Partial | `app.crm_activities` | activity_type, activity_guest |
| History | Missing | — | note, comment, file, mention, changelog |
| Email | Partial | campaign sends and CRM mail events | mail_account, mail_thread, mail_message, mail_link, mail_template (1:1), signature (senders have one) |
| Scheduling, calls, messaging | Missing | — | all |
| Automation | Partial | campaign chains, step tasks | workflow, workflow_version, runs, assignment_rule/log, sequence/enrollment as records |
| Insights | Missing | — | all |
| Prospecting | Partial | lead score functions | score_model, criterion, deal_score, feed_card, enrichment_request, credit_ledger |
| Marketing | Partial | consent, suppression, segments, campaigns, recipients/events, sender | sender_domain as a row (DNS checked live) |
| Projects | Missing | — | all |
| Lead generation | Missing | — | all |
| Web visitors | Partial | web events | tracked_site, visitor_company, visit |
| Documents | Missing | — | all |
| Meetings | Missing | — | all |
| Platform | Partial | events (growth), settings (one-row tables), integrations for product | custom_field, translation registry for admin, setting registry, import_job, waitlist_item, installed_app, device_token, notification, webhook, api_token, oauth, entitlement, usage_counter, login_log, security_rule |

Conventions: product ID on every row — Partial (missing on many later admin tables, 04 §14); owner/visibility/created/updated/deleted/version — Missing on CRM tables (02); custom field JSON — Missing; configuration as versioned rows — Partial (stages, templates, segments are rows, unversioned); 30-day soft delete — Missing; change + changelog + event in one transaction — Missing (audit row only); read audit — Partial.

Event catalog: Missing for every CRM family; the product families exist as growth events. API surface: Missing.

**Counts:** 0 Implemented, 10 Partial, 8 Missing (domains).

## Part G — non-functional requirements

| Area | Status | Evidence / gap |
| --- | --- | --- |
| Anonymity firewall | Partial | Holds today and is tested; must be re-proved per new migration (A8). Note the admin spec says n ≥ 5, the product floors k at 3 (D-198). |
| Rule settings | Missing | No registry. |
| Access | Partial | Admin roles + mandatory TOTP; product ID not on every table. |
| Audit | Partial | Writes audited; ~40 admin reads (13 CRM) not; no typed-reason setting; no run histories beyond tickets/campaigns. |
| Data residency | Partial | Database eu-central-1, Vercel fra1; Brevo is the mail provider (region to confirm). |
| Sending | Partial | Streams separate; no sales email exists. |
| Job runtime | Partial | pg_cron + edge functions exist; mail sync/meeting capture do not fit (open point 3). |
| Recovery | Missing | No recorded objectives or restore test. |
| Scale | Unknown | Not measured; 500-row caps in company reads. |
| Performance | Unknown | Not measured (A8 asks for timings with seeded volume). |
| Monitoring | Partial | No job monitor screen per 04 §10. |
| AI governance | Missing | No AI. |
| Privacy | Partial | Erasure for contacts; no recording consent (no recordings). |
| Destructive actions | Partial | Contact erase requires a reason; no preview/soft delete/second admin. |
| Interface language | Implemented | English, by decision (layout forces `en`). |
| Test data | Partial | Lumio AS / Kari Nordmann local QA tenant; no admin e2e. |
| Provider independence | Partial | Brevo behind the dispatcher; no adapter interfaces for the new providers. |

**Counts:** 1 Implemented, 11 Partial, 3 Missing, 2 Unknown.
