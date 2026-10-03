# 02 — Database inventory

Phase A output (A3.2) for `docs/crm-enrichment/INSTRUCTIONS.md`, written 2026-10-03 on branch `ccr-39a2fb73-jgkg09`. Read-only: no application code or database was changed. Every fact cites `path:line`; where the inventory says a range was not read in full, that range is an open item, not a finding. Reconciliation with a live database: all 157 migrations applied cleanly to a fresh local stack (0001…0190). Grants checked live on that stack are noted in 06 (Q1).

---

# Orgpuls — database inventory: Marketing CRM, sales, admin access, firewall

Read-only inventory of `supabase/migrations/` (157 files, 45,222 lines) as of 2026-10-03. Every
citation is `supabase/migrations/<file>:<lines>` unless it starts with `tests/` (=
`supabase/tests/`). Citations are abbreviated `NNNN:lines` where `NNNN` is the migration's number
prefix (e.g. `0055:64-93` = `supabase/migrations/0055_crm.sql:64-93`).

**Reading coverage.** Read in full: 0003, 0046, 0049, 0050, 0051, 0053, 0054, 0055, 0056, 0057,
0058, 0059, 0060, 0061, 0062, 0063, 0064, 0065, 0066, 0093, 0110, 0111, 0112, 0113, 0115, 0116,
0117, 0118, 0119, 0120, 0121, 0123, 0125, 0126, 0136. Read in large part, rest at
signature/gate/audit level (exact ranges stated in the appendix for each): 0094, 0114, 0124,
0135, 0137, 0141, 0142, 0143, 0144. Grep level only (cited lines read, rest not): 0001, 0010,
0012, 0018, 0020, 0026, 0032, 0042, 0067, 0068, 0076, 0085, 0087, 0095, 0101, 0106, 0109, 0122,
0134, 0145, 0146, 0150, 0155, 0190. Where a fact comes from a grep-level read it is the cited
line itself, not an inference about unread text.

---

## 1. Admin access model

### 1.1 Identity and role storage
- **Table `app.platform_admins`** — `0049:24-35`.
  `user_id uuid PK → auth.users ON DELETE CASCADE`; `role app.platform_role NOT NULL`;
  `product_id text NOT NULL DEFAULT 'orgpuls'`; `mfa_enforced boolean NOT NULL DEFAULT true`;
  `active boolean NOT NULL DEFAULT true`; `created_by uuid → auth.users ON DELETE SET NULL`;
  `created_at timestamptz NOT NULL DEFAULT now()`. Index `platform_admins_created_by`. RLS on, no
  policy, no grant ("read and written only through the functions below", `0049:34-35`).
- **Enum `app.platform_role`** — created `('super_admin','support','finance','analyst')`
  (`0049:22`); `+ 'marketing'` (`0055:37`); `+ 'editor'` (`0125:6`). **Final: 6 values**:
  super_admin, support, finance, analyst, marketing, editor. (The expected "read-only analyst"
  exists as `analyst`; there is no role literally named read-only.)
- **Customer/admin separation, both directions** (triggers, not security definer):
  `app.admin_not_member()` + trigger `platform_admins_separate` BEFORE INSERT OR UPDATE OF user_id
  on platform_admins (`0049:38-48`); `app.member_not_admin()` + trigger `memberships_not_admin` on
  app.memberships (`0049:50-60`). Also enforced in `admin_set_admin` (`customer_account` error,
  `0049:625-627`, `0055:1081-1083`). Entra sign-in refuses platform admins (`0155:266-268`); demo
  entry refuses them (`0094:651-653`, `0094:601`); deletion never removes a platform admin's
  account (`0064:282-285`, `0136:39-47`).

### 1.2 Role-check functions (the real names)
| Function | Definition | What it does |
|---|---|---|
| `app.admin_role()` → `app.platform_role` | `0049:64-72`, SQL STABLE SECURITY DEFINER, `search_path=''` | Role of `auth.uid()` iff `active` AND (`not mfa_enforced` OR `auth.jwt()->>'aal' = 'aal2'`); else NULL. **This is the MFA (aal2) enforcement point.** |
| `app.is_platform_admin(p_roles app.platform_role[])` → boolean | `0049:74-76`, SECURITY DEFINER | `coalesce(app.admin_role() = any(p_roles), false)` |
| `app.crm_can_read()` | `0055:505-507` | `is_platform_admin({super_admin, marketing, analyst})` |
| `app.crm_can_write()` | `0055:509-511` | `is_platform_admin({super_admin, marketing})` |
| `app.cms_can_write()` | `0114:140-142`, replaced `0126:15-17` | final `{super_admin, marketing, editor}` |
| `app.cms_can_read()` | `0114:143-145`, replaced `0126:18-20` | final `{super_admin, marketing, analyst, support, editor}` |
| `app.growth_admin()` | `0142:712-717` | `is_platform_admin({super_admin, analyst, marketing})` |
| `app.growth_owner_ok(uuid)` | `0142:720-727` | active admin, `product_id='orgpuls'`, role in growth roles |

All of `app.admin_role`, `app.is_platform_admin`, `app.admin_log`, `app.admin_audit_fixed`,
`app.admin_not_member`, `app.member_not_admin`, `app.org_status` are revoked from public, anon,
authenticated (`0049:650-655`). CRM helper gates revoked `0055:1097-1104`; CMS gates `0114:642-645`;
growth gate `0142:717`.

There is **no `app.has_admin_role`**; the names are `app.admin_role()` and
`app.is_platform_admin(array[...])`. Some functions gate inline with `app.admin_role() is null`
("any admin role") — those were later patched to also refuse `editor` by string replacement
(`0126:125-146`: admin_org_detail, admin_audit_list, admin_kpis, admin_funnel, admin_trends,
admin_web, admin_web_report, admin_attention).

### 1.3 MFA
- Enforced in the database by `app.admin_role()` reading `auth.jwt()->>'aal'` (`0049:71`).
  `mfa_enforced` defaults true (`0049:28`); `admin_set_admin` never sets it (insert omits it; on
  conflict updates only role and active — `0049:628-630`, `0055:1084-1086`), so no RPC can turn it
  off; only direct SQL could.
- `public.admin_whoami()` reports `aal` and `mfa_enforced` (`0049:192-204`).
- `public.admin_site_settings()` reports `admins_without_factor` = active admins with no verified
  `auth.mfa_factors` row (`0126:178-196`).
- Tests: `tests/admin_invariants.sql:71-79` (aal1 refused, aal2 ok).

### 1.4 Admin account management
- `public.admin_list_admins()` super_admin, audit `admins.list` (`0049:584-599`).
- `public.admin_set_admin(p_email, p_role, p_active, p_reason)` super_admin; reason ≥ 5 chars;
  refuses demoting/deactivating yourself; refuses a customer account; upserts; audit `admins.set`
  with email/role/active (`0049:603-634`; replaced `0055:1059-1090` to accept `marketing`).
  **Gap:** its role whitelist is `('super_admin','support','finance','analyst','marketing')`
  (`0055:1071`); no later migration redefines it (grep of all migrations), so **`editor` cannot be
  granted through the RPC**.
- `public.admin_record_login()` writes `admin.login` when `admin_role()` is non-null
  (`0049:206-212`).

### 1.5 Role → capability matrix (from the gates as written; final state)
| Area / function family | super_admin | support | finance | analyst | marketing | editor |
|---|---|---|---|---|---|---|
| org list `admin_org_list` (`0118:77`) | ✓ | ✓ | ✓ | – | – | – |
| org detail `admin_org_detail` (`0049:265` + `0126:131`) | ✓ (full) | ✓ (full) | ✓ (no users/rounds/timeline, `0049:271,297,306,332`) | – | ✓ (as finance) | – |
| trial extend `0049:360` | ✓ | ✓ | – | – | – | – |
| notes `admin_note_add` `0049:387` | ✓ | ✓ | ✓ | – | – | – |
| user search `0049:409` | ✓ | ✓ | – | – | – | – |
| audit trail `admin_audit_list` (`0049:447` + `0126:132`) | all | one org only | – | – | ✓ (all — the gate only excludes finance/analyst/editor and support-without-org) | – |
| ops / email log / deliverability (`0049:469,498`, `0053:155,183`) | ✓ | ✓ | – | – | – | – |
| KPIs, funnel, trends, web, web report, attention (`admin_role() is null` gates, editor excluded `0126:133-138`) | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| tickets (all `0051`, `0135`) | ✓ | ✓ | – | – | – | – |
| cancel/withdraw/deletions (`0064:322,351,415`) | ✓ | ✓ | ✓ | – | – | – |
| delete now (`0064:374`) | ✓ | – | – | – | – | – |
| account owner set (`0118:30`) / read (`0118:58`) | ✓/✓ | ✓/✓ | –/✓ | – | – | – |
| account health (`0120:121`) | ✓ | ✓ | ✓ | – | ✓ | – |
| CRM read (`crm_can_read`) | ✓ | – | – | ✓ | ✓ | – |
| CRM write (`crm_can_write`) | ✓ | – | – | – | ✓ | – |
| CRM settings customer exception (`0145:72`) | ✓ | – | – | – | – | – |
| spend add/delete (`0062:111,131`) | ✓ | – | ✓ | – | ✓ | – |
| acquisition (`0063:11`) | ✓ | – | ✓ | ✓ | ✓ | – |
| SEO (`0126:33`) | ✓ | – | – | ✓ | ✓ | ✓ |
| CMS/media/site notice read (`cms_can_read`) | ✓ | ✓ | – | ✓ | ✓ | ✓ |
| CMS/media/site notice write (`cms_can_write`) | ✓ | – | – | – | ✓ | ✓ |
| indexing switch, site settings (`0126:159,182`) | ✓ | – | – | – | – | – |
| Growth (G1–G4 reads/writes, `growth_admin`, `0141:1674`, `0144:318,415`) | ✓ | – | – | ✓ | ✓ | – |
| Deliverability auth claim/check (`0144:499,530`) | ✓ | – | – | – | ✓ | – |
| translations/legal/module sync (`0101`, `0109`, `0122`) | ✓ | (auto-approve read only `0101:298`) | – | – | – | – |

Note: marketing reaching `admin_org_detail` and `admin_audit_list` follows from the
blacklist-style gates (`0049:265`, `0049:447` as patched by `0126:131-132`), not from an explicit
grant; flagged under §12.

---

## 2. Audit

- **Table `app.admin_audit`** — `0049:79-99`: `id bigint identity PK`; `at timestamptz DEFAULT now()`;
  `product_id text NOT NULL DEFAULT 'orgpuls'`; `admin_id uuid` (no FK), `admin_email text`,
  `admin_role app.platform_role` (copied so the record outlives the account); `action text NOT NULL
  CHECK (action ~ '^[a-z_]+\.[a-z_]+$')`; `org_id uuid` (no FK), `org_name text`; `target_type text`;
  `target_id text`; `reason text CHECK (len ≤ 500)`; `detail jsonb`. Indexes `(org_id, at desc)`,
  `(admin_id, at desc)`, `(at desc)`. RLS on, no policy, no grant (`tests/admin_invariants.sql:39-45`).
- **Append-only**: `app.admin_audit_fixed()` raises "the admin audit log is append-only";
  triggers `admin_audit_fixed` BEFORE UPDATE OR DELETE (row) and `admin_audit_no_truncate` BEFORE
  TRUNCATE (statement) (`0049:102-111`). Unconditional (no FK-maintenance carve-out; justified
  because the table references nothing, `0049:101`). Tested `tests/admin_invariants.sql:122-127`.
- **Writer**: `app.admin_log(p_action, p_org, p_target_type, p_target_id, p_reason, p_detail)` SQL
  VOLATILE SECURITY DEFINER (`0049:113-123`): copies `auth.uid()`, email, `admin_role()`, org name.
  Not callable by clients (`0049:652`).
- **Reader**: `public.admin_audit_list(p_org, p_limit)` (`0049:439-459`, editor refused by
  `0126:132`): itself writes no audit row.
- Retention: admin_audit is excluded from org deletion counts and kept (`0136:28-29, 71`).
- Other append-only "record" tables (all "nobody may change this content" pattern): ticket
  messages/events (`0051:227-256`), ticket CSAT ratings (`0135:50-65`), CMS revisions
  (`0114:205-221`), consent ledger (`0141:723-745`, replaced `0143:1029-1050`), growth events
  (`0141:208-229`, update-only guard), CRM stage history (`0137:75-89`), Krav rule versions
  (`0144:132-153`), answers and other answer tables (`0003:138-163`, `0095:115-130`).
- **Audit action names** found (prefix.verb): admin.login, orgs.list, org.view, trial.extend,
  note.add, users.search, ops.view, email_log.view, kpis.view, funnel.view, admins.list,
  admins.set, web.view, attribution.view, tickets.list, ticket.view, ticket.update, ticket.note,
  ticket.reply, ticket.link, tickets.org, deliverability.view, crm.* (contacts, contact,
  contact_create, contact_update, import, contact_unsubscribe, contact_erase, settings, segments,
  segment_save, segment_delete, campaigns, campaign, campaign_save, campaign_test,
  campaign_schedule, campaign_cancel, companies, company, company_create, company_update,
  company_import, activity_add, task_done, task_skip, task_list, lists, list_save, list_add,
  list_remove, overview, stage_move, stage_create, stage_update, reply_stage, sender_save,
  campaign_pipeline, campaign_resend, daily_cap, sla, inbox, step_create, step_save,
  consent_view, consent_export, suppress, phone_notice, brreg_dry_run, brreg_requeue, brreg_poll,
  partner_save, lead_scores), lifecycle.view, health.view, seo.view, trends.view, spend.add,
  spend.delete, acquisition.view, org.cancel, org.cancel_withdraw, org.delete_now,
  deletions.view, org.owner, cms.* (create, save, translate, publish, schedule, unpublish,
  restore, archive, unarchive, redirect, redirect_delete), media.add/describe/delete,
  site.notice_on/off, site.indexing_on/off, settings.auto_approve, legal.*, translations.*,
  module.sync, module.pilot_add/remove, locale.pilot_add/remove, tickets.mentions,
  ticket.mentions_seen, tickets.canned, ticket.canned_*, tickets.report, growth.events_view,
  growth.<view>_view, growth.export, growth.item_update, growth.experiment_update, growth.decide,
  growth.magnets_view, growth.deliverability_view, deliverability.auth_claim,
  deliverability.auth_check. Citations per function in §6 and the appendix.
- **Admin reads that write no audit row** (as written): admin_whoami (`0049:192`),
  admin_audit_list (`0049:439`), admin_crm_segment_preview (`0055:784-801`, returns 20 sample
  e-mails), admin_crm_tasks (`0056:1065`), admin_crm_templates (`0056:1169`),
  admin_crm_known_orgnrs (`0058:102`), admin_crm_stages (`0093:183`, `0112:37`), admin_crm_senders
  (`0093:261`), admin_crm_sequence (`0111:208`, `0137:433`), admin_crm_sending (`0111:265`),
  admin_crm_owners (`0119:119`), admin_crm_journeys (`0120:19`, `0137:475`), admin_crm_pipeline_summary
  (`0137:98`), admin_brreg_triggers (`0143:1214`), admin_crm_partners (`0143:1331`),
  admin_org_cancellation (`0064:396`, `0066:97`), admin_org_owner (`0118:52`), admin_attention
  (`0116:13`, STABLE), admin_web_report (`0121:71`, STABLE), admin_site_settings (`0126:178`),
  admin_site_notice (`0123:34`), admin_cms_templates/pages/page/traffic/redirects
  (`0114:341-393, 589`), admin_cms_preview_token (`0114:576`), admin_media (`0124:56`). Several are
  declared `STABLE`, so they could not call `admin_log` (a VOLATILE insert) even if they tried.

---

## 3. Events (typed event tables)

### 3.1 `app.growth_events` — the typed, org-level product event stream (0141)
- Columns (`0141:126-143`): `id uuid PK DEFAULT gen_random_uuid()`; `name text NOT NULL →
  app.event_catalogue(name)`; `occurred_at timestamptz NOT NULL` (the only time column; no
  created_at, no sequence — rationale `0141:118-125`); `org_id uuid → app.organizations ON DELETE
  CASCADE`; `user_id uuid → auth.users ON DELETE CASCADE`; `props jsonb NOT NULL DEFAULT '{}'
  CHECK object`; `source text CHECK in ('trigger','tick','backfill')`; `dedupe_key text CHECK
  ^[0-9a-z:._+-]{1,120}$`. Indexes: `growth_events_once` UNIQUE(name, dedupe_key) WHERE dedupe_key
  NOT NULL; `(name, occurred_at desc)`; `(org_id, occurred_at desc)` partial; `(user_id)` partial.
  RLS on, revoked from public/anon/authenticated (`0141:142-143`). No product_id.
- **Naming convention**: `<object>.<past_tense>` enforced by `event_catalogue.name CHECK (name ~
  '^[a-z_]+\.[a-z_]+$' and char_length(name) <= 60)` (`0141:72`); same shape as admin_audit
  actions.
- **Catalogue `app.event_catalogue`** (`0141:71-92`): name PK; version int default 1; event_group
  CHECK (signup, setup, survey, value, trial, billing, support, consent, lead); sort unique;
  pii_level `app.growth_pii` ('none','org','user', `0141:50`); hour_only bool; allowed_props
  text[] (CHECK `app.growth_props_ok`, forbidding respondent/token/email/name/id/count-style prop
  names unless `_band`, `0141:54-69`); source; description; CHECK pii 'none' ⇒ hour_only.
  21 seeded events (`0141:94-115`): user.signed_up, org.created, org.brreg_verified,
  employees.imported, survey.created, survey.scheduled, survey.sent, survey.threshold_reached,
  results.viewed, action_item.created, stakeholder.invited, trial.extended, trial.expiring,
  trial.expired, subscription.started, subscription.tier_changed, subscription.cancelled,
  ticket.created, consent.granted, consent.withdrawn, lead.hand_raised.
- **Who writes**: only `app.growth_emit(...)` (`0141:260-272`, SECURITY DEFINER, revoked;
  demo orgs skipped), called from AFTER triggers on organizations, memberships, employees
  (statement-level, band only), measurements, rounds, measures, member_invites, billing, tickets,
  product_events, demo_requests (`0141:291-474`), from consent ledger inserts (`0141:899-916`),
  and from `app.growth_tick()` hourly (`0141:484-546`), plus a one-time backfill (`0141:552-663`).
- **Guards**: BEFORE INSERT `growth_event_check` validates props/values/bands/pii/hour
  (`0141:154-198`); BEFORE UPDATE `growth_event_guard` (immutable; FK set-null allowed after
  parent gone) (`0141:208-229`). Demo forget trigger on `app.demo_orgs` (`0141:276-285`).
- **Who reads**: `public.admin_growth_events()` (n7 counts) (`0141:1670-1709`, replaced
  `0142:962-1006`); `app.growth_funnel_count` (`0142:332-395`); `app.lead_score` PQL rules
  (`0143:766-822`); `app.growth_firewall` rule 5 (`0141:1475-1490`).

### 3.2 Other event-like tables
- `app.product_events` (`0049:142-154`): one row per user/name/day for results_viewed,
  report_viewed, comments_viewed, measures_viewed; written by `public.track_product_event`
  (authenticated, `0049:156-172`); has product_id; mirrored into growth_events
  (`0141:450-462`).
- `app.web_events` (`0050:35-52` + `0054:21-25`, `0059:32-34`, `0121:23`, `0143:912`): public-site
  page views/CTA clicks; visitor = daily-salted 32-hex hash; no IP/UA/account; has product_id;
  written by `public.track_web_event` (anon+authenticated); retention cron 400 days
  (`0050:349-350`).
- `app.mail_events` (`0053:23-40`): provider delivery events (no opens/clicks), service_role
  writer `public.record_mail_event`.
- `app.ticket_events` (`0051:172-184`) — ticket timeline, append-only.
- `app.crm_stage_changes` (`0137:36-52`) — stage history, trigger-written.
- `app.crm_activities` (`0056:69-84`) — the CRM's activity log (notes/calls/meetings/emails/
  tasks/stage/reply), not append-only.

---

## 4. Settings and flags

All are singleton tables (`id boolean PRIMARY KEY DEFAULT true CHECK (id)`) with RLS on and no
client grant, written only by audited admin RPCs (where an RPC exists):

| Table | Definition | Columns | Writer(s) |
|---|---|---|---|
| `app.crm_settings` | `0055:54-62` | customer_exception bool default false; changed_by → auth.users SET NULL; changed_at; + reply_stage text NOT NULL default 'engaged' → crm_stages ON UPDATE CASCADE (`0093:92-93`); + daily_cap int 1..5000 (`0111:34-36`); + sla_minutes int NOT NULL default 5 (1..1440) (`0112:32-34`); + stage_history_since timestamptz NOT NULL default now() (`0137:32-34`) | admin_crm_settings (super_admin, `0145:65-81`), admin_crm_reply_stage (`0145:83-98`), admin_crm_daily_cap (`0111:248-263`), admin_crm_sla (`0112:99-114`) |
| `app.lifecycle_settings` | `0060:33-41` | enabled bool default true; started_at | none (no RPC found) |
| `app.platform_settings` | `0101:23-35` | auto_approve, auto_approve_by, auto_approve_at; + notice_on/no/en/by/at (`0123:26-32`); + allow_indexing default true, indexing_by, indexing_at (`0126:149-153`) | admin_auto_approve_set (`0101:308-335`), admin_site_notice_set (`0123:46-66`), admin_site_indexing_set (`0126:155-168`) |
| `app.demo_settings` | `0094:33-42` | enabled, reset_hours, idle_days, per_network_day, per_domain_day, per_day | none found |
| `app.growth_settings` | `0142:34-39` | plan_start date (Monday) | none found in read ranges (grep found no writer) |
| `app.brreg_settings` | `0143:98-108` | dry_run default true; feed_cursor; roles_cursor | admin_brreg_set_dry_run (`0143:1273`, `0145:38-62`), brreg_poll_end (service role) |

- There is **no generic feature-flag table** and no settings registry (key/value) table.
- Rule constants are immutable functions, not rows: `app.brreg_rules()` (`0143:245-251`),
  `app.lead_rules()` (`0143:255-260`), `app.health_parts()` (`0141:1561-1567`),
  `app.plan_monthly_nok()` (`0049:187-189`).
- **Per-org flags/pilots**: `organizations.mail_enabled` (`0032:53`), `sms_enabled` (0033);
  `app.module_pilots` (`0068:14-26`, super_admin writes, audit `module.pilot_*` `0068:77-99`);
  `app.locale_pilots` (`0085:17-31`, super_admin, audit `locale.pilot_*` `0085:53-70`);
  `app.org_modules` (`0074:22-30`, customer setting); `app.survey_defaults` + `_log`
  (`0076:42-68`, customer setting). `app.account_owners` (`0118:14-22`) is a per-org internal fact.

---

## 5. CRM / sales / marketing tables (final state)

Common to every table in this section unless stated: schema `app`; RLS enabled; **no policy**;
`revoke all … from public, anon, authenticated` (some also `service_role`); reached only through
SECURITY DEFINER functions. "No product_id / owner / created_by / updated_by / deleted_at /
version" is stated per table in the "Audit columns" line.

### 5.1 `app.crm_contacts` — people (0055, altered 0056, 0094, 0141)
- Purpose: one row per person the CRM may mail: synced account holders, newsletter/contact-form
  sign-ups, imports, manual entries, Brønnøysund role addresses, demo leads.
- Columns (`0055:64-89`): id uuid PK gen_random_uuid(); product_id text NOT NULL 'orgpuls'; email
  text NOT NULL CHECK (lower/btrim, ≤254, regex); name 1..120; company 1..200; org_number
  ^[0-9]{9}$; role CHECK (daglig_leder, hr, leder, verneombud, annet); user_id uuid UNIQUE →
  auth.users ON DELETE SET NULL; org_id → organizations ON DELETE SET NULL; source text NOT NULL;
  basis text NOT NULL DEFAULT 'none'; status text NOT NULL DEFAULT 'active' CHECK (pending,
  active, unsubscribed); consent_at; consent_source 3..200; optin_hash UNIQUE 64-hex; optin_sent_at;
  tags text[] NOT NULL DEFAULT '{}' (≤20); lang 'no'|'en' default 'no'; last_engaged_at;
  created_at; updated_at; **company_id → app.crm_companies ON DELETE SET NULL** (`0056:86`).
- Constraints: UNIQUE(product_id, email) (`0055:86`); CHECK basis<>'consent' OR (consent_at AND
  consent_source NOT NULL) (`0055:88`); basis CHECK final (consent, customer, business, none)
  (`0056:88-89`); source CHECK final (user, newsletter, contact_form, import, manual, event, brreg,
  demo) (`0094:526-528`).
- Indexes: crm_contacts_org (`0055:90`), crm_contacts_tags GIN (`0055:91`), crm_contacts_company
  (`0056:87`), crm_contacts_email_hash on `app.crm_hash(email)` (`0141:880`).
- Grants: revoked (`0055:93`).
- Triggers: `consent_on_contact` deferred constraint trigger AFTER INSERT OR UPDATE OF basis,
  status, email → app.consent_sync (`0141:855-866`).
- Audit columns: created_at/updated_at only; **no owner, no created_by/updated_by, no
  deleted_at (erase = hard DELETE, `0055:740-744`), no version**.

### 5.2 `app.crm_suppression` — do-not-mail list by hash (0055)
- `0055:95-101`: email_hash text PK CHECK ^[0-9a-f]{64}$ (sha256 of lower(btrim(email)),
  `app.crm_hash` `0055:40-42`); reason NOT NULL CHECK (unsubscribed, hard_bounce, invalid, spam,
  blocked, manual, erased); at default now(). Outlives an erased contact (`0055:21-23`).
- Triggers: `consent_on_suppression` deferred (`0141:881-894`); `brreg_suppression_reroute` AFTER
  INSERT OR UPDATE OF email_hash (`0143:460-480`).
- Audit columns: none (no product_id, no created_by — the admin is in admin_audit with the first
  12 hex chars of the hash, `0143:1153`).

### 5.3 `app.crm_segments` (0055)
- `0055:103-114`: id uuid PK; product_id; name 1..120; filter jsonb NOT NULL default '{}';
  **created_by → auth.users SET NULL**; created_at; updated_at; UNIQUE(product_id, name).
- Filter keys validated by `app.crm_filter_ok` (final `0093:419-453`: types, roles, sources, tags,
  lang, min_employees, max_employees, nace, no_survey_days, mailable_only, stages, lists, bases).
- Audit columns: created_by yes; no updated_by, no deleted_at (hard delete `0055:843`), no version.

### 5.4 `app.crm_campaigns` (0055; altered 0056, 0059, 0093, 0111, 0137)
- Base (`0055:116-139`): id uuid PK; number bigint identity start 101 UNIQUE; product_id; name
  1..120; kind (newsletter, campaign, promotion, announcement) default newsletter; lang; subject
  ≤150; preheader ≤200; blocks jsonb default '[]'; segment_id → crm_segments SET NULL; utm_campaign
  NOT NULL ^[a-z0-9_-]{1,60}$; status default 'draft' CHECK (draft, scheduled, sending, sent,
  cancelled); scheduled_at; started_at; finished_at; audience int; **created_by → auth.users SET
  NULL**; created_at; updated_at. Partial index crm_campaigns_due (`0055:137`).
- +0056 (`0056:221-235`): list_id → crm_lists SET NULL; template_key → crm_templates(key) SET NULL;
  style (branded, letter); signature ≤200; subject_b ≤150; ab_percent 10..50 default 20; ab_metric
  (open, click) default changed to 'click' (`0059:39`); ab_wait_hours 1..48; ab_winner (a,b);
  ab_decided_at; publish_web bool; slug ^[a-z0-9-]{3,80}$ (unique per product partial index
  `0056:235`); web_description ≤200.
- +0093 (`0093:83-90`): stage_target → crm_stages ON UPDATE CASCADE; stage_on_send → crm_stages
  ON UPDATE CASCADE; sender_id → crm_senders; follows_id → crm_campaigns (no ON DELETE action);
  follow_days 1..60; CHECK follows/follow_days paired; CHECK not self.
- +0111 (`0111:27-30`): follow_auto bool default false; follow_when (no_reply, no_click, no_open);
  CHECK follow_auto ⇒ follows_id.
- +0137 (`0137:134-136`): step_kind (mail, call, linkedin) default mail; CHECK non-mail ⇒
  follows_id AND follow_auto.
- A **sequence / journey is a chain of crm_campaigns via follows_id** (no separate table):
  `0111:1-25`, `0120:1-17` ("adds no engine and stores nothing").
- Audit columns: created_by yes; no owner, no updated_by, no deleted_at, no version.

### 5.5 `app.crm_sends` (0055; altered 0056)
- `0055:141-167`: id uuid PK; kind (campaign, test, optin); campaign_id → crm_campaigns ON DELETE
  CASCADE; contact_id → crm_contacts SET NULL; to_email ≤254 (cleared after provider accepts,
  `0055:449-461`); status final (held, pending, sending, sent, failed, skipped) (`0056:238-239`);
  attempts; leased_until; provider_id; last_error ^[a-z0-9_]{1,40}$; unsub_hash UNIQUE 64-hex;
  delivery app.mail_delivery; delivery_at; opened_at; clicked_at; unsubscribed_at; created_at;
  sent_at; variant (a,b) (`0056:237`); CHECK kind='optin' OR campaign_id NOT NULL.
- Indexes: crm_sends_once UNIQUE(campaign_id, contact_id) WHERE kind='campaign'; pending partial;
  provider; contact (`0055:162-165`).
- Audit columns: none beyond timestamps; no product_id.

### 5.6 `app.crm_clicks` (0056)
- `0056:241-250`: send_id → crm_sends CASCADE; url 1..600, no `?`/`#`; content ^[a-z0-9_-]{0,60}$;
  clicks int default 1; first_at; PK(send_id, url, content).

### 5.7 `app.crm_companies` — accounts / deals / pipeline (0056; altered 0093, 0110, 0119)
- `0056:37-67`: id uuid PK; product_id; org_number ^[0-9]{9}$; name 1..200; form_code ≤10;
  nace_code; nace_label; employees 0..1e6; municipality; municipality_no; website; phone; source
  (brreg, import, manual, signup) default manual; stage text NOT NULL default 'new';
  stage_changed_at NOT NULL default now(); **owner_id → auth.users ON DELETE SET NULL**;
  next_step ≤300; next_step_at date; lost_reason ≤300; tags ≤20; org_id uuid UNIQUE →
  organizations SET NULL; last_activity_at; created_at; updated_at.
- Stage: original CHECK replaced by FK `crm_companies_stage_fk` → crm_stages(key) ON UPDATE
  CASCADE (`0093:57-67`).
- +0110 (`0110:21-25`): manager_name 2..120, manager_role (DAGL, INNH), manager_seen_at, CHECK
  paired. +0119 (`0119:9`): value_nok integer 0..1e8 ("estimate…never an invoice", `0119:5`).
- Indexes: crm_companies_orgnr UNIQUE(product_id, org_number) partial; crm_companies_stage
  (`0056:64-65`).
- Triggers: `crm_stage_record` AFTER INSERT OR UPDATE OF stage → app.crm_stage_changes
  (`0137:54-70`).
- Owner validation: must be an active platform admin (`0056:907-910`, `0119:53-56`); candidate
  list = active super_admin/marketing (`0056:871-873`, `0119:119-132`). Note owner_id FKs
  auth.users, not platform_admins.
- **A "deal" is a crm_companies row** (value, owner, stage, next step) — no deals table.
- Audit columns: owner_id yes; no created_by/updated_by (history via crm_activities and
  admin_audit); no deleted_at; no version.

### 5.8 `app.crm_activities` — notes, calls, meetings, emails, tasks (0056; altered 0093, 0137, 0143)
- `0056:69-84`: id uuid PK; company_id NOT NULL → crm_companies CASCADE; contact_id → crm_contacts
  SET NULL; kind final CHECK (note, call, meeting, email, task, stage, reply) (`0093:104-105`); body
  1..4000; due_at date; done_at; **admin_id → auth.users SET NULL; admin_email** (the author, or for
  rule/step tasks the assignee); created_at.
- +0137 (`0137:140-146`): campaign_id → crm_campaigns SET NULL; skipped bool; CHECK skipped ⇒ task
  & done; UNIQUE(campaign_id, contact_id) partial.
- +0143 (`0143:85-94`): origin (rule, trigger); rule ^R[0-9]{1,2}$; task_kind (call, email,
  letter); sla_due_at; CHECKs for auto tasks (`body ~ '^auto:…'`) and sla.
- Indexes: (company_id, created_at desc); open tasks partial (`0056:81-82`); crm_activities_rule
  (`0143:94`).
- Triggers: brreg_outreach_done AFTER UPDATE OF done_at (`0143:410-424`); brreg_task_stopped
  BEFORE UPDATE OF done_at (`0143:443-453`).
- Not append-only. Audit columns: admin_id/admin_email; no product_id, no deleted_at.

### 5.9 `app.crm_lists` and `app.crm_list_members` (0056)
- crm_lists (`0056:105-120`): id uuid PK; product_id; key ^[a-z0-9-]{2,40}$; name_no/name_en;
  description_no/en; public bool default true; sort; **archived_at** (soft archive); created_at;
  UNIQUE(product_id, key). Seeded nyhetsbrev, produktnytt, arrangementer, tilbud (`0056:122-134`).
  Trigger consent_purpose_for_list AFTER INSERT (`0141:683-695`).
- crm_list_members (`0056:136-148`): list_id → crm_lists CASCADE; contact_id → crm_contacts
  CASCADE; status (pending, subscribed, unsubscribed) default pending; source 2..200; subscribed_at;
  unsubscribed_at; created_at; PK(list_id, contact_id). Index on contact_id. Trigger
  consent_on_member deferred (`0141:868-877`).

### 5.10 `app.crm_templates` (0056; altered 0113)
- `0056:157-169`: key PK; name; description; kind; style; subject; preheader; blocks jsonb NOT NULL;
  sort; + category (newsletter, product, event, sales, customer) (`0113:78-81`); CHECK
  crm_blocks_ok(blocks) (`0113:82`). 6 seeded (`0056:171-218`), redrawn and 4 added
  (`0113:85-158`) → 10. No product_id, no audit columns. Admin read only
  (`admin_crm_templates`, no write RPC).

### 5.11 `app.crm_stages` (0093; altered 0112)
- `0093:33-43`: key PK ^[a-z][a-z0-9_]{1,39}$; name 1..60; sort NOT NULL; kind (open, won, lost,
  parked); managed bool; archived_at; created_at; + exit_criterion 1..200 (`0112:17-30`).
- Seeded 9 (`0093:45-54`): new, contacted, engaged, meeting, trial (managed), customer (won,
  managed), nurture (parked), lost, not_relevant. No probability/weight (`0137:20`).

### 5.12 `app.crm_senders` (0093)
- `0093:70-80`: id uuid PK; name 1..80; email regex; reply_to regex; signature ≤200; archived_at;
  created_at. No product_id, no created_by.

### 5.13 `app.crm_stage_changes` (0137) — win-rate history
- `0137:36-52`; trigger-written (`0137:54-70`); append-only guard (`0137:75-89`); read by
  admin_crm_pipeline_summary. Not backfilled (`0137:15-19`).

### 5.14 Brønnøysund prospecting engine (0143)
- `app.brreg_settings` (`0143:98-108`), `app.brreg_polls` (`0143:110-125`, requested_by →
  auth.users), `app.brreg_entities` (`0143:143-160`; never ENK; generic_email CHECK
  `app.brreg_generic_email`), `app.brreg_triggers` (`0143:162-175`), `app.brreg_dnc` do-not-contact
  (`0143:178-185`, created_by), `app.brreg_purges` (`0143:188-193`), `app.brreg_outreach`
  (`0143:195-233`; company_id → crm_companies SET NULL; activity_id → crm_activities SET NULL;
  trigger brreg_outreach_orphaned `0143:217-228`). All RLS on, revoked (no service_role revoke on
  these specific lines — they revoke from public, anon, authenticated).

### 5.15 `app.partners` (0143)
- `0143:890-910`: id uuid PK; name; org_number (unique partial); kind (accounting, bht, hms,
  bransje); contact_name; referral_code UNIQUE ^[A-Z0-9]{2,20}$; share_kind; share_pct 1..50;
  status (in_talks, kit_sent, pilot_signed, member_offer_drafted, phase_2); created_at;
  **created_by → auth.users SET NULL**; updated_at. Linked from org_attribution.partner_id
  (`0143:913-914`) and web_events.ref_code (`0143:912`).

### 5.16 Consent ledger (0141; altered 0143)
- `app.consent_purposes` (`0141:668-681`; key adds 'phone_outreach' `0143:1007-1012`).
- `app.consent_records` (`0141:697-718`): id identity; contact_id → crm_contacts CASCADE (nullable
  after `0143:1014`); company_id → crm_companies CASCADE (`0143:1015`); purpose → consent_purposes;
  status (granted, withdrawn, lapsed, not_given, notice_given); lawful_basis (consent,
  existing_customer_15_3, legit_interest_phone, business_address); method (… + phone_notice
  `0143:1016-1020`); doi_sent_at; doi_confirmed_at; created_at; **created_by → auth.users SET
  NULL**; CHECKs incl. subject XOR (`0143:1021`) and phone rules (`0143:1022-1025`). Append-only
  guard (`0143:1029-1050`). Written by deferred triggers on crm_contacts, crm_list_members,
  crm_suppression via `app.consent_sync` (method from GUC `app.consent_via`, `0141:815-853`).

### 5.17 Mail registry and deliverability (0144)
- `app.mail_streams` (`0144:166-179`), `app.mail_templates` (`0144:187-246`; **version int
  default 1**; marketing ⇒ marketing stream CHECK), `app.mail_auth_runs` (`0144:252-265`, admin_id),
  `app.mail_auth_checks` (`0144:267-285`). Revoked incl. service_role.
- `app.mail_events` (`0053:23-40`) and `app.address_problems` (`0053:51-61`) — product mail
  delivery (not CRM).

### 5.18 Growth registry (0142, 0144) — internal planning data, not CRM records
- 17 tables (`0142:429-440` list): growth_settings, growth_tiers, growth_items (**owner →
  app.platform_admins(user_id) ON DELETE SET NULL** `0142:118`), growth_plan_blocks,
  growth_plan_gates, growth_rules (R1–R12; only R1, R5, R9 implemented `0142:558-572`),
  growth_experiments, growth_guardrails, growth_risks, growth_decisions (decided_by text, decided_at),
  growth_funnel_stages, growth_lead_sources, growth_assumptions, growth_benchmarks,
  growth_coverage, growth_recommendations, growth_cuts. All revoked from public, anon,
  authenticated, **service_role**. Plus growth_magnets, growth_krav_rules,
  growth_krav_rule_versions (versioned, append-only) (`0144:62-163`).

### 5.19 Older admin/sales tables
- `app.admin_org_notes` (`0049:126-137`): "a small CRM" — org_id → organizations CASCADE;
  author_id → auth.users SET NULL; author_email; body 1..4000; product_id. Insert-only RPC
  (`admin_note_add`); no update/delete RPC.
- `app.account_owners` (`0118:14-22`): org_id PK; user_id NOT NULL → platform_admins(user_id)
  CASCADE; set_by uuid (no FK); set_at.
- `app.org_attribution` (`0050:54-68` + heard `0059:36-37` + partner_id `0143:913`): signup
  first/last touch per organisation.
- `app.marketing_spend` (`0062:31-44`, entered_by → auth.users SET NULL), `app.kpi_daily`
  (`0062:16-29`).
- `app.seo_search`, `app.seo_runs` (`0061:17-42`).
- `app.lifecycle_mail` (`0060:43-60`) — trial service mail queue.
- `app.tickets` and family (`0051:94-224`, `0135:30-155`) — `tickets.queue` includes `'sales'`
  (`0051:33`); sales leads from the contact form land as tickets with queue 'sales'
  (`0051:319-320`). `tickets.assignee_id → platform_admins(user_id) SET NULL` (`0051:113`).
- `app.cms_*` (`0114:148-249`), `app.cms_media` (`0124:21-38`) — marketing site content;
  cms_pages has created_by and **archived_at**; cms_page_locales has **updated_by**; cms_revisions
  is the version history.
- `app.demo_requests` (`0094:53-62`, + name/company/role `0146`) → CRM demo leads via
  `app.demo_lead` (`0094:609-633`, `0141:1194-1223`, `0146:106-115`).

### 5.20 Column-presence summary (precise)
| Column | Tables that have it |
|---|---|
| `product_id` (all `text NOT NULL DEFAULT 'orgpuls'`) | platform_admins `0049:27`, admin_audit `0049:82`, admin_org_notes `0049:128`, product_events `0049:144`, web_events `0050:37`, tickets `0051:97`, canned_replies `0051:199`, crm_contacts `0055:66`, crm_segments `0055:105`, crm_campaigns `0055:119`, crm_companies `0056:39`, crm_lists `0056:107` — **12 tables, nothing after 0056** |
| owner | crm_companies.owner_id → auth.users (`0056:54`); growth_items.owner → platform_admins (`0142:118`); tickets.assignee_id → platform_admins (`0051:113`); account_owners.user_id → platform_admins (`0118:16`) |
| created_by | platform_admins, crm_segments, crm_campaigns, partners, consent_records, cms_pages, cms_redirects, cms_previews, cms_media, entry_codes, brreg_dnc (created_by); brreg_polls (requested_by); marketing_spend (entered_by); crm_activities (admin_id); crm_settings/platform_settings (changed_by/…_by) |
| updated_by | **none of the CRM tables**; only cms_page_locales (`0114:187`), org_modules (`0074:27`), survey_defaults (`0076:54`) |
| deleted_at (soft delete) | **none**; `deletion_log.deleted_at` (`0064:59`) is a log timestamp. Soft-archive via `archived_at` exists on crm_lists, crm_stages, crm_senders, cms_pages. CRM deletes are hard (contact erase `0055:740-744`, segment delete `0055:843`, spend delete `0062:134`). |
| version | event_catalogue.version (`0141:73`), mail_templates.version (`0144:196`), growth_krav_rule_versions.version (`0144:103`); **no optimistic-locking/version column on any CRM table** |
| visibility | none (grep of all migrations) |

---

## 6. CRM and admin functions / RPCs (final definitions)

Unless noted: `language plpgsql`, `SECURITY DEFINER`, `SET search_path = ''`; returns `jsonb`
`{ok, error}`; `revoke all … from public, anon` + `grant execute … to authenticated`. "Audit" =
the `app.admin_log` action written. "Last def" = the migration holding the definition in force.

### 6.1 CRM — contacts, consent, segments
| Function | Last def | Gate | Reads / writes | Audit |
|---|---|---|---|---|
| admin_crm_contacts(p_q, p_type, p_limit) | `0055:526-554` | crm_can_read | runs app.crm_sync (writes crm_contacts/companies); reads crm_contacts, organizations, crm_suppression, crm_settings, crm_sends | crm.contacts (detail: q present bool, type) |
| admin_crm_contact(p_id) | `0055:556-576` | crm_can_read | crm_contacts, crm_sends, crm_campaigns | crm.contact |
| admin_crm_save_contact(p_id, p) | `0058:9-81` | crm_can_write | insert/update crm_contacts (new contact requires consent_source) | crm.contact_create / crm.contact_update |
| admin_crm_import(p_rows) | `0141:1057-1127` | crm_can_write (sets consent_via='import' first) | crm_contacts upsert, ≤5000 rows | crm.import (counts) |
| admin_crm_contact_action(p_id, p_action, p_reason) | `0055:721-750` | crm_can_write, reason ≥5 | unsubscribe or **erase (hard delete contact + pending sends)**; crm_suppression | crm.contact_unsubscribe / crm.contact_erase |
| admin_crm_settings(p_customer_exception, p_reason) | `0145:65-81` | is_platform_admin({super_admin}) | crm_settings `where id` | crm.settings |
| admin_crm_segments() | `0055:768-782` | crm_can_read | crm_sync; crm_segments + counts | crm.segments |
| admin_crm_segment_preview(p_filter) | `0055:784-801` | crm_can_read | crm_sync; returns 20 sample emails | **none** |
| admin_crm_segment_save / _delete | `0055:803-846` | crm_can_write | crm_segments (hard delete; refused if in use) | crm.segment_save / crm.segment_delete |
| admin_crm_suppress(p_email, p_reason) | `0143:1132-1155` | crm_can_write | crm_suppression (hash only) | crm.suppress (target_id = 12 hex of hash) |
| admin_consent() | `0143:1053-` | crm_can_read | consent ledger | crm.consent_view |
| admin_consent_export() | `0143:1109-1130` | crm_can_write | consent ledger | crm.consent_export |
| admin_consent_phone_notice(p_org_number, p_objected) | `0143:1163-1212` | crm_can_write | consent_records (company), brreg_dnc, brreg_outreach, crm_activities | crm.phone_notice |
| admin_crm_list_* (lists, list_save, list_add, list_remove) | `0056:1080-1167`, `0058:83-100` | read / write | crm_lists, crm_list_members (add only consented, non-suppressed) | crm.lists, crm.list_save, crm.list_add (reason = source), crm.list_remove |

### 6.2 CRM — campaigns, sequences, journeys, mail
| Function | Last def | Gate | Audit |
|---|---|---|---|
| admin_crm_campaigns() | `0137:538-` | crm_can_read | crm.campaigns |
| admin_crm_campaign(p_id) | `0056:1306-1352` | crm_can_read | crm.campaign (reads web_events, org_attribution, billing) |
| admin_crm_campaign_save(p_id, p) | `0059:282-370` | crm_can_write (drafts only) | crm.campaign_save |
| admin_crm_campaign_test(p_id) | `0055:978-1003` | crm_can_write; to own address; 10/h | crm.campaign_test |
| admin_crm_campaign_schedule(p_id, p_at) | `0055:1005-1032` | crm_can_write; uses app.crm_campaign_ready (final `0137:247-265`, incl. placeholder guard `0113:54-60`) | crm.campaign_schedule |
| admin_crm_campaign_cancel(p_id) | `0055:1035-1055` | crm_can_write | crm.campaign_cancel |
| admin_crm_campaign_pipeline(p_id, p) | `0111:100-172` | crm_can_write; ≤7-step chain | crm.campaign_pipeline |
| admin_crm_campaign_resend(p_id, p_days) | `0137:330-361` | crm_can_write | crm.campaign_resend |
| admin_crm_step_save(p_id, p) | `0137:268-327` | crm_can_write | crm.step_create / crm.step_save |
| admin_crm_sequence(p_id) | `0137:433-` | crm_can_read | none |
| admin_crm_journeys() | `0137:475-` | crm_can_read | none |
| admin_crm_daily_cap(p_cap) | `0111:248-263` | crm_can_write | crm.daily_cap |
| admin_crm_sending() | `0111:265-279` (STABLE) | crm_can_read | none |
| admin_crm_templates() | `0056:1169-1178` | crm_can_read | none |
| admin_crm_senders / admin_crm_sender_save | `0093:261-312` | read / write | none / crm.sender_save |
| admin_crm_overview() | `0056:1374-1403` | crm_can_read; crm_sync | crm.overview |
| Public (anon+authenticated): crm_newsletter_signup (`0056:420-472`), crm_confirm (`0141:1225-1250`), crm_unsubscribe (`0141:1297-`), crm_preferences (`0056:532-555`), crm_set_preferences (`0141:1252-1295`), crm_public_lists (`0056:600-606`), crm_archive (`0056:609-618`), crm_archive_item (`0056:620-628`) | | token-based / none | none |
| Service role only: crm_mail_claim (last `0137:560-716`), crm_mail_done (last `0093:390-416`, moves stage on send), record_crm_event (last `0141:1334-`; grant `0056:1433-1434`) | | | none |

### 6.3 CRM — companies, pipeline, tasks, inbox, lead scoring, Brønnøysund, partners
| Function | Last def | Gate | Audit |
|---|---|---|---|
| admin_crm_companies(p_q, p_stage, p_owner) | `0056:826-846` | crm_can_read; crm_sync | crm.companies |
| admin_crm_company(p_id) | `0143:1511-` | crm_can_read | crm.company |
| admin_crm_company_save(p_id, p) | `0119:23-116` | crm_can_write; owner must be active admin; stage must be non-managed, non-archived; org-linked stage follows plan | crm.company_create / crm.company_update |
| admin_crm_company_import(p_rows, p_source, p_tag) | `0141:961-1055` | crm_can_write | crm.company_import (reason = tag) |
| admin_crm_known_orgnrs(p_orgnrs) | `0058:102-112` | crm_can_read | none |
| admin_crm_stage_move(p_ids, p_to) | `0093:140-180` | crm_can_write | crm.stage_move |
| admin_crm_stages / admin_crm_stage_save | `0112:37-96` | read / write | none / crm.stage_create, crm.stage_update |
| admin_crm_reply_stage(p_key) | `0145:83-98` | crm_can_write | crm.reply_stage |
| admin_crm_activity(p_company, p_contact, p_kind, p_body, p_due) | `0093:544-572` | crm_can_write | crm.activity_add |
| admin_crm_task_done / admin_crm_task_skip | `0143:1488-`, `0137:381-397` | crm_can_write | crm.task_done / crm.task_skip |
| admin_crm_tasks() | `0056:1065-1077` | crm_can_read | none |
| admin_crm_task_list(p_view) | `0143:1434-` | crm_can_read | crm.task_list |
| admin_crm_pipeline_summary(p_from) | `0137:98-131` (STABLE) | crm_can_read | none |
| admin_crm_owners() | `0119:119-132` (STABLE) | crm_can_read | none |
| admin_crm_inbox(p_days) | `0112:117-165` | crm_can_read; crm_sync | crm.inbox |
| admin_crm_sla(p_minutes) | `0112:99-114` | crm_can_write | crm.sla |
| admin_lead_scores() | `0143:1407-1432` | crm_can_read | crm.lead_scores |
| admin_brreg_triggers() | `0143:1214-` (STABLE) | crm_can_read | none |
| admin_brreg_set_dry_run(p_on, p_reason) | `0145:38-62` | crm_can_write | crm.brreg_dry_run |
| admin_brreg_poll_now() | `0143:1303-` | crm_can_write | crm.brreg_requeue / crm.brreg_poll |
| admin_crm_partners / admin_crm_partner_save | `0143:1331-1405` | read / write | none / crm.partner_save |
| Service role only: brreg_poll_begin, brreg_ingest, brreg_role_candidates, brreg_roles_ingest, brreg_outreach_names_needed, brreg_outreach_names, brreg_purge, brreg_poll_end (`0143:500-683`, grants `0143:1547-1556`) | | | none |

Internal (revoked from all client roles) CRM helpers: app.crm_hash, crm_token_hash, crm_new_token,
crm_type, crm_suppressed, crm_mailable (final `0056:281-291`), crm_on_list, crm_sync (final
`0141:1129-1192`), crm_filter_ok (final `0093:419-453`), crm_segment_contacts (final
`0056:341-365`), crm_blocks_ok (final `0113:19-51`), crm_contact_json, crm_company_json (final
`0119:11-21`), crm_log (`0056:814-824`), crm_campaign_stats, crm_campaign_ready, crm_advance
(`0093:113-134`), crm_role_address, crm_placeholder_left, crm_follow_done (`0137:203-213`),
crm_chain_root, crm_step_tasks (`0137:216-244`), lead_score / lead_contacts / lead_route
(`0143:766-885`), fit_score, intent_score, brreg_* helpers. Revocations: `0055:1097-1104`,
`0056:1409-1414`, `0093:134`, `0115:20`, `0137:159,244`, `0143` per function. **Not found:** a
revoke for `app.crm_business_hours`, `app.crm_chain_depth`, `app.crm_follow_audience` (0111) —
grep of all migrations for those names with `revoke` returned nothing; and `app.crm_placeholder_left`
(0113) has none in 0113 either. These are app-schema functions; whether `authenticated` can
execute them depends on the default EXECUTE grant to PUBLIC (not revoked) and schema USAGE
(`0001:9` grants usage on schema app to authenticated, anon, service_role).

### 6.4 Admin (non-CRM) RPCs
| Function | Last def | Gate | Audit |
|---|---|---|---|
| admin_whoami() | `0049:192-204` | none (returns is_admin) | none |
| admin_record_login() | `0049:206-212` | admin_role not null | admin.login |
| admin_org_list(p_search, p_status) | `0118:70-117` | {super_admin, support, finance} | orgs.list |
| admin_org_detail(p_org) | `0049:257-352` + rewrites `0126:131`, `0150:180` | role not null and not analyst/editor | org.view |
| admin_extend_trial | `0049:354-379` | {super_admin, support} | trial.extend |
| admin_note_add | `0049:381-398` | {super_admin, support, finance} | note.add |
| admin_user_search | `0049:402-436` | {super_admin, support} | users.search (detail q) |
| admin_audit_list | `0049:439-459` + `0126:132` | see §1.5 | none |
| admin_ops | `0049:465-492` | {super_admin, support} | ops.view |
| admin_email_log | `0053:151-173` | {super_admin, support} | email_log.view |
| admin_deliverability | `0053:177-214` | {super_admin, support} | deliverability.view |
| admin_kpis / admin_funnel / admin_trends | `0049:514-538` / `0094:375-` / `0094:416-` (+`0126` editor) | any non-editor role | kpis.view / funnel.view / trends.view |
| admin_web / admin_web_report | `0059:174-279` / `0121:71-161` (+`0126`) | any non-editor role | web.view / none |
| admin_org_attribution | `0050:293-303` | {super_admin, support, finance} | attribution.view |
| admin_list_admins / admin_set_admin | `0049:584-599` / `0055:1059-1090` | super_admin | admins.list / admins.set |
| admin_org_lifecycle | `0060:179-191` | {super_admin, support} | lifecycle.view |
| admin_account_health | `0120:114-160` | {super_admin, support, finance, marketing} | health.view |
| admin_seo | `0126:23-122` | {super_admin, marketing, analyst, editor} | seo.view |
| admin_spend_add / admin_spend_delete | `0062:105-140` | {super_admin, finance, marketing} | spend.add / spend.delete |
| admin_acquisition | `0094:443-475` | {super_admin, finance, marketing, analyst} | acquisition.view |
| admin_cancel_org / admin_cancel_withdraw / admin_delete_now / admin_org_cancellation / admin_deletions | `0065:16-48` / `0064:347-364` / `0064:367-394` / `0066:97-110` / `0136:215-229` | §1.5 | org.cancel / org.cancel_withdraw / org.delete_now / none / deletions.view |
| admin_attention | `0116:13-47` (+`0126:138`) | any non-editor role | none |
| admin_set_account_owner / admin_org_owner | `0118:24-68` | {super_admin, support} / {super_admin, support, finance} | org.owner / none |
| admin_tickets, admin_ticket, admin_ticket_update, admin_ticket_reply, admin_ticket_link_round, admin_org_tickets, admin_ticket_mentions(_seen), admin_canned_replies, admin_canned_reply_save/_active, admin_ticket_report, admin_notice_recipients, admin_ticket_mail | `0051`, `0135`, `0134` | {super_admin, support} | tickets.list, ticket.view, ticket.update, ticket.note/reply, ticket.link, tickets.org, tickets.mentions, ticket.mentions_seen, tickets.canned, ticket.canned_*, tickets.report |
| admin_cms_*, admin_media*, admin_site_notice(_set), admin_site_indexing_set, admin_site_settings | `0114`, `0123`, `0124`, `0126` | cms_can_read / cms_can_write / super_admin | cms.*, media.*, site.* |
| admin_growth_events, admin_growth_view, admin_growth_export, admin_growth_set_item, admin_growth_set_experiment, admin_growth_decide, admin_growth_magnets, admin_growth_deliverability, admin_deliverability_claim, admin_deliverability_check | `0142:962-1006`, `0142:754-957`, `0144:314-570` | growth roles (claim/check: super_admin, marketing) | growth.*, deliverability.auth_* |

---

## 7. Triggers relevant to CRM / admin / firewall
| Trigger | Table | Function | Cite |
|---|---|---|---|
| platform_admins_separate | platform_admins | app.admin_not_member | `0049:47-48` |
| memberships_not_admin | memberships | app.member_not_admin | `0049:59-60` |
| admin_audit_fixed / admin_audit_no_truncate | admin_audit | app.admin_audit_fixed (unconditional raise) | `0049:108-111` |
| tickets_derive | tickets | app.tickets_derive | `0051:154-155` |
| ticket_messages_fixed / ticket_events_fixed | ticket_messages / ticket_events | app.ticket_history_fixed | `0051:253-256` |
| ticket_csat_fixed | ticket_csat | app.ticket_csat_fixed | `0135:64-65` |
| employees_address_problems_clear | employees | app.address_problems_clear | `0053:76-77` |
| billing_cancel_clear | billing | app.billing_cancel_clear | `0066:36-37` |
| organizations_demo_locked, *_demo, outbox_demo | organizations, entry_codes, dpa_signatures, member_invites, billing, outbox | app.demo_* | `0094:332-370` |
| cms_revisions_frozen | cms_revisions | app.cms_revisions_frozen | `0114:220-221` |
| crm_stage_record | crm_companies | app.crm_stage_record | `0137:69-70` |
| crm_stage_changes_guard | crm_stage_changes | app.crm_stage_changes_guard | `0137:88-89` |
| growth_event_check / growth_event_guard | growth_events | app.growth_event_check / _guard | `0141:197-198, 228-229` |
| growth_forget_demo | demo_orgs | app.growth_forget_demo | `0141:284-285` |
| growth_org_created, growth_org_verified, growth_user_signed_up, growth_employees_imported, growth_survey_created, growth_survey_scheduled, growth_action_item, growth_stakeholder_invited, growth_billing, growth_ticket_created, growth_results_viewed, growth_demo_request | organizations, memberships, employees, measurements, rounds, measures, member_invites, billing, tickets, product_events, demo_requests | app.growth_on_* | `0141:304-474` |
| consent_purpose_for_list | crm_lists | app.consent_purpose_for_list | `0141:694-695` |
| consent_records_guard | consent_records | app.consent_records_guard | `0141:744-745` (fn replaced `0143:1029-1050`) |
| consent_on_contact / consent_on_member / consent_on_suppression (DEFERRABLE INITIALLY DEFERRED constraint triggers) | crm_contacts / crm_list_members / crm_suppression | app.consent_on_* → app.consent_sync | `0141:865-894` |
| consent_event | consent_records | app.consent_event | `0141:915-916` |
| growth_funnel_events_known | growth_funnel_stages | app.growth_funnel_events_known | `0142:303-305` |
| brreg_outreach_orphaned | brreg_outreach | app.brreg_outreach_orphaned | `0143:226-228` |
| brreg_outreach_done / brreg_task_stopped | crm_activities | app.brreg_outreach_done / app.brreg_task_stopped | `0143:424, 453` |
| brreg_suppression_reroute | crm_suppression | app.brreg_suppression_reroute | `0143:480` |
| growth_krav_version_guard | growth_krav_rule_versions | app.growth_krav_version_guard | `0144:152-153` |
| answers_immutable (+ other answer-table guards) | answers etc. | app.forbid_answer_change … | `0003:161-163`, `0095:127-128` |
No trigger was found on responses/answers/extra_answers/response_comments/invitations other than
their own guards; that is what growth_firewall rule 6 asserts live (`0141:1492-1529`).

---

## 8. Scheduled jobs (pg_cron)
| Job | Schedule (UTC) | Command | Cite |
|---|---|---|---|
| orgpuls-wheel | `0 * * * *` | `app.wheel_tick(); app.growth_tick()` (re-scheduled; was wheel only `0020:350`) | `0141:549` |
| orgpuls-dispatch | `*/5 * * * *` | `net.http_post` to the dispatcher edge function (vault secrets orgpuls_dispatch_url / _secret) — the dispatcher claims CRM, lifecycle and ticket mail via the service-role claim RPCs | `0032:292-302` |
| orgpuls-web-retention | `17 3 * * *` | delete web_events older than 400 days | `0050:349-350` |
| orgpuls-lifecycle-plan | `*/15 * * * *` | app.lifecycle_plan() | `0060:125` |
| orgpuls-seo | `23 3 * * *` | http_post to orgpuls-seo edge function | `0061:175-185` |
| orgpuls-kpi-capture | `55 21,22 * * *` | app.kpi_capture() | `0062:74` |
| orgpuls-deletion | `40 2 * * *` | app.deletion_run() | `0064:311` |
| orgpuls-demo-expire | `20 3 * * *` | app.demo_expire() | `0094:772` |
| orgpuls-brreg-triggers | `10 3 * * *` | app.brreg_cron() | `0143:750` |
| orgpuls-lead-route | `*/5 * * * *` | app.lead_route() (creates founder/PQL tasks) | `0143:887` |
| (non-CRM) orgpuls-final-reminders, -measure-notices, -participation-alerts, -evaluation-notices, -entra-sync | — | — | `0076:615`, `0099:113,158`, `0103:175`, `0165:334` |
No `cron.unschedule` exists in any migration.

---

## 9. Storage
- **No `storage.buckets` or `storage.objects` reference in any migration** (grep across
  `supabase/migrations/`).
- CMS media are stored as `bytea` in `app.cms_media` (≤ 2 MB, png/jpeg/webp only), served via
  `public.cms_media_file(p_key)` (anon) — "Kept here, not in Storage, as the organisation logo is
  (0104)" (`0124:3-6, 21-38, 154-163`).

---

## 10. Firewall list (response-level and respondent-identity tables)

| Table | Holds | RLS | Policies | Client grants | Cite |
|---|---|---|---|---|---|
| app.responses | group + truncated hour; no linkage column | on `0003:178` | none | revoked anon, authenticated `0003:228` | `0003:101-116` |
| app.answers | 1–5 values per statement | on `0003:179` | none | revoked `0003:228` | `0003:118-126`; immutable trigger `0003:138-163` |
| app.extra_answers | screening answers, incl. **free_text** | on `0010:31` | none | revoked anon, authenticated `0010:35` | `0010:20-35` |
| app.response_comments | comment **body** | on `0012:32` | none | revoked anon, authenticated `0012:35` | `0012:23-35` |
| app.comment_threads / app.thread_messages | conversation, key_hash, message bodies | on `0018:87-88` | none | revoked anon, authenticated, public `0018:89` | `0018:43-89` |
| app.contact_requests | thread ↔ leader | on `0046:34` | none | revoked public, anon, authenticated `0046:35` | `0046:24-35` |
| app.module_answers / module_segment_answers / org_count_answers | module answers | on `0067:503-505` | none | revoked anon, authenticated `0067:523` | `0067:406-433` |
| app.not_relevant_answers / module_not_relevant_answers | «ikke relevant» | on `0087:69-70` | none | revoked public, anon, authenticated `0087:72` | `0087:22-36` |
| app.org_question_answers | own-question answers incl. free_text | on `0095:147` | none | revoked `0095:149` | `0095:101-149` |
| app.invitations | employee_id, **token_hash**, sent/responded timestamps (linked to a person by design) | on `0003:177` | all dropped `0042:628-631` | revoked anon, authenticated, public `0042:632` | `0003:84-96` |
| app.employees | **full_name, email, phone**, group | on `0003:173` | `employee_read` SELECT to authenticated `using app.is_org_member(org_id)` (`0003:181-182`, never dropped); insert/update/delete for daglig_leder (`0026:87-95`) | select/insert/update/delete to authenticated `0003:221-222` | `0003:23-34` |
| app.outbox | employee_id, invitation_id, last_error | on `0020:73` | `outbox_read` dropped `0106:28` | select revoked `0106:29-30` | `0020:43-81` |
| app.outbox_recipients | address_key (32 bytes), masked address | on `0134:42` | none | revoked `0134:43` | `0134:29-43` |
| app.address_problems | employee_id + bounce state | on `0053:60` | none | revoked `0053:61` | `0053:51-61` |
| app.employee_former_names | org + former names (for masking) | on `0190:79` | none | none ("NO POLICY, and no grant", `0190:80`) | `0190:70-80` |
| app.demo_requests | demo requester email (+ name/company/role, 0146) | on `0094:87` | none | revoked `0094:90-91` | `0094:53-62` |

**Firewall checker** `app.growth_firewall()` (final `0143:1575-1732`, origin `0141:1393-1545`): its
`v_resp` list = responses, answers, extra_answers, response_comments, invitations, employees,
module_answers, module_segment_answers, module_not_relevant_answers, not_relevant_answers,
org_question_answers, org_count_answers, comment_threads, thread_messages, contact_requests
(`0141:1398-1400`). Scope of "growth side" tables: regex
`^(crm_|growth_|consent_|event_|brreg_|mail_)|_events$|^partners$` (final, `0143:1600`). Seven
rules: no FK either direction (1), catalogue props (2), no non-platform role privilege on answer
tables incl. column grants (3), no CRM contact equal to a non-account employee address (4), no event
key/prop equal to a respondent/invitation/employee id, token hash or employee email (5), nothing
attached to the submit_response write set except the listed guards (6), every scope table RLS on /
no policy / no grant to anon, authenticated, service_role (7). Exposed read-only through
`admin_growth_events()` (growth roles). Not callable by clients (`0141:1545`, `0143` end).

**Admin/CRM code paths that do reach response-level or identity tables** (all SECURITY DEFINER,
aggregates/counts unless stated):
- `app.growth_tick()` counts `app.responses` per round (`0141:508-522`); one-time backfill read
  `app.responses.submitted_hour` (`0141:592-604`).
- `app.health_score()` counts invitations and `app.responses` of the last closed round, withheld
  below `k_min()` invitations (`0141:1626-1644`) — reached by `admin_growth_events()`.
- `app.org_unlocked()` (`0060:64-74`, rewritten `0150:177-178`) and admin_org_detail /
  admin_org_list / admin_funnel / admin_account_health: invitations.responded_at grouped by
  employees.group_id (`0049:240-245, 318-324, 569-573`, `0120:151-156`).
- `app.growth_funnel_count('setup')` reads `app.employees` created_at row order (`0142:349-357`).
- `app.delete_organisation()` counts responses before deleting (`0136:167`).
- `app.demo_copy_table()` copies every answer table template→sandbox (`0094:93-131, 176-237`).
- `app.growth_firewall()` reads employees emails, invitations ids/token hashes, responses ids — to
  compute counts (`0141:1467-1486`).
- No admin or CRM function was found that returns answer values, extra_answers.free_text,
  response_comments.body or thread messages (the customer RPCs `conversations`/`thread_by_key` in
  `0046:134-250` return comment bodies to org leaders/key holders under k — product, not admin).

**Tests proving CRM/admin cannot reach them** (see §11 for detail):
- `tests/admin_invariants.sql:52-56` — no `public.admin_%` function *body* references
  `app.(responses|answers|extra_answers|response_comments)`.
- `tests/crm_invariants.sql:69-79` and `tests/crm_pipeline_invariants.sql:69-79` — no FK from
  `app.crm_%` to employees/invitations/responses/answers/extra_answers/response_comments, and no
  function named `crm_%`, `admin_crm_%` or `record_crm_event` whose body names those tables;
  `tests/crm_invariants.sql:84-95` — the sync takes account holders only, never an employee.
- `tests/ticket_invariants.sql:61-67`, `tests/ticketing_p2_invariants.sql:303-309` — no ticket
  function references response tables.
- `tests/growth_firewall_invariants.sql` (all 21) — rules pass and each fails when broken.
- `tests/growth_events_invariants.sql` (7)@237, (8)@247 — nothing attached to answer tables; no
  event references respondent/invitation/employee.
- `tests/growth_crm_invariants.sql` (1)@83, (26)@544 — G3 tables closed; firewall covers them.
- `tests/respondent_invariants.sql:112-138` — responses has no linkage column; no SELECT/ALL policy
  and no anon/authenticated grant on responses/answers/extra_answers (response_comments not in
  that list).
- `tests/contact_invariants.sql:61` (4) — contact_requests FKs only thread + leader.

---

## 11. Tests (CRM / admin / growth / firewall)
Each suite inserts `(seq, name, expected, actual, pass)` rows and ends with a select; all are
"proved against the live schema" and roll back their probes. Detail per suite with line refs is in
Appendix B; summary:

| Suite | Lines | Asserts (groups) |
|---|---|---|
| crm_invariants.sql | 271 | 17: tables closed; callability; respondents never contacts (3,4 @69-95); basis/consent; DOI; import consent; filter; mailable only; unsubscribe hashed; opens/clicks CRM-only; roles + aal2 + audit; cleanup |
| crm_pipeline_invariants.sql | 301 | 18: tables closed; callability; respondent check again @69; templates valid; business basis; signup link; lists; A/B; unsubscribe scope; click map; web archive; roles; 0058 helpers |
| crm_stages_invariants.sql | 198 | 10: stages data; moves on send/reply; follow-up audience; open/click moves nobody; analyst read-only |
| crm_sequences_invariants.sql | 228 | 8 (+9): manager import (no birth date); business hours; follow-up exits; resend/7-cap; daily cap |
| crm_inbox_invariants.sql | 121 | 5: exit criteria; inbox; SLA |
| crm_designed_mail_invariants.sql | 123 | 4: blocks; templates; placeholder guard |
| crm_deal_invariants.sql | 89 | 6: value; contact; support read-only; owners |
| crm_journeys_invariants.sql | 108 | 6: journey read model; tasks; demo flag |
| crm_sync_invariants.sql | 72 | 3: e-mail change |
| crm_win_rate_invariants.sql | 264 | 11: stage history trigger + append-only + closed; pipeline sums; win rate; call/LinkedIn steps |
| growth_crm_invariants.sql | 792 | 30+ : G3 tables closed incl. service_role, no FK to respondents; gates; audit without address; hash-only suppression; phone notice/DNC; generic-address rule; feed; fit; holdout; dry run; purge; SLA; lead scoring; partners; firewall coverage |
| growth_events_invariants.sql | 428 | 15: catalogue/stream closed; stream checks; emitters; bands; tick; nothing on answer tables; demo; immutability; event page gate |
| growth_firewall_invariants.sql | 357 | 21: every rule passes and each fails when broken by each mechanism |
| growth_registry_invariants.sql | 480 | 16: registry closed incl. service_role; gates; audit; derived statuses; plan; funnel |
| growth_g4_invariants.sql | 463 | 13: gates; audit; magnets; no fabricated figures; Krav versions; streams; registry coverage; k-withholding |
| consent_ledger_invariants.sql | 313 | 10: closed; every path writes its method; append-only; cascade; crm state = ledger; events carry no contact; no gap; hash-only suppression |
| admin_invariants.sql | 211 | 18: admin tables closed; anon calls no admin fn; no admin fn body reads response tables (3); customer ≠ admin; aal2; separation; detail names no employee; reads audited; audit immutable; role matrix; error masking; grant; product events |
| admin_roles_invariants.sql | 113 | 6: editor capabilities/refusals; indexing switch |
| admin_attention_invariants.sql | 97 | 4 |
| account_owner_invariants.sql | 113 | 6 |
| health_score_invariants.sql | 152 | 8: not client-callable; components; 90 reachable |
| contact_invariants.sql | 167 | 14 — this is the **conversation contact request (0046)**, not CRM contacts |
| suppression_invariants.sql | 263 | 14 — this is **complementary suppression of small result groups (0034)**, not CRM suppression (CRM suppression is covered by crm_invariants, consent_ledger (9), growth_crm (4)) |
| ticket_invariants.sql / ticketing_p2_invariants.sql / ticket_holidays_invariants.sql | 226 / 332 / 120 | tickets closed; anon only contact form; no response-table refs; SLA; role gates; immutability; CSAT; mentions; canned replies; holidays |
| web_invariants.sql / web_report_invariants.sql | 248 / 127 | web tables closed; no IP/UA/account; respondent paths never recorded; attribution; admin-only + audited |
| lifecycle, seo, trends, cms, content, media, cancellation, retention, demo, mail_events | 171/143/141/207/125/160/201/325/319/157 | tables closed; role gates with aal2; audit; feature behaviour (headers in Appendix B) |
| respondent_invariants.sql | 185 | 21: write path; no linkage column; no select policy / grants on responses, answers, extra_answers |

There is **no** `admin_crm_*.sql`, `ticket_firewall`, or `crm_firewall` suite beyond the above.

---

## 12. Drift / oddities noticed
1. **`editor` cannot be granted.** `admin_set_admin` whitelist stops at marketing (`0055:1071`);
   editor added in `0125:6`, gates in `0126`, no RPC update.
2. **`product_id` promise broken.** 0049 header: "Every admin table carries product_id"
   (`0049:18-19`). Only 12 tables do, none created after 0056 (crm_suppression, crm_sends,
   crm_activities, crm_stages, crm_senders, crm_templates, crm_clicks, crm_list_members,
   account_owners, all growth_*, brreg_*, partners, consent_*, cms_*, tickets children, …).
   Several functions hard-code `'orgpuls'` (`0055:324`, `0056:921`, `0142:723`).
3. **Blacklist gates leak breadth to new roles.** `admin_org_detail` (`0049:265` → `0126:131`) and
   `admin_audit_list` (`0049:447` → `0126:132`) deny named roles; `marketing` (added 0055) is
   therefore allowed: org detail (finance-level fields) and the **entire** audit trail. The
   0126 patch rewrote only 8 functions for editor; any future role is admitted by every
   `admin_role() is null` gate.
4. **Admin functions that read `app.responses`** (counts) despite 0049's header "None of them
   touches app.responses…" (`0049:12-15`): `app.health_score` via `admin_growth_events`
   (`0141:1632`), `app.growth_tick` (`0141:510`). `tests/admin_invariants.sql:52-56` checks only
   `public.admin_%` bodies, so indirect reads through `app.*` helpers are not caught.
5. **Possibly client-callable SECURITY DEFINER helper.** `app.crm_follow_audience(app.crm_campaigns)`
   (`0111:62-82`, replaced `0137:167-197`) is SECURITY DEFINER, returns `(contact_id, email)`, and
   no `revoke` for it exists in any migration; `app.crm_chain_depth` likewise (`0111:47-56`). The
   `app` schema **is exposed to PostgREST** (`supabase/config.toml:24-25`, comment `:8-13`) and
   `0001:9` grants USAGE on app to anon/authenticated. Unless a default-privilege change exists
   outside migrations, PUBLIC holds EXECUTE. Needs a live check
   (`has_function_privilege('anon','app.crm_follow_audience(app.crm_campaigns)','execute')`).
6. **"Separate schema" claims.** Growth registry seed rows say the firewall is a "separate schema"
   (`0142:593`, `0142:680`); every growth/CRM table is in `app`, next to the answer tables.
7. **Employees table is client-readable.** `employee_read` (`0003:181-182`) lets every org member
   (any role) read names/emails/phones; it is listed in the firewall's `v_resp` but is not a
   no-policy table. (Product design choice; noted for completeness.)
8. **`respondent_invariants` (16,17) omit `response_comments`** though CLAUDE.md lists it among
   the never-selected tables (`tests/respondent_invariants.sql:129-138`); growth_firewall rule 3
   covers it.
9. **Canned reply / templates still say "minst fem svar"/"under fem"** (`0051:265`, `0113:115,145`,
   `0114:652` CMS landing template "færre enn fem svar") while the floor is now 3 (`0150:41-44`); 5 is
   only the default. Copy drift.
10. **Audit gaps on reads**: segment preview returns 20 contact e-mails without an audit row
    (`0055:784-801`); also many STABLE readers (list in §2).
11. **`admin_set_admin` never sets `mfa_enforced`/`product_id`** on upsert (`0055:1084-1086`): a
    previously non-MFA row stays non-MFA after re-granting.
12. **`crm_companies.owner_id` FKs `auth.users`** (`0056:54`) while `growth_items.owner`,
    `tickets.assignee_id`, `account_owners.user_id` FK `platform_admins`. A deactivated/removed
    admin keeps ownership of CRM companies (only validated at write time `0119:53-56`).
13. **`crm_campaigns.follows_id` and `sender_id` have no ON DELETE action** (`0093:86-87`); a
    referenced campaign/sender cannot be deleted (no delete RPC exists, so latent).
14. **Health score is computed, not stored** (`0060:194-237`, `0141:1569-1663`) — two different
    scores coexist: "account health" (0060, 0–100, activation-weighted) and "health score v1"
    (0141, six components, NPS unsourced). Lead score also computed (`0143:766-822`).
15. **`app.lifecycle_settings`, `app.demo_settings`, `app.growth_settings`** have no writer RPC
    found; changes need SQL/migrations.
16. **0126 and 0150 rewrite live function bodies by text replacement** (`0126:125-146`,
    `0150:141-187`): the final source of admin_org_detail, admin_kpis etc. exists only in the
    database, not as a single migration text.
17. **CRM erasure leaves `consent_records`?** No — they cascade with the contact
    (`0141:699`); but `admin_audit.detail` for `admins.set` stores the e-mail (`0055:1087-1088`) and
    `users.search` stores the search string (`0049:415`), which may be an e-mail; admin_audit is
    retained forever and is append-only.

---

## 13. Unknowns
- Whether `service_role`/PUBLIC actually hold privileges on `app.crm_*` tables and EXECUTE on
  unrevoked app functions in the hosted project (no `alter default privileges` in migrations;
  hosted dashboard settings may differ — see `supabase/config.toml:8-13`).
- The exact text of the 0126/0150-rewritten function bodies in the live DB (generated by
  `replace()`), and whether the hosted DB matches migrations.
- Whether a language/locale "flag" table exists (0085 comment says "before its flag is on for
  everyone", `0085` header; grep found no flag table — the flag may live in code/messages).
- 0141:1318-1385, 0142 seed bodies (443-709), 0143 ranges 500-733 and 1051-1543 except cited
  lines, 0144:300-570, 0114:340-679 (except 576-679), 0135:200-596, 0137:370-716, 0124:80-229 were
  read at signature/gate/audit level only; column-level details inside those function bodies are
  not inventoried.
- Grep-level files (0001, 0010, 0012, 0018, 0020, 0026, 0032, 0042, 0067, 0068, 0076, 0085, 0087,
  0095, 0101, 0106, 0109, 0122, 0134, 0145, 0146, 0150, 0155, 0190): only the cited lines were read.
- Edge functions (`supabase/functions/*`) and the Next.js admin UI (`lib/admin/access.ts`) were not
  read; the role→page mapping in the app may differ from the DB gates.

---

# Appendix A — per-migration notes (in migration order)

Citations here are `NNNN:lines` within the named file.

### 0046_contact_request.sql (250 lines) — NOT CRM; respondent-side conversation feature
- `app.contact_requests` (24-35): thread_id uuid PK FK app.comment_threads ON DELETE CASCADE; requested_by uuid NOT NULL FK app.profiles ON DELETE CASCADE; requested_hour timestamptz NOT NULL check = date_trunc('hour'). Index contact_requests_requested_by_idx. RLS on; revoke all from public, anon, authenticated; no policy. Holds the thread + leader, never the author.
- `app.thread_visible(p_thread)` SECURITY DEFINER (44-72): joins comment_threads→responses; role daglig_leder/avdelingsleder; scope visible_groups; count responses ≥ app.k_threshold. Revoked from all client roles.
- `public.request_contact`, `public.withdraw_contact` (75-129) SECURITY DEFINER, granted authenticated. `public.thread_by_key` re-created (134-179) reads response_comments (opening). `public.conversations` re-created (183-250) reads app.answers value + response_comments.
- Relevance to firewall: contact_requests is a respondent-adjacent table (links to comment_threads → responses). It is in the "conversation" family that is RLS-on/no-policy.

### 0050_web_analytics.sql (364 lines)
- `app.web_salts` (28-33): day date PK, salt text NOT NULL. RLS on, revoked from public/anon/authenticated. No product_id.
- `app.web_events` (35-52): id bigint identity PK; product_id text NOT NULL default 'orgpuls'; at timestamptz default now(); day date default Oslo date; visitor text NOT NULL check ^[0-9a-f]{32}$; kind text NOT NULL check in ('view','cta'); path text NOT NULL check ^/[a-z0-9/_-]{0,160}$; referrer_host text check host regex; utm_source/utm_medium/utm_campaign text check len 1..80; label text check ^[a-z0-9_-]{1,40}$. Indexes web_events_day(day), web_events_visitor(visitor,day,at). RLS on, revoked.
- `app.org_attribution` (54-68): org_id uuid PK FK organizations ON DELETE CASCADE; first_landing, first_referrer, first_source, first_medium, first_campaign, last_source, last_medium, last_campaign (text with checks); channel text NOT NULL; recorded_at timestamptz default now(). RLS on, revoked. No product_id.
- Helpers (immutable, search_path ''): app.web_channel(referrer,source,medium) → paid/email/social/organic/campaign/referral/direct (73-86); app.web_is_bot(ua) (89-94); app.web_tag (97-101); app.web_host (104-113, drops orgpuls.com/.no/localhost); app.web_path (116-125, refuses /s, /bli-med, /auth, /admin, /api).
- `app.web_visitor(p_ip,p_ua)` SECURITY DEFINER (128-141): daily salt rotation (deletes yesterday's salts), sha256 cut to 32 hex.
- `public.track_web_event(p_ip,p_ua,p_kind,p_path,p_referrer,p_utm jsonb,p_label)` void SECURITY DEFINER (147-170): bot filter, path filter, ≤300 events/visitor/day. Grant anon, authenticated (354-355).
- `public.record_signup_source(p_first,p_last)` SECURITY DEFINER (176-200): caller must be daglig_leder of org created < 1h ago; inserts org_attribution on conflict do nothing. Granted authenticated.
- `public.admin_web(p_days)` (206-290): any admin role (app.admin_role() not null); audit 'web.view' detail {days}. Reads web_events, organizations, org_attribution, invitations (sent_at existence), billing.
- `public.admin_org_attribution(p_org)` (293-303): is_platform_admin({super_admin,support,finance}); audit 'attribution.view'.
- `public.admin_funnel` replaced (306-345): median only counts sends after signup.
- pg_cron: 'orgpuls-web-retention' '17 3 * * *' deletes web_events older than 400 days (349-350).
- Grants (353-364): app.web_visitor revoked from all; record_signup_source/admin_web/admin_org_attribution → authenticated only.

### 0049_platform_admin.sql (656 lines)
- Header design constraints (1-19): admin identities separate from customer; role honoured only at aal2 (app.admin_role); admins read customer data only via SECURITY DEFINER fns, none touch responses/answers/extra_answers/response_comments; every read of customer data and every write logs app.admin_audit; every admin table carries product_id.
- `app.platform_role` enum ('super_admin','support','finance','analyst') — 0049:22
- `app.platform_admins` (24-35): user_id uuid PK FK auth.users ON DELETE CASCADE; role app.platform_role NOT NULL; product_id text NOT NULL default 'orgpuls'; mfa_enforced bool NOT NULL default true; active bool NOT NULL default true; created_by uuid FK auth.users ON DELETE SET NULL; created_at timestamptz NOT NULL default now(). Index platform_admins_created_by (33). RLS enabled, no policy, no grant (34-35).
- Triggers: `app.admin_not_member()` + trigger platform_admins_separate BEFORE INSERT OR UPDATE OF user_id on platform_admins (38-48); `app.member_not_admin()` + trigger memberships_not_admin on app.memberships (50-60). search_path ''; NOT security definer.
- `app.admin_role()` returns app.platform_role, SQL STABLE SECURITY DEFINER search_path '' (64-72): role where user_id=auth.uid() and active and (not mfa_enforced or jwt aal='aal2').
- `app.is_platform_admin(p_roles app.platform_role[])` boolean, SECURITY DEFINER (74-76): coalesce(admin_role() = any(p_roles), false).
- `app.admin_audit` (79-99): id bigint identity PK; at timestamptz default now(); product_id text NOT NULL default 'orgpuls'; admin_id uuid (no FK); admin_email text; admin_role app.platform_role; action text NOT NULL check ~ '^[a-z_]+\.[a-z_]+$'; org_id uuid (no FK); org_name text; target_type text; target_id text; reason text check len<=500; detail jsonb. Indexes admin_audit_org(org_id,at desc), admin_audit_admin(admin_id, at desc), admin_audit_at(at desc). RLS on, no policy.
- Append-only: `app.admin_audit_fixed()` raises 'the admin audit log is append-only'; triggers admin_audit_fixed BEFORE UPDATE OR DELETE (row) and admin_audit_no_truncate BEFORE TRUNCATE (statement) (102-111). (Comment: references nothing, so no FK maintenance to allow.)
- `app.admin_log(p_action, p_org, p_target_type, p_target_id, p_reason, p_detail)` returns void, SQL VOLATILE SECURITY DEFINER (113-123): inserts admin_audit copying auth.uid(), email from auth.users, admin_role(), org name.
- `app.admin_org_notes` (126-137) "a small CRM": id uuid PK default gen_random_uuid(); product_id text NOT NULL default 'orgpuls'; org_id uuid NOT NULL FK organizations ON DELETE CASCADE; author_id uuid FK auth.users ON DELETE SET NULL; author_email text; body text NOT NULL check char_length(btrim(body)) between 1 and 4000; created_at timestamptz NOT NULL default now(). Indexes admin_org_notes_org(org_id, created_at desc), admin_org_notes_author(author_id). RLS on, no policy.
- `app.product_events` (142-154): id bigint identity PK; product_id text default 'orgpuls'; at timestamptz; day date default Oslo date; org_id uuid NOT NULL FK organizations CASCADE; user_id uuid FK auth.users SET NULL; role app.org_role; name text NOT NULL check in ('results_viewed','report_viewed','comments_viewed','measures_viewed'). Unique product_events_once(user_id,name,day); index product_events_org(org_id,name,at). RLS on, no policy.
- `public.track_product_event(p_name text)` void, plpgsql SECURITY DEFINER (156-172): writes product_events for caller's first active membership; on conflict do nothing. Granted authenticated (641-648).
- `app.org_status(p_org)` text SECURITY DEFINER (175-184): active/trial/expired from app.billing.
- `app.plan_monthly_nok(p_plan)` immutable (187-189): small 265, usual 565.
- `public.admin_whoami()` (192-204): jsonb is_admin, role, mfa_enforced, aal, email. No role gate. No audit.
- `public.admin_record_login()` (206-212): if admin_role() not null → admin_log('admin.login').
- `public.admin_org_list(p_search,p_status)` (215-255): is_platform_admin({super_admin,support,finance}); audit 'orgs.list'. Reads organizations, billing, employees(count), memberships(count), invitations (counts/sent_at), rounds, auth.users email (search).
- `public.admin_org_detail(p_org)` (257-352): admin_role() not null and <> 'analyst'; support-only fields for super_admin/support (users, rounds, timeline); audit 'org.view'. Reads organizations, billing, dpa_signatures, groups, employees(counts), locations, memberships, profiles, auth.users, auth.mfa_factors, rounds, measurements, invitations+employees (group counts), outbox counts, measures, product_events, admin_org_notes.
- `public.admin_extend_trial(p_org,p_days,p_reason)` (354-379): {super_admin,support}; reason ≥5 chars; days 1..60; updates app.billing; audit 'trial.extend' with reason+detail.
- `public.admin_note_add(p_org,p_body)` (381-398): {super_admin,support,finance}; inserts admin_org_notes; audit 'note.add'.
- `public.admin_user_search(p_q)` (402-436): {super_admin,support}; audit 'users.search' detail {q}; reads auth.users, profiles, memberships, organizations, member_invites; excludes platform admins; limit 50.
- `public.admin_audit_list(p_org,p_limit)` (439-459): super_admin all; support only with p_org; finance/analyst denied; NO audit row written. limit clamp 1..1000.
- `public.admin_ops()` (465-492): {super_admin,support}; audit 'ops.view'; reads job_runs, outbox (masks e-mail addresses in last_error via regexp, 487).
- `public.admin_email_log(p_org)` (494-511): {super_admin,support}; audit 'email_log.view'; outbox counts.
- `public.admin_kpis()` (514-538): any admin role; audit 'kpis.view'; billing+organizations.
- `public.admin_funnel(p_months)` (542-581): any admin; audit 'funnel.view'; reads organizations, employees, measurements, invitations (responded_at), rounds, product_events, measures, billing.
- `public.admin_list_admins()` (584-599): super_admin; audit 'admins.list'.
- `public.admin_set_admin(p_email,p_role,p_active,p_reason)` (603-634): super_admin; reason ≥5; not_yourself guard (demote/deactivate self); customer_account guard; upsert platform_admins (note: on conflict does NOT update mfa_enforced/product_id); audit 'admins.set'.
- Grants (637-656): all public.admin_* + track_product_event: revoke public, anon; grant execute authenticated. app.admin_not_member, member_not_admin, admin_role, is_platform_admin, admin_audit_fixed, admin_log, org_status: revoke from public, anon, authenticated.

### 0051_tickets.sql (664 lines) — ITSM/ticketing inside admin (sales queue exists)
- Enums (30-37): app.ticket_type(question,service_request,incident,problem); app.ticket_status(new,open,waiting_customer,waiting_us,resolved,closed); app.ticket_priority(low,normal,high,urgent); app.ticket_queue(support,billing,sales,personvern); app.ticket_category(getting_started,survey_delivery,results_anonymity,tiltak,billing,bug,feature_request,sales,personvern); app.ticket_impact(one_user,one_org,many_orgs).
- Helpers: app.add_business_hours (41-67, Mon-Fri 08-16 Oslo); app.ticket_priority_of (70-82); app.ticket_first_response_hours (85-87); app.ticket_resolve_hours (89-91).
- `app.tickets` (94-131): id uuid PK; number bigint identity start 1001 unique; product_id text NOT NULL default 'orgpuls'; type default 'question'; status default 'new'; category NOT NULL; queue NOT NULL; impact default 'one_user'; blocking bool default false; priority default 'normal'; subject text NOT NULL 1..200; channel text NOT NULL check in (contact_form,in_app,email,admin); org_id FK organizations ON DELETE SET NULL; user_id FK auth.users SET NULL; requester_name ≤120; requester_email NOT NULL ≤254 + regex; requester_org ≤200; context jsonb NOT NULL default '{}'; assignee_id FK app.platform_admins(user_id) SET NULL (owner-like); problem_id FK app.tickets SET NULL; first_response_due, resolve_due timestamptz NOT NULL default now(); legal_due; first_responded_at; resolved_at; closed_at; created_at; updated_at. Indexes: tickets_open partial(queue,status), tickets_org, tickets_user, tickets_assignee, tickets_problem, tickets_requester(lower(email),created_at). RLS on, revoked from public/anon/authenticated.
- Trigger tickets_derive BEFORE INSERT OR UPDATE → app.tickets_derive() (134-155): priority derived; SLA deadlines; personvern legal_due +30d; updated_at; resolved_at/closed_at bookkeeping.
- `app.ticket_messages` (157-170): id uuid PK; ticket_id FK tickets CASCADE; author_kind check (customer,admin,system); author_id FK auth.users SET NULL; author_email; body 1..10000; internal bool default false; created_at. Indexes (ticket_id,created_at), (author_id). RLS on, revoked.
- `app.ticket_events` (172-184): id bigint identity; ticket_id FK CASCADE; at; actor_id FK auth.users SET NULL; actor_email; kind check ^[a-z_]+$; detail jsonb default '{}'. RLS on, revoked.
- `app.ticket_links` (187-195): (ticket_id FK CASCADE, round_id FK app.rounds CASCADE) PK; created_at. RLS on, revoked.
- `app.canned_replies` (197-207): id uuid PK; product_id; key unique ^[a-z0-9_]+$; title; body; sort int default 0; active bool default true. RLS on, revoked. Seeded 5 Norwegian replies (259-269) — note 'anonymitet' text says "minst fem svar" (k floor is now 3 after 0150? — drift candidate).
- `app.ticket_mail` (209-224): id uuid PK; message_id unique FK ticket_messages CASCADE; to_email NOT NULL; to_name; status check (pending,sending,sent,failed) default pending; attempts int default 0; leased_until; provider_id; last_error check ^[a-z0-9_]{1,40}$; created_at; sent_at. Partial index ticket_mail_pending. RLS on, revoked.
- Append-only trigger `app.ticket_history_fixed()` (227-256) — "nobody may change this content" pattern: delete only when parent ticket gone; update only allows author_id/actor_id → null. Triggers ticket_messages_fixed, ticket_events_fixed BEFORE UPDATE OR DELETE.
- `app.ticket_event(p_ticket,p_kind,p_detail)` SECURITY DEFINER (272-277) — revoked from client roles (645).
- `public.submit_contact(p_topic,p_name,p_email,p_org,p_message,p_trap)` (282-327): anon+authenticated (646-647); honeypot; 3/hour per email, 60/hour global; links to auth user/org by e-mail (unverified, context.verified=false); topic 1 → queue 'sales', category 'sales'. This is the "lead" ingress for sales.
- `public.submit_help_request(...)` (330-375): active member only; 10/hour.
- Admin RPCs, all gated is_platform_admin({super_admin,support}), all SECURITY DEFINER, authenticated grant: admin_tickets (379-418, audit 'tickets.list'), admin_ticket (420-462, audit 'ticket.view'), admin_ticket_update (466-525, ticket_event 'updated' + audit 'ticket.update' with diff), admin_ticket_reply (529-568, queues ticket_mail if not internal; audit 'ticket.note'/'ticket.reply'), admin_ticket_link_round (570-591, audit 'ticket.link'), admin_org_tickets (594-606, audit 'tickets.org').
- Dispatcher: public.ticket_mail_claim(p_batch) (610-629), public.ticket_mail_done(...) (631-642) — granted service_role only (659-663).

### 0053_mail_events.sql (222 lines)
- Header (1-20): opens and clicks deliberately NOT recorded (per-person engagement timestamp next to answer hour narrows who answered).
- `app.mail_events` (23-40): id bigint identity PK; received_at default now(); at timestamptz NOT NULL; event text NOT NULL check in (delivered,soft_bounce,hard_bounce,blocked,spam,invalid,deferred,unsubscribed,error); message_id text NOT NULL 1..200; outbox_id FK app.outbox SET NULL; ticket_mail_id FK app.ticket_mail SET NULL; org_id FK organizations CASCADE; reason text ≤200; UNIQUE(message_id,event,at). Indexes mail_events_at, mail_events_org(org_id,at), mail_events_outbox, mail_events_ticket_mail. RLS on, revoked. No product_id.
- Enum app.mail_delivery (42). Columns outbox.delivery/delivery_at, ticket_mail.delivery/delivery_at (44-45). Indexes outbox_provider_id, ticket_mail_provider_id (48-49).
- `app.address_problems` (51-61): employee_id FK app.employees CASCADE; channel check (email,sms); org_id FK CASCADE; problem app.mail_delivery check in (hard_bounce,invalid,blocked,spam,unsubscribed); at; PK(employee_id,channel). RLS on, revoked. **Respondent-identity-adjacent** (employee ids).
- Trigger employees_address_problems_clear AFTER UPDATE OF email, phone ON app.employees → app.address_problems_clear() SECURITY DEFINER (64-77).
- `public.record_mail_event(p_event,p_message_id,p_at,p_reason)` (81-131) SECURITY DEFINER; service_role only (217-218); masks addresses in reason (108); updates outbox/ticket_mail delivery; upserts/deletes address_problems.
- `public.address_problems(p_org)` (136-147): app.has_role(p_org, {daglig_leder}); returns employee names/emails/phones. authenticated.
- `public.admin_email_log` replaced (151-173): {super_admin,support}; audit 'email_log.view'; adds delivery counts + address_problems count.
- `public.admin_deliverability(p_days)` (177-214): {super_admin,support}; audit 'deliverability.view'. Counts only. authenticated grant (221-222).

### 0054_web_geo.sql (183 lines)
- web_events add columns country (^[A-Z]{2}$), region, city (1..80), network (/24 or /48) (21-25).
- `app.web_network(p_ip)` immutable (28-43); revoked from client roles (183).
- track_web_event dropped & recreated with p_geo jsonb (47-77); anon+authenticated (181-182).
- admin_web replaced (79-179): any admin; audit 'web.view'; adds countries, cities, recent 100 visits with network.

### 0055_crm.sql (1130 lines) — Marketing CRM basics (D-101, X-061)
- Header (1-35): respondents never contacts; nothing reads app.employees, response tables or invitations; basis per contact (consent/customer/none); markedsføringsloven §15 customer exception is a setting; mailable definition (active, not suppressed, basis allows, engagement within 12 months); suppression stores sha256 hashes; one-click unsubscribe tokens hashed; sends clear address after send; opens/clicks recorded only for CRM sends. New admin role 'marketing'; super_admin may too; analyst may read.
- `alter type app.platform_role add value 'marketing'` (37).
- Helpers (immutable/volatile, search_path ''): app.crm_hash(email) sha256 of lower(btrim) (40-42); app.crm_token_hash (45-47); app.crm_new_token() 32 random bytes hex (49-51).
- `app.crm_settings` (54-62): id boolean PK default true check(id) [singleton]; customer_exception bool NOT NULL default false; changed_by uuid FK auth.users SET NULL; changed_at timestamptz. Seed row (60). RLS on, revoked. No product_id.
- `app.crm_contacts` (64-93): id uuid PK; product_id text NOT NULL default 'orgpuls'; email text NOT NULL check lower/btrim, ≤254, regex; name 1..120; company 1..200; org_number ^[0-9]{9}$; role check in (daglig_leder,hr,leder,verneombud,annet); user_id uuid UNIQUE FK auth.users SET NULL; org_id FK organizations SET NULL; source text NOT NULL check in (user,newsletter,contact_form,import,manual,event); basis text NOT NULL default 'none' check (consent,customer,none); status text NOT NULL default 'active' check (pending,active,unsubscribed); consent_at; consent_source 3..200; optin_hash unique ^[0-9a-f]{64}$; optin_sent_at; tags text[] NOT NULL default '{}' cardinality ≤20; lang default 'no' check (no,en); last_engaged_at; created_at; updated_at; UNIQUE(product_id,email); CHECK (basis<>'consent' or consent_at and consent_source not null). Indexes crm_contacts_org(org_id), crm_contacts_tags GIN(tags). RLS on, revoked.
- `app.crm_suppression` (95-101): email_hash text PK ^[0-9a-f]{64}$; reason NOT NULL check in (unsubscribed,hard_bounce,invalid,spam,blocked,manual,erased); at default now(). RLS on, revoked. No product_id.
- `app.crm_segments` (103-114): id uuid PK; product_id; name 1..120; filter jsonb default '{}'; created_by FK auth.users SET NULL; created_at; updated_at; UNIQUE(product_id,name). RLS on, revoked.
- `app.crm_campaigns` (116-139): id uuid PK; number bigint identity start 101 unique; product_id; name 1..120; kind default 'newsletter' check (newsletter,campaign,promotion,announcement); lang (no,en); subject ≤150 default ''; preheader ≤200 default ''; blocks jsonb default '[]'; segment_id FK crm_segments SET NULL; utm_campaign NOT NULL ^[a-z0-9_-]{1,60}$; status default 'draft' check (draft,scheduled,sending,sent,cancelled); scheduled_at; started_at; finished_at; audience int; created_by FK auth.users SET NULL; created_at; updated_at. Partial index crm_campaigns_due(scheduled_at) where scheduled. RLS on, revoked.
- `app.crm_sends` (141-167): id uuid PK; kind check (campaign,test,optin); campaign_id FK crm_campaigns CASCADE; contact_id FK crm_contacts SET NULL; to_email ≤254; status default 'pending' check (pending,sending,sent,failed,skipped); attempts; leased_until; provider_id; last_error ^[a-z0-9_]{1,40}$; unsub_hash unique 64-hex; delivery app.mail_delivery; delivery_at; opened_at; clicked_at; unsubscribed_at; created_at; sent_at; CHECK (kind='optin' or campaign_id not null). Indexes crm_sends_once UNIQUE(campaign_id,contact_id) where kind='campaign'; crm_sends_pending partial; crm_sends_provider; crm_sends_contact. RLS on, revoked. No product_id.
- `app.crm_type(p_user,p_org,p_source)` SECURITY DEFINER (173-182): prospect/trial/customer/former via memberships + app.org_access.
- `app.crm_suppressed(email)` (184-186), `app.crm_mailable(c app.crm_contacts)` (188-197) SECURITY DEFINER; reads crm_settings.customer_exception.
- `app.crm_sync()` SECURITY DEFINER (201-227): upserts crm_contacts from auth.users + memberships + profiles (source 'user', basis 'none'); updates basis customer/none (consent never downgraded). Called from admin read RPCs (side-effecting reads).
- `app.crm_filter_ok(f jsonb)` immutable (231-257): allowed keys types, roles, sources, tags, lang, min_employees, max_employees, nace, no_survey_days, mailable_only.
- `app.crm_segment_contacts(f)` SECURITY DEFINER (260-278): reads crm_contacts, organizations (employee_count, registry_nace_code), app.rounds (status, opens_at) for no_survey_days — "reads rounds, never who was invited".
- `app.crm_blocks_ok(b)` (282-295): heading/text/button, button url https.
- Public site RPCs (anon+authenticated, 1106-1110): `public.crm_newsletter_signup(p_email,p_name,p_company,p_lang,p_source,p_trap)` (301-339, honeypot, global 100 optins/hour, 10-min per-address throttle, always ok); `public.crm_confirm(p_token)` (342-360, 7-day expiry, sets consent, deletes suppression); `public.crm_unsubscribe(p_token)` (363-384).
- Dispatcher (service_role only, 1124-1129): `public.crm_mail_claim(p_batch)` (391-446) starts due campaigns, inserts crm_sends per mailable segment contact, marks sent, leases + mints token; `public.crm_mail_done(...)` (449-461) clears to_email; `public.record_crm_event(p_event,p_message_id,p_at)` (466-502) records opens/clicks for CRM sends only, suppression on hard_bounce/invalid/spam/blocked/unsubscribed.
- Gates: `app.crm_can_read()` = is_platform_admin({super_admin,marketing,analyst}) (505-507); `app.crm_can_write()` = is_platform_admin({super_admin,marketing}) (509-511). `app.crm_contact_json(c)` (513-523).
- Admin RPCs (authenticated grant, 1112-1122), all SECURITY DEFINER search_path '':
  - admin_crm_contacts(p_q,p_type,p_limit) (526-554) read; runs crm_sync; audit 'crm.contacts' (detail q boolean, type).
  - admin_crm_contact(p_id) (556-576) read; audit 'crm.contact'.
  - admin_crm_save_contact(p_id, p jsonb) (580-647) write; create requires consent_source ≥3; audit 'crm.contact_create' / 'crm.contact_update'.
  - admin_crm_import(p_rows) (652-717) write; 1..5000 rows; each needs consent_source; audit 'crm.import' (counts).
  - admin_crm_contact_action(p_id,p_action,p_reason) (721-750) write; reason ≥5; 'unsubscribe' or 'erase' (hard DELETE of contact + pending sends; suppression 'erased'); audit 'crm.contact_<action>'.
  - admin_crm_settings(p_customer_exception,p_reason) (752-765) super_admin only; audit 'crm.settings'.
  - admin_crm_segments() (768-782) read; crm_sync; audit 'crm.segments'.
  - admin_crm_segment_preview(p_filter) (784-801) read; crm_sync; **NO audit row** (returns sample of 20 emails).
  - admin_crm_segment_save (803-831) write; audit 'crm.segment_save'.
  - admin_crm_segment_delete (833-846) write; refuses if used by scheduled/sending campaign; hard delete; audit 'crm.segment_delete'.
  - app.crm_campaign_stats(p_id) (849-864).
  - admin_crm_campaigns() (866-879) read; audit 'crm.campaigns'.
  - admin_crm_campaign(p_id) (881-906) read; audit 'crm.campaign'; reads web_events, org_attribution, billing.
  - admin_crm_campaign_save (908-964) write; only drafts editable; audit 'crm.campaign_save'.
  - app.crm_campaign_ready(c) (967-975).
  - admin_crm_campaign_test (978-1003) write; to admin's own email; 10/hour; audit 'crm.campaign_test'.
  - admin_crm_campaign_schedule (1005-1032) write; audit 'crm.campaign_schedule'.
  - admin_crm_campaign_cancel (1035-1055) write; audit 'crm.campaign_cancel'.
- admin_set_admin replaced to accept 'marketing' (1059-1090).
- Grants (1093-1130): app.crm_* helpers revoked from public, anon, authenticated.

### 0056_crm_pipeline.sql (1435 lines) — companies/pipeline, lists, templates, A/B, click map, web archive (D-103, X-062)
- Header (1-34): pipeline stages new→contacted→engaged→meeting→trial→customer / lost / not_relevant; owner; next step; activity log; lists with per-purpose consent; 'business' basis for role addresses (mfl. §15); templates as data; A/B; click map without query strings; web archive. Every new table RLS on, no policy, no client grant; nothing references employee/invitation/answer tables.
- `app.crm_companies` (37-67): id uuid PK; product_id NOT NULL default 'orgpuls'; org_number ^[0-9]{9}$; name NOT NULL 1..200; form_code ≤10; nace_code regex; nace_label ≤200; employees 0..1e6; municipality ≤80; municipality_no ^[0-9]{4}$; website ≤300; phone ≤40; source NOT NULL default 'manual' check (brreg,import,manual,signup); stage NOT NULL default 'new' check (new,contacted,engaged,meeting,trial,customer,lost,not_relevant); stage_changed_at NOT NULL default now(); owner_id uuid FK auth.users ON DELETE SET NULL; next_step ≤300; next_step_at date; lost_reason ≤300; tags text[] ≤20; org_id uuid UNIQUE FK organizations SET NULL; last_activity_at; created_at; updated_at. Indexes crm_companies_orgnr UNIQUE(product_id,org_number) where not null; crm_companies_stage. RLS on, revoked.
- `app.crm_activities` (69-84): id uuid PK; company_id NOT NULL FK crm_companies CASCADE; contact_id FK crm_contacts SET NULL; kind check (note,call,meeting,email,task,stage); body 1..4000; due_at date; done_at; admin_id FK auth.users SET NULL; admin_email; created_at. Indexes (company_id,created_at desc), crm_activities_open partial(due_at) where task & not done. RLS on, revoked. No product_id. (No append-only trigger here.)
- crm_contacts: add company_id FK crm_companies SET NULL + index (86-87); basis check now (consent,customer,business,none) (88-89); source check adds 'brreg' (90-92).
- `app.crm_role_address(email)` immutable (95-102): local-part whitelist (post, kontakt, info, salg, hr, ...).
- `app.crm_lists` (105-120): id uuid PK; product_id; key ^[a-z0-9-]{2,40}$; name_no/name_en 1..80; description_no/en ≤300 default ''; public bool default true; sort int; archived_at (soft-archive); created_at; UNIQUE(product_id,key). RLS on, revoked. Seeded 4 lists nyhetsbrev, produktnytt, arrangementer, tilbud (122-134).
- `app.crm_list_members` (136-148): list_id FK crm_lists CASCADE; contact_id FK crm_contacts CASCADE; status default 'pending' check (pending,subscribed,unsubscribed); source text NOT NULL 2..200; subscribed_at; unsubscribed_at; created_at; PK(list_id,contact_id). Index (contact_id). RLS on, revoked. Backfill from consented contacts (151-154).
- `app.crm_templates` (157-169): key text PK ^[a-z0-9-]{2,40}$; name; description; kind check (newsletter,campaign,promotion,announcement); style default 'branded' check (branded,letter); subject; preheader default ''; blocks jsonb NOT NULL; sort. RLS on, revoked. No product_id. 6 seeded templates (171-218): nyhetsbrev, produktnytt, arrangement, tilbud, onboarding, forste-kontakt.
- crm_campaigns add (221-235): list_id FK crm_lists SET NULL; template_key FK crm_templates(key) SET NULL; style; signature ≤200; subject_b ≤150; ab_percent 10..50 default 20; ab_metric (open,click); ab_wait_hours 1..48 default 4; ab_winner (a,b); ab_decided_at; publish_web bool; slug ^[a-z0-9-]{3,80}$; web_description ≤200. Unique index crm_campaigns_slug(product_id,slug) where slug not null.
- crm_sends: add variant (a,b) (237); status check adds 'held' (238-239).
- `app.crm_clicks` (241-250): send_id FK crm_sends CASCADE; url 1..600 no ?/#; content ^[a-z0-9_-]{0,60}$ default ''; clicks int default 1; first_at; PK(send_id,url,content). RLS on, revoked.
- app.crm_blocks_ok replaced with 10 block kinds (254-276). app.crm_mailable replaced adds 'business' basis gated by crm_role_address (281-291). `app.crm_on_list(c, p_list)` (293-300). crm_filter_ok adds stages, lists, bases (304-337). crm_segment_contacts replaced (341-365) also joins crm_companies; still reads app.rounds only.
- app.crm_sync replaced (370-416): also upserts crm_companies from app.organizations (source 'signup', stage customer/trial by app.org_access) and links contacts' company_id.
- Public: crm_newsletter_signup dropped/recreated with p_lists (420-472); crm_confirm replaced confirms pending list memberships (475-495); crm_unsubscribe dropped/recreated with p_scope (498-529); NEW public.crm_preferences(p_token) (532-555), public.crm_set_preferences(p_token,p_lists,p_all_off) (559-597), public.crm_public_lists() (600-606), public.crm_archive(p_limit) (609-618), public.crm_archive_item(p_slug) (620-628). All anon+authenticated (1415-1422).
- crm_mail_claim replaced (631-738): list or segment audience, A/B split ('held'), winner decision after wait, company name in job.
- record_crm_event dropped/recreated with p_link (741-786): writes crm_clicks; service_role only (1433-1434).
- app.crm_contact_json replaced (789-803); NEW app.crm_company_json (805-812); NEW app.crm_log(p_company,p_contact,p_kind,p_body,p_due) SECURITY DEFINER (814-824) — inserts crm_activities with admin_id=auth.uid(), admin_email; bumps last_activity_at. These helpers revoked from client roles (1409-1414).
- Admin RPCs (authenticated grant 1423-1432):
  - admin_crm_companies(p_q,p_stage,p_owner) (826-846) read; crm_sync; audit 'crm.companies'.
  - admin_crm_company(p_id) (848-874) read; audit 'crm.company'; returns owner candidates = active platform_admins with role super_admin/marketing.
  - admin_crm_company_save(p_id,p) (878-963) write; manual stages limited to (new,contacted,engaged,meeting,lost,not_relevant); 'stage_follows_plan' if org_id; owner must be active platform admin; crm_log 'stage'; audit 'crm.company_create'/'crm.company_update'.
  - admin_crm_company_import(p_rows,p_source) (968-1022) write; 1..2000 rows; register email → contact with 'business' basis only for role address & not ENK; audit 'crm.company_import'.
  - admin_crm_activity(p_company,p_contact,p_kind,p_body,p_due) (1024-1047) write; call/email/meeting moves 'new'→'contacted'; audit 'crm.activity_add'.
  - admin_crm_task_done(p_id) (1049-1062) write; toggles done_at; audit 'crm.task_done'.
  - admin_crm_tasks() (1065-1077) read; **NO audit**.
  - admin_crm_lists() (1080-1102) read; audit 'crm.lists'.
  - admin_crm_list_save(p_id,p) (1104-1140) write; audit 'crm.list_save'.
  - admin_crm_list_add(p_list,p_contacts,p_source) (1143-1167) write; only consented, active, non-suppressed contacts; audit 'crm.list_add' with reason=p_source.
  - admin_crm_templates() (1169-1178) read; **NO audit**.
  - admin_crm_campaign_save dropped/recreated (1181-1270) write; audit 'crm.campaign_save'.
  - app.crm_campaign_ready replaced (1274-1283); app.crm_campaign_stats replaced (1285-1301).
  - admin_crm_campaign dropped/recreated (1305-1352) read; audit 'crm.campaign'; variants, click map, 72h timeline, benchmark, web.
  - admin_crm_campaigns dropped/recreated (1354-1371) read; audit 'crm.campaigns'.
  - admin_crm_overview() (1374-1403) read; crm_sync; audit 'crm.overview'.

### 0057_crm_claim_basis.sql (115 lines)
- public.crm_mail_claim replaced (7-115): adds 'basis' to each job (98). Otherwise identical to 0056. Grants unchanged (create or replace keeps service_role grant).

### 0058_crm_admin_helpers.sql (122 lines)
- public.admin_crm_save_contact replaced (9-81): accepts company_id; audit 'crm.contact_create'/'crm.contact_update'.
- public.admin_crm_list_remove(p_list,p_contact,p_reason) (83-100): crm_can_write; reason ≥5; sets member unsubscribed; audit 'crm.list_remove'.
- public.admin_crm_known_orgnrs(p_orgnrs text[]) (102-112): crm_can_read; first 200 only; **NO audit**.
- Grants authenticated (114-122).

### 0059_attribution_server.sql (370 lines) (D-104, X-063)
- Header (1-29): attribution read server-side from web_events (ekomlov §3-15, no device storage); AI assistant channel; utm_term/utm_content; org_attribution.heard fixed list; A/B default clicks (Apple MPP).
- web_events add utm_term, utm_content (32-34). org_attribution add heard check in (search,ai,linkedin,colleague,bht,event,newsletter,other) (36-37). crm_campaigns.ab_metric default 'click' (39).
- app.web_channel replaced adds 'ai' (42-57). track_web_event replaced stores utm_term/content (60-91).
- NEW public.record_signup_source(p_ip,p_ua) (98-142) SECURITY DEFINER: daglig_leder of org created < 1h; first/last touch from web_events via visitor hash. authenticated (168-169). Old (jsonb,jsonb) overload kept, dropped in 0060.
- NEW public.record_signup_heard(p_heard) (146-166): daglig_leder org created < 1 day; upsert org_attribution.heard. authenticated (170-171).
- admin_web replaced adds 'heard' breakdown (174-279); audit 'web.view'.
- admin_crm_campaign_save replaced: ab_metric default 'click' (282-370); audit 'crm.campaign_save'.

### 0060_lifecycle.sql (256 lines) (D-105, X-063) — trial lifecycle mail + account health score
- Drops record_signup_source(jsonb,jsonb) (30).
- `app.lifecycle_settings` (33-41): singleton id bool PK default true check(id); enabled bool default true; started_at timestamptz default now(). RLS on, revoked. (Settings-style singleton.)
- `app.lifecycle_mail` (43-60): id uuid PK; org_id FK organizations CASCADE; user_id FK auth.users CASCADE; step check in (welcome,setup_help,first_sent,results_ready,trial_ending,trial_ended,read_only_soon); status default pending check (pending,sending,sent,failed,skipped); attempts; leased_until; created_at; sent_at; provider_id; last_error regex; UNIQUE(org_id,user_id,step). Indexes lifecycle_mail_due partial, lifecycle_mail_user. RLS on, revoked. No product_id.
- `app.org_unlocked(p_org)` SECURITY DEFINER (64-74): reads rounds + invitations (responded_at) + employees (group_id) — counts per group ≥ threshold. Revoked from clients (240).
- `app.lifecycle_due(p_org,p_step)` (77-97); `app.lifecycle_plan()` (100-123) SECURITY DEFINER; uses app.reserved_address.
- pg_cron 'orgpuls-lifecycle-plan' '*/15 * * * *' select app.lifecycle_plan() (125).
- public.lifecycle_mail_claim(p_batch) (129-162), public.lifecycle_mail_done(...) (164-175): service_role only (246-250).
- public.admin_org_lifecycle(p_org) (179-191): {super_admin,support}; audit 'lifecycle.view'.
- public.admin_account_health() (194-237): {super_admin,support,finance,marketing}; audit 'health.view'. Score = activation(5×10) + recency(25/10) + response rate (15/8) + size (10/5); 'qualified' trial flag. Reads organizations, billing, employees(exists), measurements, invitations (sent_at, responded_at counts), rounds, measures, memberships+auth.users last_sign_in_at. **No stored health_score table**—computed on read.

### 0061_seo.sql (198 lines) (D-106)
- `app.seo_search` (17-30): day date; page text check ^/[^\s]*$ ≤300; query ≤200; country ^[a-z]{3}$; device check (DESKTOP,MOBILE,TABLET); clicks, impressions int ≥0; position numeric(6,2); PK(day,page,query,country,device). Index seo_search_page. RLS on, revoked. No product_id.
- `app.seo_runs` (32-42): id bigint identity; at; kind check (gsc,indexnow); ok bool; count int; error regex. Index seo_runs_kind. RLS on, revoked.
- public.seo_search_upsert(p_rows) (45-60), public.seo_run_record(...) (62-68): service_role only (191-195).
- public.admin_seo(p_days) (71-170): {super_admin,marketing,analyst}; audit 'seo.view'.
- pg_cron 'orgpuls-seo' '23 3 * * *' net.http_post to orgpuls-seo edge function using vault secrets orgpuls_dispatch_url / orgpuls_dispatch_secret (175-185).

### 0062_trends_spend.sql (189 lines) (D-107)
- `app.kpi_daily` (16-29): day date PK; mrr, paying, trials, grace, read_only, signups, visitors, sessions int NOT NULL; captured_at. RLS on, revoked. No backfill (comment 6-9: avoid invented history).
- `app.marketing_spend` (31-44): id uuid PK; month date check = date_trunc month; channel check (paid,social,email,organic,referral,campaign,ai,direct,other); campaign 1..80; amount_nok 0..1e8; note ≤200; entered_by FK auth.users SET NULL; entered_at. Indexes month, entered_by. RLS on, revoked. No product_id.
- app.kpi_capture(p_day) SECURITY DEFINER (47-71); revoked (179). pg_cron 'orgpuls-kpi-capture' '55 21,22 * * *' (74); immediate capture (75).
- public.admin_trends(p_weeks) (78-102): any admin; audit 'trends.view'.
- public.admin_spend_add(...) (105-125): {super_admin,finance,marketing}; audit 'spend.add'.
- public.admin_spend_delete(p_id) (127-140): same roles; hard delete; audit 'spend.delete'.
- public.admin_acquisition(p_months) (144-176): {super_admin,finance,marketing,analyst}; audit 'acquisition.view'.

### 0063_acquisition_unknown.sql (37 lines)
- admin_acquisition replaced: missing attribution → 'unknown' not 'direct' (5-37). Same gate/audit.

### 0064_cancellation.sql (442 lines) (D-108) — cancellation + 30-day deletion
- billing add cancelled_at, cancelled_by (FK auth.users SET NULL), cancel_effective_at, deletion_due_at + check billing_cancel_whole (40-47); indexes (48-49).
- `app.deletion_log` (51-66): id bigint identity; org_id uuid NOT NULL (no FK); org_number; org_name NOT NULL; cancelled_at; cancel_effective_at; deletion_due_at; deleted_at default now(); run_by check (schedule,admin); admin_id FK auth.users SET NULL; counts jsonb NOT NULL. RLS on, revoked. (No append-only trigger.)
- app.org_access replaced (70-82): cancelled & past effective → read_only. public.org_access_state replaced (84-95).
- lifecycle_mail step check adds cancelled, deletion_soon (98-101); lifecycle_due/plan/claim replaced (104-207).
- app.measure_effect_round_ok fixed to only check on change (215-237) — FK maintenance lesson.
- `app.delete_organisation(p_org,p_run_by,p_admin)` SECURITY DEFINER (240-294): counts; deletes crm_contacts where org_id and basis<>'consent' (268); crm_companies → stage 'lost' (271-272); deletes tickets (275); deletes rounds then organization (278-279); deletes auth.mfa_factors/identities/users for org-only accounts not platform admins (282-288); inserts deletion_log. Revoked (431).
- app.deletion_run() (296-309); pg_cron 'orgpuls-deletion' '40 2 * * *' (311).
- public.admin_cancel_org(p_org,p_ends,p_reason) (315-345): {super_admin,support,finance}; audit 'org.cancel'.
- public.admin_cancel_withdraw (347-364): same; audit 'org.cancel_withdraw'.
- public.admin_delete_now(p_org,p_confirm,p_reason) (367-394): super_admin; must be cancelled; confirm by typing org number; audit 'org.delete_now' BEFORE delete.
- public.admin_org_cancellation(p_org) (396-408): {super_admin,support,finance}; **NO audit**.
- public.admin_deletions() (411-428): same roles; audit 'deletions.view'.
- Grants authenticated for admin fns (433-442).

### 0065_cancellation_oslo_days.sql (48 lines)
- billing_cancel_whole relaxed: deletion_due between effective and +31 days (10-14). admin_cancel_org replaced with Oslo-calendar dates (16-48); audit 'org.cancel'.

### 0066_customer_cancel.sql (117 lines) (D-110)
- billing add cancel_source check (admin,customer), cancel_reason check (price,not_needed,missing,switching,other) (19-21).
- Trigger billing_cancel_clear BEFORE INSERT OR UPDATE on billing (23-37).
- public.cancel_subscription(p_org,p_reason,p_confirm) (40-79): app.has_role(daglig_leder). public.withdraw_cancellation(p_org) (81-94). authenticated.
- admin_org_cancellation replaced adds source, reason (97-110); still no audit.

### 0093_crm_stages.sql (712 lines) (D-142, X-076) — stages as data, senders, follow-ups
- Header (1-30): what moves a company: stage_on_send (forward only), reply_stage on logged answer, a person (admin_crm_stage_move); never an open or click. Company with org follows plan. New tables RLS on, no policy, no grant.
- `app.crm_stages` (33-43): key text PK ^[a-z][a-z0-9_]{1,39}$; name 1..60; sort int NOT NULL; kind check (open,won,lost,parked); managed bool default false; archived_at; created_at. RLS on, revoked. No product_id. Seeded 9 (45-54): new 10, contacted 20, engaged 30, meeting 40, trial 50 (managed), customer 60 won (managed), nurture 70 parked, lost 80, not_relevant 90 (lost).
- crm_companies stage check dropped; FK crm_companies_stage_fk → crm_stages(key) ON UPDATE CASCADE (57-67) (ON DELETE default NO ACTION).
- `app.crm_senders` (70-80): id uuid PK; name 1..80; email regex; reply_to regex; signature ≤200 default ''; archived_at; created_at. RLS on, revoked. No product_id, no created_by.
- crm_campaigns add (83-90): stage_target FK crm_stages ON UPDATE CASCADE; stage_on_send FK crm_stages ON UPDATE CASCADE; sender_id FK crm_senders (NO ACTION); follows_id FK crm_campaigns (NO ACTION); follow_days 1..60; check follows_id/follow_days both or neither; check not self.
- crm_settings add reply_stage text NOT NULL default 'engaged' FK crm_stages ON UPDATE CASCADE (92-93).
- crm_activities kind check now (note,call,meeting,email,task,stage,reply) (95-105).
- `app.crm_advance(p_company,p_to,p_why)` SECURITY DEFINER (113-134): forward-only, not managed, not org-linked; crm_log 'stage'. Revoked.
- public.admin_crm_stage_move(p_ids uuid[], p_to) (140-180): crm_can_write; 1..500; audit 'crm.stage_move'.
- public.admin_crm_stages() (183-199): crm_can_read; **NO audit**.
- public.admin_crm_stage_save(p_key,p) (202-241): crm_can_write; audit 'crm.stage_create'/'crm.stage_update'.
- public.admin_crm_reply_stage(p_key) (244-259): crm_can_write; audit 'crm.reply_stage'. (Comment says super-admin or marketing.)
- public.admin_crm_senders() (261-275): crm_can_read; **NO audit**.
- public.admin_crm_sender_save(p_id,p) (281-312): crm_can_write; audit 'crm.sender_save'.
- public.admin_crm_campaign_pipeline(p_id,p) (320-374): crm_can_write; draft only; audit 'crm.campaign_pipeline'.
- app.crm_campaign_ready replaced (377-387). public.crm_mail_done replaced as plpgsql (390-416) — calls crm_advance on send (stage_on_send).
- app.crm_filter_ok replaced (now STABLE; stages from table) (419-453). admin_crm_company_save replaced (455-542) audit 'crm.company_create'/'crm.company_update'. admin_crm_activity replaced (544-572) adds 'reply' → crm_advance(reply_stage); audit 'crm.activity_add'.
- crm_mail_claim replaced (576-712): follow-up audience, stage_target audience, sender in job.

### 0094_demo_sandboxes.sql (786 lines) (D-143) — demo sandboxes; CRM demo leads; firewall-relevant copy plan
- Tables (25-91): app.demo_orgs (org_id PK FK organizations CASCADE; kind template/sandbox), app.demo_settings (singleton: enabled, reset_hours, idle_days, per_network_day, per_domain_day, per_day), app.demo_sandboxes (user_id PK FK auth.users CASCADE; org_id unique FK CASCADE; timestamps; resets), app.demo_requests (id identity; at; email; domain; network 32-hex visitor hash; consent bool; lang) + indexes, app.demo_id_map (build, old, new), app.demo_copy_plan (table_name PK; step; mode copy/skip; via; note; check). All RLS on, revoked from public/anon/authenticated (84-91).
- demo_copy_plan seed (93-164): **copies answer tables** for sandboxes: responses(50), answers(51), not_relevant_answers(52), extra_answers(53), module_answers(54), module_segment_answers(55), module_not_relevant_answers(56), org_count_answers(57), response_comments(58), comment_threads(59), thread_messages(60), contact_requests(61); invitations get new random token hash (118). Skips admin_audit, admin_org_notes, tickets, ticket_links, deletion_log, product_events, org_attribution, crm_companies, crm_contacts (150-158) as "the platform's own record". Comment: demo_invariants.sql fails when a new table is not in the plan (9-10).
- app.is_demo(p_org) (167-170); app.demo_copy_table (176-238) dynamic SQL copying any table by plan; app.demo_build (241-287); app.demo_drop (297-315); triggers organizations_demo_locked (320-333), demo_refuse on entry_codes/dpa_signatures/member_invites/billing (338-356), outbox_demo drop (360-370). All revoked from clients.
- admin_funnel/admin_trends/admin_acquisition replaced to exclude demos (375-475); same gates/audits ('funnel.view','trends.view','acquisition.view').
- app.crm_sync replaced excluding demo orgs/memberships (477-523).
- crm_contacts source check adds 'demo' (526-528).
- public.demo_request(p_email,p_ip,p_consent,p_lang) anon+authenticated (551-586); public.demo_pending/demo_enter/demo_reset/demo_leave/demo_state authenticated (596-738, 779-781). platform admins refused (601, 651).
- app.demo_lead(p_user) (609-633): inserts crm_contacts source 'demo', basis consent only if box ticked.
- app.demo_expire() (741-770); pg_cron 'orgpuls-demo-expire' '20 3 * * *' (772). demo_requests retained 30 days (767).
- Deletes template memberships (786).

### 0110_crm_managers.sql (125 lines) (X-091)
- crm_companies add manager_name (2..120), manager_role check (DAGL,INNH), manager_seen_at, check both-or-neither (21-25). Comment: name only, no birth date (26-27).
- admin_crm_company_import recreated with p_tag (33-122): crm_can_write; audit 'crm.company_import' with reason = tag and counts incl. managers. Old 2-arg overload dropped (125). Grant authenticated (123-124).

### 0111_crm_sequences.sql (439 lines) (X-091) — automatic follow-ups ("sequences"), daily cap
- crm_campaigns add follow_auto bool default false; follow_when default 'no_reply' check (no_reply,no_click,no_open); check follow_auto ⇒ follows_id (27-32).
- crm_settings add daily_cap int 1..5000 nullable (34-36).
- app.crm_business_hours(t) (39-44); app.crm_chain_depth(p_id) SECURITY DEFINER (47-56); app.crm_follow_audience(v_c) SECURITY DEFINER (62-82) — exits on unsubscribe, bounce, reply activity, won/lost/parked stage. (Grant revocations for these helpers not seen in this file.)
- app.crm_campaign_ready replaced (85-97).
- admin_crm_campaign_pipeline replaced (100-172): chain ≤7, loop check; audit 'crm.campaign_pipeline'.
- NEW public.admin_crm_campaign_resend(p_id,p_days) (175-205): crm_can_write; audit 'crm.campaign_resend'.
- NEW public.admin_crm_sequence(p_id) (208-245): crm_can_read; **NO audit**.
- NEW public.admin_crm_daily_cap(p_cap) (248-263): crm_can_write; audit 'crm.daily_cap'.
- NEW public.admin_crm_sending() (265-279): crm_can_read; **NO audit**.
- crm_mail_claim replaced (282-439): auto follow-ups in business hours; daily cap.
- NOTE: There is no separate "sequence" or "journey" table here; a sequence = chain of crm_campaigns via follows_id.

### 0112_crm_board_inbox.sql (165 lines) (X-091) — board exit criteria, inbound-lead inbox with SLA
- crm_stages add exit_criterion (1..200) + backfill (17-30).
- crm_settings add sla_minutes int NOT NULL default 5 check 1..1440 (32-34).
- admin_crm_stages replaced (37-53): crm_can_read; no audit. admin_crm_stage_save replaced (55-96) audit 'crm.stage_create'/'crm.stage_update'.
- NEW public.admin_crm_sla(p_minutes) (99-114): crm_can_write; audit 'crm.sla'.
- NEW public.admin_crm_inbox(p_days) (117-165): crm_can_read; crm_sync; audit 'crm.inbox'. Leads = crm_companies source 'signup' + crm_contacts source contact_form/demo; first-response from crm_activities. "never what they wrote" (15).

### 0113_crm_designed_mail.sql (158 lines) (X-092) — designed blocks, template library, placeholder guard
- app.crm_blocks_ok replaced: + hero, features, steps, stats, cta; 'image' key (19-51).
- NEW app.crm_placeholder_left(c) (54-60): `[...]` in subject/preheader/blocks blocks scheduling. app.crm_campaign_ready adds 'placeholder_left' (62-75). (Ties to "never fabricate data" rule.)
- crm_templates add category NOT NULL default 'newsletter' check (newsletter,product,event,sales,customer) (78-81); CHECK crm_templates_blocks_ok (82).
- Templates updated (85-131) and 4 new inserted (133-158): oppfolging, lovkrav, kundehistorie, gjenaktivering. → 10 templates total.

### 0114_cms.sql (679 lines) (X-094) — template-based CMS for public site (marketing admin)
(Read 1-340 in full; 340-679 read at function-signature/gate/audit level plus 576-679 in full.)
- Validators (immutable): app.cms_block_ok (27-59), app.cms_content_ok (61-84), app.cms_placeholder_left (88-96), app.cms_content_ready (100-111), app.cms_reserved(kind,slug) (118-138).
- Gates: `app.cms_can_write()` = is_platform_admin({super_admin,marketing}) (140-142); `app.cms_can_read()` = is_platform_admin({super_admin,marketing,analyst,support}) (143-145).
- Tables (all RLS on + revoked from public/anon/authenticated, 242-249; no policies):
  - app.cms_templates (148-158): key PK; name; description; kind (page,article); layout (landing,splash,document,article); shot; content_no/content_en jsonb checked; sort. 6 seeded (659-679).
  - app.cms_pages (160-174): id uuid PK; kind; slug; template FK cms_templates; focus_keyword; noindex; shot; **created_by** FK auth.users SET NULL; created_at; updated_at; **archived_at** (soft archive); unique(kind,slug); check not reserved.
  - app.cms_page_locales (176-191): (page_id FK CASCADE, locale) PK; draft; live/live_at; pending/pending_at; translation (source,draft,reviewed); updated_at; **updated_by** FK auth.users SET NULL.
  - app.cms_revisions (193-202): id identity; page_id FK CASCADE; locale; action (save,publish,schedule,unpublish,restore); content; at; by FK auth.users SET NULL. Append-only trigger cms_revisions_frozen (205-221) — "nobody may change" pattern (delete allowed only if page gone).
  - app.cms_redirects (223-232): from_path PK; to_path; permanent; hits; last_hit_at; created_by; created_at.
  - app.cms_previews (234-240): token_hash PK; page_id FK CASCADE; expires_at; created_by; created_at.
  - None carry product_id.
- Public reads (anon+authenticated): public.cms_page (261-275), public.cms_list (278-291), public.cms_redirect (294-309, volatile, counts hits), public.cms_preview (312-325).
- Admin RPCs (authenticated, 631-641): admin_cms_templates (341), admin_cms_pages (349), admin_cms_page (358), admin_cms_traffic (374) — read, cms_can_read, **no audit**; admin_cms_create (395, audit 'cms.create'), admin_cms_save (429, 'cms.save'), admin_cms_translate (479, 'cms.translate'), admin_cms_publish (498, 'cms.publish'/'cms.schedule'), admin_cms_unpublish (526, 'cms.unpublish'), admin_cms_restore (544, 'cms.restore'), admin_cms_archive (559, 'cms.archive'/'cms.unarchive') — cms_can_write; admin_cms_preview_token (576-587) cms_can_read, writes cms_previews, **no audit**; admin_cms_redirects (589) read no audit; admin_cms_redirect_save (599, 'cms.redirect'), admin_cms_redirect_delete (619, 'cms.redirect_delete').
- Helpers revoked from clients (642-645).

### 0115_crm_follow_due.sql (177 lines)
- NEW app.crm_follow_done(c) SECURITY DEFINER (11-19); revoked (20).
- crm_mail_claim replaced (22-176) using crm_follow_done.

### 0116_admin_attention.sql (50 lines) (X-095)
- public.admin_attention() STABLE SECURITY DEFINER (13-47): any admin role; per-role sections (trials all; deletions super_admin/support/finance; tickets & failures super_admin/support; tasks if app.crm_can_read()). **NO audit** (and declared STABLE so admin_log could not run anyway). authenticated (49-50).

### 0117_crm_sync_email_change.sql (68 lines)
- app.crm_sync replaced (10-68): moves an account's contact to its new e-mail; releases user_id if new address already exists.

### 0118_account_owner.sql (126 lines) (X-095)
- `app.account_owners` (14-22): org_id uuid PK FK organizations CASCADE; user_id uuid NOT NULL FK app.platform_admins(user_id) ON DELETE CASCADE; set_by uuid (no FK); set_at timestamptz default now(). RLS on, revoked. Index account_owners_user. No product_id.
- public.admin_set_account_owner(p_org,p_owner) (24-50): {super_admin,support}; owner must be active platform admin; audit 'org.owner' detail {owner email}.
- public.admin_org_owner(p_org) STABLE (52-68): super_admin/support/finance; **NO audit**.
- admin_org_list replaced (70-117): adds cancelled_at, cancel_effective_at, owner, contact_name, demo; audit 'orgs.list'.
- demo_copy_plan: account_owners skip (125-126).

### 0119_crm_deal_value.sql (132 lines) (X-095 phase 4) — deal value
- crm_companies add value_nok integer check 0..1e8 (9). "estimate the team enters, never an invoice" (5). (A "deal" = a crm_companies row; there is no separate deals table.)
- app.crm_company_json replaced adds contact_name (11-21).
- admin_crm_company_save replaced adds value_nok (23-116); audit 'crm.company_create'/'crm.company_update'.
- NEW public.admin_crm_owners() STABLE (119-132): crm_can_read; owner candidates = active super_admin/marketing; **NO audit**.

### 0120_crm_journeys.sql (160 lines) (X-095 CRM II) — journeys as read-model only
- "adds no engine and stores nothing" (7). public.admin_crm_journeys() STABLE (19-74): crm_can_read; **NO audit**; recursive over crm_campaigns follows_id.
- public.admin_crm_task_list(p_view) STABLE (80-109): crm_can_read; **NO audit**.
- admin_account_health replaced adds demo flag (114-160); {super_admin,support,finance,marketing}; audit 'health.view' (note: function is VOLATILE here – no STABLE keyword – so the audit insert works).

### 0121_web_report.sql (165 lines) (X-095 phase 6)
- web_events add device check (desktop,mobile,tablet) (23). app.web_device(ua) immutable (25-34), revoked (165).
- track_web_event replaced with device (37-68).
- public.admin_web_report(p_days) STABLE (71-161): any admin role; **NO audit** (STABLE). Reads web_events, organizations, org_attribution, billing, demo_requests, crm_list_members, tickets (contact_form counts). authenticated.

### 0101_translations_admin.sql (grep-level + lines 1-60 read) — platform_settings origin
- `app.platform_settings` (23-35): singleton id bool PK default true check(id); auto_approve bool NOT NULL default false; auto_approve_by FK auth.users SET NULL; auto_approve_at. Index (29). Seed (30). RLS on, revoked (31-32). Comment (33-34).
- app.auto_approve_on() (36-40). Translation-admin RPCs gated super_admin (130-147, 152-217, 220-240, 246-292, 308-335, 339-375, 394+); admin_auto_approve read gated {super_admin,support} (295-306). Audits 'translations.override_import', 'translations.override_approve', 'legal.approve', 'legal.withdraw', 'settings.auto_approve', 'legal.auto_approve'.

### 0123_content.sql (77 lines) (X-095 phase 7)
- admin_cms_pages replaced with author (12-23) — cms_can_read; no audit.
- platform_settings add notice_on bool default false, notice_no ≤300, notice_en ≤300, notice_by FK auth.users SET NULL, notice_at (26-32).
- public.admin_site_notice() STABLE (34-44): cms_can_read; no audit.
- public.admin_site_notice_set(p_on,p_no,p_en) (46-66): cms_can_write; audit 'site.notice_on'/'site.notice_off'.
- public.site_notice(p_locale) anon+authenticated (70-77).

### 0125_editor_role.sql (6 lines) (D-170)
- `alter type app.platform_role add value 'editor'` (6). Comment: copywriter/translator; site pages, media, redirects, notice, SEO; no customer data.

### 0126_admin.sql (196 lines) (X-095 phase 10; D-170)
- cms_can_write = {super_admin,marketing,editor} (15-17); cms_can_read = {super_admin,marketing,analyst,support,editor} (18-20).
- admin_seo replaced admits editor (23-122); audit 'seo.view'.
- Dynamic rewrite (125-146): refuses 'editor' in admin_org_detail, admin_audit_list, admin_kpis, admin_funnel, admin_trends, admin_web, admin_web_report, admin_attention by string-replacing their gates via pg_get_functiondef; raises if gate text not found.
- platform_settings add allow_indexing bool default true, indexing_by FK auth.users SET NULL, indexing_at (149-153).
- public.admin_site_indexing_set(p_on) (155-168): super_admin; audit 'site.indexing_on'/'site.indexing_off'.
- public.site_indexing() anon+authenticated (171-175).
- public.admin_site_settings() STABLE (178-196): super_admin; no audit; returns allow_indexing, auto_approve, notice_on, admins count, admins_without_factor (active admins without verified MFA factor).
- **GAP**: public.admin_set_admin (last defined 0055:1059-1090) validates p_role in ('super_admin','support','finance','analyst','marketing') — 'editor' cannot be granted through the RPC (no later redefinition found by grep).

### 0124_media.sql (229 lines; read 1-80, 112-170; rest grep-level) (D-169)
- Media kept in DB, NOT Supabase Storage (3-6). `app.cms_media` (21-38): id uuid PK; key unique 32-hex (sha256 of bytes); name 1..120; mime check (png,jpeg,webp); content bytea 1..2MB; width/height 1..4000; alt_no/alt_en ≤300; created_by FK auth.users SET NULL; created_at. RLS on, revoked. Index created_by.
- app.cms_media_pages (41-53) revoked. public.admin_media() STABLE cms_can_read no audit (56-67); admin_media_add (70, cms_can_write, audit 'media.add' 107); admin_media_describe (112, audit 'media.describe' 124); admin_media_delete (128, audit 'media.delete' 139). Grants authenticated (143-150). public.cms_media_file(p_key) anon+authenticated (154-163).
- **No `storage.buckets` / `storage.objects` reference exists in any migration** (grep over supabase/migrations).

### 0122_simple_modules_legal.sql (grep-level)
- public.admin_module_sync (141-156) super_admin; audit 'module.sync'. public.admin_modules (159-) gated {super_admin,support,finance,analyst,marketing}. public.admin_legal_reviews (221-235) super_admin; public.admin_legal_review (238-257) super_admin, audit 'legal.review'.

### 0134_notice_recipients.sql (grep-level)
- public.admin_notice_recipients(p_org) (175-) {super_admin,support}; masked addresses ("ki…@firma.no") (12, 45). public.admin_ticket_mail(p_id) (201-) {super_admin,support}. authenticated (227-230).

### 0109_override_basis.sql (grep-level)
- admin_message_overrides / admin_message_overrides_import replaced, super_admin; audit 'translations.override_import' (33-123).

### 0145_brreg_settings_where.sql (99 lines; grep-level lines cited)
- Fixes UPDATE-without-WHERE (safeupdate) in one-row settings tables: admin_brreg_set_dry_run (38-62) crm_can_write, audit 'crm.brreg_dry_run'; admin_crm_settings (65-81) super_admin, `where id`, audit 'crm.settings'; admin_crm_reply_stage (83-98) crm_can_write, audit 'crm.reply_stage'.

### 0146_demo_signup.sql (grep-level)
- demo_requests gains name, company, role (8, 30-34); app.demo_lead replaced carries them into crm_contacts (106-115).

### 0135_ticketing_p2.sql (596 lines; 1-200 read in full, rest at signature/gate/audit level)
- ticket_mail add csat bool default false (28).
- `app.ticket_csat` (30-46): id uuid PK; ticket_id FK tickets CASCADE; mail_id unique FK ticket_mail CASCADE; token_hash bytea unique; created_at; expires_at; rating 1..5; comment 1..2000; rated_at; checks. RLS on, revoked. Trigger ticket_csat_fixed (50-65): rating immutable once given.
- `app.csat_misses` (68-74): id identity; at. RLS on, revoked. app.csat_limited (76-78), app.csat_miss (80-85).
- public.csat_open (88-107), public.csat_submit (110-138) anon+authenticated (581-584).
- `app.ticket_mentions` (141-155): id uuid PK; ticket_id FK CASCADE; message_id FK ticket_messages CASCADE; admin_id FK app.platform_admins(user_id) CASCADE; by_id FK auth.users SET NULL; created_at; seen_at; unique(message_id,admin_id). RLS on, revoked.
- app.ticket_mentions_unseen (158-160); app.ticket_mention (165-180).
- Admin RPCs, all {super_admin,support}: admin_ticket_mentions (182-, audit 'tickets.mentions'), admin_ticket_mentions_seen (204, 'ticket.mentions_seen'), admin_canned_replies (225, 'tickets.canned'), admin_canned_reply_save (241, 'ticket.canned_create'/'ticket.canned_update'), admin_canned_reply_active (273, 'ticket.canned_restore'/'ticket.canned_archive'), admin_ticket_report (301, 'tickets.report'); replaced admin_tickets (363, 'tickets.list'), admin_ticket (407, 'ticket.view'), admin_ticket_reply (460, 'ticket.note'/'ticket.reply'); ticket_mail_claim replaced (509); app.cms_reserved replaced adding 'vurdering' (552).
- Header: "Nothing here references a response-level table" (24-25).

### 0136_retention.sql (238 lines) (D-176)
- deletion_log add tables jsonb NOT NULL default '{}' (32-34).
- app.org_departing_accounts(p_org) (39-47): excludes platform admins.
- app.org_row_counts(p_org) (55-120): catalog-driven count of every table with org_id + cascade descendants; excludes deletion_log, admin_audit, crm_companies (71); crm_contacts counted only basis<>'consent' (76-78); counts auth.audit_log_entries (113-118).
- app.audit_entry_of(payload, users) (124-131).
- app.delete_organisation replaced (134-197): refuses without cancellation; schedule only when due (151-157); deletes auth.audit_log_entries for departing accounts (188).
- app.deletion_preview() (202-213). admin_deletions replaced (215-229) {super_admin,support,finance}; audit 'deletions.view'.
- Platform records retained after org deletion: deletion_log, admin_audit (with org id+name), crm_companies (marked lost) (28-29).
- All helpers revoked (232-238).

### 0137_crm_win_rate_steps.sql (716 lines; 1-370 read in full; 370-716 signature/gate/audit level) (X-091, D-159)
- crm_settings add stage_history_since timestamptz NOT NULL default now() (32-34).
- `app.crm_stage_changes` (36-52): id bigint identity PK; company_id FK crm_companies CASCADE; from_stage; from_kind check; to_stage NOT NULL; to_kind check; changed_at default now(); check from_stage/from_kind both-or-neither. Indexes crm_stage_changes_closing partial, crm_stage_changes_company. RLS on, revoked. Not backfilled (15-19).
- Trigger crm_stage_record AFTER INSERT OR UPDATE OF stage ON crm_companies → app.crm_stage_record() (54-70).
- Append-only trigger crm_stage_changes_guard BEFORE UPDATE OR DELETE (75-89): no update; delete only when company gone (CLAUDE.md pattern).
- public.admin_crm_pipeline_summary(p_from) STABLE (98-131): crm_can_read; **NO audit**. No weighted pipeline/probabilities (20).
- crm_campaigns add step_kind default 'mail' check (mail,call,linkedin) + check non-mail ⇒ follows_id & follow_auto (134-138).
- crm_activities add campaign_id FK crm_campaigns SET NULL; skipped bool default false; check skipped ⇒ task & done (140-145); unique index crm_activities_step_once(campaign_id,contact_id) where campaign_id not null (146).
- app.crm_chain_root (149-159); app.crm_follow_audience replaced (167-197); app.crm_follow_done replaced (203-213); app.crm_step_tasks() (216-244) — creates tasks assigned to company owner (admin_id = co.owner_id), called from crm_mail_claim (634).
- app.crm_campaign_ready replaced (247-265).
- NEW public.admin_crm_step_save(p_id,p) (268-327): crm_can_write; audit 'crm.step_create'/'crm.step_save'.
- admin_crm_campaign_resend replaced (330-361) refuses non-mail; audit 'crm.campaign_resend'.
- admin_crm_task_done replaced (364-379) audit 'crm.task_done'; NEW admin_crm_task_skip (381-397) crm_can_write audit 'crm.task_skip'; admin_crm_task_list replaced (400) no audit; admin_crm_sequence replaced (433) no audit; admin_crm_journeys replaced (475) no audit; admin_crm_campaigns replaced (538) audit 'crm.campaigns'; crm_mail_claim replaced (560-716).

### 0141_growth_foundations.sql (1709 lines; 1-1318 and 1385-1709 read in full; 1318-1385 = remainder of crm_unsubscribe + record_crm_event re-creations, signature level) (D-182)
Header (1-47): events org-level, written only by product triggers + hourly tick; nothing attached to responses/answers/extra_answers/response_comments; bands; hour_only; demo emits nothing; cascade with org/account; backfill. Firewall computed live. Consent ledger append-only via deferred triggers. Health score v1 (NPS no source → max reachable 90).
**Events**
- Enum app.growth_pii ('none','org','user') (50).
- app.growth_prop_forbidden(p) (54-61): forbids names matching respondent|token|response|invitation|answer|employee|email|phone|comment|address|name|id(s)|count(s)|number|total unless *_band. app.growth_props_ok (63-69).
- `app.event_catalogue` (71-92): name text PK check ^[a-z_]+\.[a-z_]+$ ≤60 (naming convention `<object>.<past_tense_verb>`); version int default 1; event_group check (signup,setup,survey,value,trial,billing,support,consent,lead); sort int unique >0; pii_level app.growth_pii NOT NULL; hour_only bool default false; allowed_props text[] default '{}'; source 3..200; description 3..300; created_at; check props_ok; check pii 'none' ⇒ hour_only. RLS on, revoked.
- Seeded 21 events (94-115): user.signed_up(user), org.created, org.brreg_verified, employees.imported(hour_only), survey.created, survey.scheduled, survey.sent, survey.threshold_reached(hour_only), results.viewed(user), action_item.created, stakeholder.invited, trial.extended, trial.expiring, trial.expired, subscription.started, subscription.tier_changed, subscription.cancelled, ticket.created, consent.granted(none), consent.withdrawn(none), lead.hand_raised(none).
- `app.growth_events` (126-143): id uuid PK default gen_random_uuid(); name text NOT NULL FK event_catalogue; occurred_at timestamptz NOT NULL (only time; no created_at, no sequence — 118-125); org_id FK organizations ON DELETE CASCADE; user_id FK auth.users ON DELETE CASCADE; props jsonb NOT NULL default '{}' object; source check (trigger,tick,backfill); dedupe_key ^[0-9a-z:._+-]{1,120}$. Indexes growth_events_once UNIQUE(name,dedupe_key) where not null; growth_events_name_at; growth_events_org partial; growth_events_user partial. RLS on, revoked. demo_copy_plan skip (146-147).
- Trigger growth_event_check BEFORE INSERT (154-198): props allowed by catalogue; values short keyword, not uuid, not bare number; bands from fixed vocab; user only for pii 'user'; no org for pii 'none'; no key for 'none'; hour_only truncated.
- Trigger growth_event_guard BEFORE UPDATE (208-229): immutable; org_id/user_id may only go null after parent gone. (No delete guard: deletes via cascade/retention allowed.)
- app.growth_count_band (232-238: under_5,5_9,10_24,25_49,50_99,100_249,250_plus), app.growth_rate_band (240-247), app.growth_band_ok (251-257).
- app.growth_emit(p_name,p_at,p_org,p_user,p_props,p_source,p_key) SECURITY DEFINER (260-272): the one write path; demo orgs skipped; on conflict do nothing.
- Trigger growth_forget_demo AFTER INSERT ON app.demo_orgs (276-285).
- Product triggers (all SECURITY DEFINER, revoked): growth_org_created/growth_org_verified on organizations (291-307); growth_user_signed_up on memberships (310-322); growth_employees_imported statement-level on employees (327-340, band, hour truncated); growth_survey_created on measurements (342-352); growth_survey_scheduled on rounds (355-369); growth_action_item on measures (371-381); growth_stakeholder_invited on member_invites (383-393); growth_billing on billing (399-423); growth_ticket_created on tickets (432-448: in_app → ticket.created; contact_form+sales → lead.hand_raised); growth_results_viewed on product_events (450-462); growth_demo_request on demo_requests (464-474).
- app.growth_tick() (484-546): survey.sent from invitations count; survey.threshold_reached from count(app.responses) vs greatest(k_min, org threshold) (508-522) — **reads app.responses (count only)**; trial.expiring/expired. Exceptions caught, SQLSTATE only.
- pg_cron 'orgpuls-wheel' '0 * * * *' re-scheduled to run app.wheel_tick(); app.growth_tick() (549).
- Backfill (552-663) incl. survey.threshold_reached from app.responses.submitted_hour (592-604) and trial.extended from admin_audit (625-629).
**Consent ledger**
- `app.consent_purposes` (668-681): key text PK check ^(marketing|list:[a-z0-9-]{2,40})$; list_id unique FK crm_lists SET NULL; created_at; check. RLS on, revoked. Seeded 'marketing' + one per list. Trigger consent_purpose_for_list AFTER INSERT ON crm_lists (683-695).
- `app.consent_records` (697-718): id bigint identity PK; contact_id NOT NULL FK crm_contacts ON DELETE CASCADE; purpose NOT NULL FK consent_purposes(key); status check (granted,withdrawn,lapsed,not_given,notice_given); lawful_basis check (consent,existing_customer_15_3,legit_interest_phone,business_address); method check (migrated,double_opt_in,one_click_unsubscribe,preference_centre,provider_complaint,provider_bounce,provider_unsubscribe,admin,import,account_sync,demo_request,system); doi_sent_at; doi_confirmed_at; created_at; created_by FK auth.users SET NULL; checks. Indexes consent_records_latest, consent_records_created_by. RLS on, revoked.
- Append-only trigger consent_records_guard BEFORE UPDATE OR DELETE (723-745): only created_by→null after account gone; delete only when contact gone.
- app.consent_basis (747-753), app.consent_derive (760-801), app.consent_latest (803-808), app.consent_sync (815-853): method from GUC `app.consent_via`, else 'admin' if app.admin_role() not null else 'system'.
- Deferred constraint triggers: consent_on_contact AFTER INSERT OR UPDATE OF basis,status,email ON crm_contacts (855-866); consent_on_member on crm_list_members (868-877); consent_on_suppression on crm_suppression (881-894). Index crm_contacts_email_hash on app.crm_hash(email) (880).
- Trigger consent_event AFTER INSERT ON consent_records → growth events consent.granted/withdrawn (899-916).
- Backfill 'migrated' records (923-954).
- Re-created to set app.consent_via: admin_crm_company_import ('import', 961-1055), admin_crm_import ('import', 1057-1127), app.crm_sync ('account_sync', 1129-1192), app.demo_lead ('demo_request', 1194-1223), crm_confirm ('double_opt_in', 1225-1250), crm_set_preferences ('preference_centre', 1252-1295), crm_unsubscribe ('one_click_unsubscribe', 1297-), record_crm_event (provider_*, 1334-1349).
**Firewall** app.growth_firewall() STABLE SECURITY DEFINER (1393-1545), returns (seq, rule, pass, evidence). v_resp list (1398-1400): responses, answers, extra_answers, response_comments, invitations, employees, module_answers, module_segment_answers, module_not_relevant_answers, not_relevant_answers, org_question_answers, org_count_answers, comment_threads, thread_messages, contact_requests. v_answer (1401-1403). v_guards (1407-1409). v_platform roles (1413). Scope regex '^(crm_|growth_|consent_|event_)|_events$' (1415). Rules: 1 no_link_to_respondents (FKs either direction, 1425-1439); 2 catalogue_has_no_respondent_props (1441-1447); 3 no_role_reads_answers (privileges incl. column grants, 1449-1463); 4 no_employee_is_a_contact (1465-1473); 5 no_event_names_a_respondent (1475-1490); 6 nothing_attached_to_answers (triggers/rules/policies/constraints/defaults/indexes calling non-catalog fns on submit_response write set, 1492-1529); 7 growth_tables_closed (event_catalogue, growth_events, consent_records, consent_purposes: RLS on, no policy, no grant to anon/authenticated/service_role, 1531-1543).
**Health score** app.health_parts() (1561-1567: survey_cycle 30, action_items 25, logins 15, response_rate 15, nps 10 unsourced, p1_tickets 5); app.health_score(p_org) STABLE (1569-1663) — computed, not stored; **counts app.responses for last closed round** (1632), withholds below k_min invitations (1634).
- public.admin_growth_events() (1670-1709): {super_admin,analyst,marketing}; audit 'growth.events_view'; returns catalogue with n7, parts, 10 lowest health scores, firewall rules.

### 0142_growth_registry.sql (1006 lines; 1-442, 556-572, 710-960 read in full; seeds 443-709 and 960-1006 at structure level) (D-183)
- Header (1-31): report content as data; status derived where derivable ("live" never stored); every write audited; closed to clients.
- `app.growth_settings` (34-39): singleton id bool PK check(id); plan_start date (Monday) nullable.
- app.growth_live(p_check) (42-51), app.growth_impl_live(p_kind,p_ref) (54-82; reads cron.job) — revoked (83-84).
- Registry tables (no product_id, no audit columns, no owner except growth_items.owner):
  - app.growth_tiers (87-92): key PK; sort unique; name; why.
  - app.growth_items (94-121): key PK; tier FK growth_tiers; sort; rank_label; name; why; build; kpi; guardrail; effort; impact; score; status check (building,planned,deferred); live_check check ('consent_ledger'); href ^/admin...; **owner uuid FK app.platform_admins(user_id) ON DELETE SET NULL**; unique(tier,sort). Index growth_items_owner.
  - app.growth_plan_blocks (124-131), app.growth_plan_gates (133-143: measure check (consent_coverage,doi_subscribers,trials_30d), target).
  - app.growth_rules (228-240): key ^R[0-9]{1,2}$; sort; name; trigger_desc; condition_desc; action_desc; stream check (service,marketing,internal,system,service_internal); impl_kind check (none,function,trigger,cron,lifecycle); impl_ref. Seeded R1-R12 (558-572): only R1 (lifecycle setup_help), R5 (cron orgpuls-wheel), R9 (function public.record_crm_event) implemented.
  - app.growth_experiments (242-251): status (queued,running,done).
  - app.growth_guardrails (254-258), app.growth_risks (260-265), app.growth_decisions (267-277: decided_value/by/at).
  - app.growth_funnel_stages (280-292) + trigger growth_funnel_events_known (294-305, NOT security definer); app.growth_lead_sources (307-317); app.growth_assumptions (319-322); app.growth_benchmarks (324-329); app.growth_coverage (409-415); app.growth_recommendations (417-422); app.growth_cuts (424-427).
- RLS on + `revoke all ... from public, anon, authenticated, service_role` for all 17 registry tables (429-440). No policies.
- Helpers: app.growth_trials (147-153), app.growth_gate_value (160-185: reads consent_records, crm_contacts), app.growth_gate_state (188-194), app.growth_plan_status (200-214), app.growth_plan_week (218-225), app.growth_funnel_count (332-395: reads web_events, growth_events, and **app.employees (created_at, row_number) for 'setup'** 349-357), app.growth_lead_now (399-406). All revoked.
- Gate `app.growth_admin()` = is_platform_admin({super_admin,analyst,marketing}) (712-717). app.growth_owner_ok (720-727: active, product_id='orgpuls', role in growth roles). app.growth_item_json (730-739), app.growth_plan_json (742-752).
- public.admin_growth_view(p_view) (754-824): growth_admin; views board/plan/funnel/rules/experiments/risks/coverage; audit 'growth.<view>_view'.
- public.admin_growth_export(p_kind) (827-861): growth_admin; audit 'growth.export'.
- public.admin_growth_set_item(p_key,p_status,p_owner) (866-897): audit 'growth.item_update' with from/to.
- public.admin_growth_set_experiment (900-925): audit 'growth.experiment_update'.
- public.admin_growth_decide(p_n,p_value,p_by) (929-957): audit 'growth.decide'.
- admin_growth_events replaced (962-1006): {super_admin,analyst,marketing}; audit 'growth.events_view'.
- Coverage seed row 22 claims firewall "separate schema" (680) — but tables live in schema `app` alongside answer tables (drift: "separate schema" wording vs reality). Risk seed (593) also says "Separate schema".

### 0143_growth_crm.sql (1732 lines; 1-420, 487-500, 734-912, 1006-1050, 1132-1162, 1407-1434, 1544-1600, 1690-1732 read in full; the rest at signature/gate/audit level) (D-184)
Header (1-43): task SLA; lead scoring fit×intent (only hand-raise sourced for intent); partners + referral code; phone-notice consent; Brønnøysund triggers engine (dry run default, generic e-mail only, ENK never stored, 10% holdout, DNC list); every table RLS on/no policy/no grant; every admin write audited.
- app.business_minutes (48-83).
- crm_activities add origin check (rule,trigger), rule ^R[0-9]{1,2}$, task_kind check (call,email,letter), sla_due_at; checks crm_activities_auto (auto tasks must be kind task + body ^auto:...) and crm_activities_sla (85-94). Index crm_activities_rule.
- `app.brreg_settings` (98-108): singleton; dry_run bool default true; feed_cursor; roles_cursor. RLS on, revoked. (Who switched = audit log 'crm.brreg_dry_run'.)
- `app.brreg_polls` (110-125): id identity; source (cron,manual); requested_by FK auth.users SET NULL; requested_at; started_at; finished_at; status (requested,running,done,failed); changes; error. RLS on, revoked.
- app.brreg_generic_email(email) (130-141): role-address whitelist.
- `app.brreg_entities` (143-160): org_number PK; name; form_code (≠ 'ENK'); nace_code; employees; municipality; address; phone; generic_email (CHECK generic); active NOT NULL; manager_changed_on. RLS on, revoked.
- `app.brreg_triggers` (162-175): id uuid; org_number FK brreg_entities CASCADE; kind (threshold_5,threshold_30,company_new,manager_changed); poll_id FK brreg_polls SET NULL; raised_at; employees_from/to; fit 0..50. RLS on, revoked.
- `app.brreg_dnc` (178-185): org_number PK; reason (objected,manual); created_at; created_by FK auth.users SET NULL. RLS on, revoked. (do-not-contact list)
- `app.brreg_purges` (188-193): id identity; purged_at. RLS on, revoked.
- `app.brreg_outreach` (195-233): id uuid; trigger_id unique FK brreg_triggers CASCADE; org_number FK brreg_entities CASCADE; channel (phone,letter,email); status (queued,assigned,sent,holdout,do_not_contact); email (generic, email channel only); manager_name (phone/letter only); company_id FK crm_companies SET NULL; activity_id FK crm_activities SET NULL; created_at; assigned_at; sent_at; checks. Trigger brreg_outreach_orphaned (217-228, FK-maintenance aware). RLS on, revoked.
- app.brreg_rules() immutable (245-251): thresholds [5,30], target NACE ranges, fit_min 30, size [5,100], crossed_days 90, manager_days 180, holdout_pct 10. app.lead_rules() (255-260): founder_min 60. app.fit_target_nace (262-270), app.fit_score (273-288).
- app.brreg_holdout (293-298), app.next_workday (301-311), app.brreg_assign (318-355: creates crm_companies source 'brreg' + crm_activities task R11), app.brreg_raise (361-406).
- Triggers on crm_activities: brreg_outreach_done AFTER UPDATE OF done_at (410-424), brreg_task_stopped BEFORE UPDATE OF done_at (443-453); brreg_suppression_reroute AFTER INSERT OR UPDATE OF email_hash ON crm_suppression (460-480).
- app.brreg_purge_org (487-497) deletes entity and brreg-sourced company.
- Service-role RPCs (1547-1556): brreg_poll_begin (500), brreg_ingest (524), brreg_role_candidates (584), brreg_roles_ingest (594), brreg_outreach_names_needed (622), brreg_outreach_names (631), brreg_purge (651), brreg_poll_end (662).
- app.brreg_request (685), app.brreg_requeue_sweep (711), app.brreg_cron (734-748). pg_cron 'orgpuls-brreg-triggers' '10 3 * * *' (750).
- Lead scoring: app.intent_score (755-764: tool, pdf, pricing, industry_twice, webinar unsourced; hand_raise sourced), app.lead_score(p_contact) (766-822: reads crm_contacts, crm_companies, brreg_entities, brreg_triggers, demo_requests, tickets, growth_events, organizations), app.lead_contacts (825-834), app.lead_route() (837-885: creates rule tasks R10/R2, respects DNC + phone_outreach withdrawal). pg_cron 'orgpuls-lead-route' '*/5 * * * *' (887). **No stored lead score table** (computed).
- `app.partners` (890-910): id uuid; name 2..200; org_number; kind (accounting,bht,hms,bransje); contact_name; referral_code unique ^[A-Z0-9]{2,20}$; share_kind; share_pct 1..50; status default 'in_talks' (in_talks,kit_sent,pilot_signed,member_offer_drafted,phase_2); created_at; **created_by** FK auth.users SET NULL; updated_at. Unique partners_org_number partial. RLS on, revoked. No product_id.
- web_events add ref_code (912); org_attribution add partner_id FK partners SET NULL + index (913-914). track_web_event replaced (917-), record_signup_source replaced (953-).
- Consent: consent_purposes key adds 'phone_outreach' (1007-1012); consent_records contact_id nullable, add company_id FK crm_companies CASCADE, method adds 'phone_notice', check subject XOR, check phone rules (1014-1026); consent_records_guard replaced (1029-1050).
- Admin RPCs (authenticated, 1557-1566): admin_consent (1053, crm_can_read, audit 'crm.consent_view'); admin_consent_export (1109, crm_can_write, audit 'crm.consent_export'); admin_crm_suppress(p_email,p_reason) (1132-1155, crm_can_write, hashes before store, audit 'crm.suppress' target_id = first 12 chars of hash); admin_consent_phone_notice(p_org_number,p_objected) (1163, crm_can_write, audit 'crm.phone_notice'); admin_brreg_triggers (1214, STABLE, crm_can_read, no audit); admin_brreg_set_dry_run (1273, crm_can_write, audit 'crm.brreg_dry_run'); admin_brreg_poll_now (1303, crm_can_write, audits 'crm.brreg_requeue'/'crm.brreg_poll'); admin_crm_partners (1331, STABLE, crm_can_read, no audit); admin_crm_partner_save (1359, crm_can_write, audit 'crm.partner_save'); admin_lead_scores (1407-1432, crm_can_read, audit 'crm.lead_scores'). Replaced: admin_crm_task_list (1434, now audited 'crm.task_list'), admin_crm_task_done (1488, 'crm.task_done'), admin_crm_company (1511, 'crm.company').
- app.growth_firewall replaced (1575-1732): scope regex now '^(crm_|growth_|consent_|event_|brreg_|mail_)|_events$|^partners$'; rule 7 now covers every app table in scope from the catalogue (checks anon, authenticated, service_role).

### 0144_growth_magnets_deliverability.sql (570 lines; 1-300 read in full; rest at signature/gate/audit level) (D-185)
- `app.growth_magnets` (62-81): key PK; rank unique 1..99; name; kind (tool,template,report,newsletter); gated (pdf,pdf_templates,templates,pdf_ics,none); status (planned,building,live) nullable; list_key; check status derived iff list_key. RLS on; revoked from public, anon, authenticated, **service_role**. 7 seeded (83-90), six 'planned'.
- `app.growth_krav_rules` (93-99) and `app.growth_krav_rule_versions` (101-128: rule_key FK CASCADE, version, threshold, on_demand_from, reference, say, never_say, checked_on, checked_against, guidance_only; PK(rule_key,version); checks). Append-only trigger growth_krav_version_guard (132-153, CLAUDE.md pattern). Seeds (155-163). RLS on, revoked incl. service_role. ("versioned data" — the only explicit version table in this scope.)
- `app.mail_streams` (166-179): key PK (transactional,marketing); sender unique; sort. Seed no-reply@orgpuls.com, hei@nyheter.orgpuls.com. RLS on, revoked incl. service_role. app.mail_stream_domain (181-184).
- `app.mail_templates` (187-205): key PK ^[a-z]+\.[a-z0-9_.-]{2,60}$; source (notice,ticket,lifecycle,auth,crm); ref; classification (service,marketing); stream FK mail_streams; locales text[] subset of 7; **version int default 1**; sort unique; unique(source,ref); CHECK marketing ⇒ marketing stream. RLS on, revoked incl. service_role. Seeds 27 + one per crm_template (207-246).
- Enum app.mail_auth_level (pass,warn,fail,unknown) (249).
- `app.mail_auth_runs` (252-265): id identity; admin_id FK auth.users SET NULL; claimed_at; recorded_at. `app.mail_auth_checks` (267-285): id; run_id FK CASCADE; stream FK CASCADE; domain; checked_at; spf/dkim/dmarc levels; dmarc_policy; unique(run_id,stream). RLS on, revoked incl. service_role.
- app.growth_doi(p_list) (296-312). public.admin_growth_magnets() (314-350): {super_admin,analyst,marketing}; audit 'growth.magnets_view'.
- app.mail_sent_7d() (358-394), app.mail_template_count(p_key,p_n) (402-409: withholds counts 1..k_min-1 for personal notices).
- public.admin_growth_deliverability() (411-484): {super_admin,analyst,marketing}; audit 'growth.deliverability_view'; returns k = k_min().
- public.admin_deliverability_claim() (493-513): {super_admin,marketing}; one per minute globally; audit 'deliverability.auth_claim'.
- public.admin_deliverability_check(p_run,p_results) (523-570): {super_admin,marketing}; audit 'deliverability.auth_check'. Levels are trusted input from the write role (header 40-43).

### Firewall tables (respondent-level)
- app.employees 0003:23-34 (+ later columns 0021:26, 0033:24, 0079:34, 0086:33-34, 0165:51-56). RLS on 0003:173. Policies: employee_read SELECT to authenticated using app.is_org_member(org_id) (0003:181-182) — still in force (no later drop found); employee_write replaced by employee_write_insert/update/delete for daglig_leder (0026:87-95). Grants: select, insert, update, delete to authenticated (0003:221-222). **Holds person identity (full_name, email, phone) and is readable by every org member — it is not a "no-policy" table.**
- app.invitations 0003:84-96 (employee_id FK SET NULL, token_hash bytea unique, sent_at, responded_at, expires_at). RLS on 0003:177. Original policies/grants 0003:211-225 all dropped/revoked in 0042:628-632 (`revoke all on app.invitations from anon, authenticated, public`). → now RLS on, no policy, no grant.
- app.responses 0003:101-116 (id, org_id, round_id, group_id, submitted_hour truncated check). No linkage column (header 0003:1-18). RLS on 0003:178; no policy; `revoke all ... from anon, authenticated` 0003:228. group_id FK made non-cascading 0042:623-625.
- app.answers 0003:118-126; append-only trigger answers_immutable → app.forbid_answer_change (0003:138-163, FK-maintenance aware). RLS on 0003:179; no policy; revoked 0003:228.
- app.extra_answers 0010:20-35: RLS on (31), no policy, revoked anon/authenticated (35). free_text column.
- app.response_comments 0012:23-35: RLS on (32), no policy, revoked (35).
- app.comment_threads 0018:43-69 (key_hash, opened_hour truncated), app.thread_messages 0018:71-80: RLS on (87-88), revoked anon/authenticated/public (89).
- app.contact_requests 0046:24-35: RLS on, revoked public/anon/authenticated.
- app.module_answers 0067:406-411, app.module_segment_answers 0067:414-419, app.org_count_answers 0067:427-433: RLS on 0067:503-505 (module_answers 503, segment 504, count 505), no policy, revoked anon/authenticated 0067:523.
- app.not_relevant_answers 0087:22-29, app.module_not_relevant_answers 0087:31-36: RLS on 0087:69-70, revoked public/anon/authenticated 0087:72.
- app.org_question_answers 0095:101-149: RLS on (147), revoked (149); append-only trigger (115-130).
- app.outbox 0020:43-57 (employee_id, invitation_id FKs; last_error): RLS on (73); outbox_read policy dropped and select revoked in 0106:28-30 → no client access.
- app.outbox_recipients 0134:29-43: address_key (32 bytes), masked address; RLS on, revoked.
- app.address_problems 0053:51-61 (employee_id): RLS on, revoked.
- app.entry_codes 0076:447-460: org-level QR code; select to members (policy entry_codes_read). Not person-level.
- app.employee_former_names 0190 (~70-80): org + name, RLS on, no policy, no grant.
- demo_requests (0094:53-62): e-mail of demo requester; RLS on, revoked (0094:84-91); retained 30 days.
- k: app.k_floor() = 3 (0150:41-44); app.k_min() = 5 (0001:27; comment 0150:47-48); app.k_round(round) = greatest(rounds.k, k_floor) (0150:101-113). 0150:170-187 rewrote dispatch_claim, conversations, app.org_unlocked and **public.admin_org_detail** (`g.answered < app.k_round(r.id)`) by string replacement.

### Admin/CRM paths that touch response-level tables (as found)
- admin_org_detail (0049:318-324): counts invitations.responded_at per employees.group_id (participation counts, not answers).
- admin_org_list/admin_account_health/admin_funnel: invitations counts + responded_at (0049:240-245, 0060:228-233, 0049:569-573).
- app.org_unlocked (0060:64-74; 0150:177-178): invitations.responded_at × employees.group_id.
- app.growth_tick (0141:508-522): `count(*) from app.responses` per round.
- 0141 backfill (0141:592-604): reads app.responses.submitted_hour.
- app.health_score (0141:1631-1632): counts invitations and app.responses for last closed round (withheld below k_min invitations).
- app.growth_funnel_count 'setup' (0142:349-357): reads app.employees created_at.
- app.growth_firewall (0141:1467-1486): reads app.employees emails and invitations token_hash and responses ids — as a checker, returning counts only.
- app.delete_organisation (0064:262; 0136:167): count(app.responses).
- app.demo_copy_table (0094:93-131, 176-237): copies responses/answers/extra_answers/response_comments etc. into a demo sandbox (template → copy).
- No admin/CRM function found reading app.answers values, extra_answers.free_text, response_comments.body (other than product RPCs like conversations/thread_by_key in 0046 for org leaders).


---

# Appendix B — test suites, assertion line references

## Tests (supabase/tests/)
Format: each suite has a header listing numbered assertions; "markers" = lines where `-- N ---` blocks or `'seq', N` rows appear.

### growth_firewall_invariants.sql (357 lines) — header 1-30
- (1) every one of the 7 rules passes, evidence is counts — 54
- (2) FK from a CRM table to invitations/comment_threads fails no_link_to_respondents — 63
- (3) respondent-capable prop in catalogue fails rule 2 — 76
- (4) grant on answer table to service_role fails no_role_reads_answers — 90; (5) column grant too — 100
- (6) contact = non-account employee fails no_employee_is_a_contact; member address passes — 111
- (7) event keyed by invitation id fails rule 5 — 128
- (8) growth trigger on responses fails nothing_attached_to_answers — 148; (9) via innocently named function — 161
- (10) client grant on stream fails growth_tables_closed — 180; (11) column grant — 190
- (12) firewall not callable by clients; reads catalog — 201
- (13) nothing survives — 326
- (14) FK from answer table to stream fails rule 1 — 213
- (15) rewrite rule on responses — 225; (16) CHECK calling function on answers — 237; (17) trigger/default on invitations — 250; (18) policy and index expression on answer table — 267
- (19) arbitrary role / role membership holding select on answers fails rule 3 — 280
- (20) inactive employee address as contact fails rule 4 — 294; (21) event keyed by token hash fails rule 5 — 306

### growth_events_invariants.sql (428) — header 1-34; markers 1@67 2@82 3@153 4@170 5@199 6@221 7@237 8@247 9@259 10@268 11@280 12@310 13@359 15@377 14@406
- (1) catalogue+stream closed, no public fn; (2) stream check refuses bad props/ids/persons/finer time/keys; (3) catalogue refuses respondent props; (4) product writes emit; contact-form spoof emits no ticket.created; (5) bands, no bare numbers; (6) threshold_reached from tick, hour-truncated, once; (7) nothing attached to responses/answers/extra_answers/response_comments; (8) no event references respondent/invitation/employee; (9) demo emits nothing; (10) events go with org, never edited; (11) admin_growth_events gated super_admin/analyst/marketing+aal2; (12) other emit paths; (13) every catalogue event has an emitter; (14) nothing survives; (15) only occurred_at, hour_only on the hour.

### growth_crm_invariants.sql (792) — header 1-54; markers 1@83 2@109 3@186 7@202 8@226 9@252 10@266 11@275 12@294 13@316 14@337 17@379 21@420 22@452 23@491 24@503 25@525 26@544 27@582 28@617 29@653 30@694 31@710 32@742 20@762 (4-6, 15-16, 18-19 are inside neighbouring blocks)
- (1) new G3 tables closed incl. service_role, no FK to respondent tables; (2) read/write role gates + service-role-only edge fns; (3) every admin write logged, suppressed address in no log; (4) suppression = sha256 of lower-cased address; (5,6) phone notice ledger, objection → withdrawal + DNC, append-only; (7) generic-address rule everywhere; (8) feed derivations; (9) fit 0–50, outreach ≥30; (10) 10% holdout by hash; (11) dry run; (12) HTTP 410 purge; (13) poll throttling; (14) working minutes + 1h SLA; (15,16) lead scoring/routing once; (17) task list SLA; (18,19) partners + referral code attribution; (20) nothing survives; (21) suppressed generic address never emailed; (22) objection after assignment; (23) one poll at a time; (24) rules shown = rules applied; (25) share pct; (26) firewall covers the eight tables; (27)-(30) further reroute/objection/FK-maintenance/failed-poll cases; (31),(32) present at 710/742 but not in header.

### growth_registry_invariants.sql (480) — header 1-40; markers 1@78 2@100 3@120 4@138 5@167 6@192 7@214 8@263 9@293 10@310 11@331 12@345 15@356 16@385 13@446 14@458
- (1) 17 G2 tables closed incl. service_role; public fns not anon; (2) reads: growth roles+aal2 only, audited; (3) writes/exports refuse support & aal1; (4) item status/owner audited with from/to; (5) «live» derived never stored; (6) rule live only if implementation exists/enabled; (7) plan calendar/gates; (8) funnel PQL null, lead «now»; (9) experiments audited; (10) decide audited; (11) exports audited growth.export; (12) event page firewall timestamp; (13) seeded registry honest; (14) nothing survives; (15) gate measures; (16) funnel measures.

### growth_g4_invariants.sql (463) — header 1-32; markers 1@84 2@112 3@128 4@146 5@179 6@217 7@232 8@250 12@307 13@327 9@374 10@417 11@438
- (1) read roles growth+aal2; claim/check super_admin/marketing; (2) all audited; (3) magnets honest; (4) no fabricated figure; (5) Krav rules versioned/immutable; (6) two streams; marketing template never on product stream; (7) registry covers every mail kind; (8) 7-day derivations; (9) auth check claim/record; (10) tables closed incl. service_role; (11) nothing survives; (12) personal-notice counts withheld below k; (13) withheld rows excluded from aggregates.

### consent_ledger_invariants.sql (313) — header 1-19; markers 1@60 2@80 3@151 4@168 5@180 6@215 7@248 8@263 9@277 10@293
- (1) ledger + purposes closed; (2) every consent path writes a record with its method; (3) no edit/delete while contact exists; (4) erasure cascades, account deletion clears created_by; (5) account_sync moves across suppressed address with no author; (6) crm_contacts/list_members equal ledger latest state; (7) record → event without contact/org/account/key; (8) no gap after backfill; (9) suppression hashes only; every list is a purpose; (10) nothing survives.

### crm_invariants.sql (271) — header 1-18; seq lines 1@53 2@66 3@78 4@94 5@108 6@119 7@128 8@142 9@160 10@170 11@189 12@196 14@207 13@216 15@225 16@241 17@251
- (1) CRM tables RLS/no policy/no privilege; (2) public vs admin vs service_role callability; (3) **no FK from app.crm_* to employees/invitations/responses/answers/extra_answers/response_comments, and no function named crm_%/admin_crm_%/record_crm_event whose source mentions those tables** (69-79); (4) sync takes account holders only, never a registered employee (84-95); (5) basis follows plan, consent never downgraded; (6) customer exception off; (7,8) double opt-in; (9) import requires consent source; (10) filter validation; (11,12) campaign queues only mailable, address cleared after send; (13) unsubscribe token hashed; (14,15) opens/clicks CRM-only, hard bounce suppresses; (16) roles: support no, analyst reads, marketing writes only with aal2, audited; (17) nothing survives.

### crm_pipeline_invariants.sql (301) — header 1-21; markers 1@48 2@58 3@69 4@81 5@86 6@97 7@111 8@126 9@138 12@202 13@212 14@225 15@234 16@246 18@260
- (1) new tables closed; (2) callability; (3) same respondent-firewall check as crm_invariants (69-79); (4) 10 templates valid; (5,6) business basis only for role address, ENK never; (7) signup links company, stage follows plan; (8) first call → contacted; (9) lists by DOI; (10) list campaign subscribed only; (11) A/B; (12,13) unsubscribe scope/preference centre; (14) click path no query; (15) web archive only sent+published; (16) roles; (17) nothing survives; (18) company contact, list_remove, known_orgnrs.

### crm_stages_invariants.sql (198) — header 1-13; markers 1@39 2@49 3@65 4@76 5@113 6@122 7@140 8@151 9@163 10@176 — stages closed/seeded/managed; stage moves on send; reply forward only; follow-up audience; bulk move; open/click moves nobody; analyst can't move.
### crm_sequences_invariants.sql (228) — header 1-18; markers 1@51 2@82 3@91 4@132 5@150 6@171 7@191 8@205 — manager import (no birth date); business hours; follow-up exits; resend & 7-step cap; follow_done (0115); auto follow-up never batched; daily cap; analyst read-only.
### crm_inbox_invariants.sql (121) — header 1-9; markers 1@30 2@44 3@66 4@83 5@97 — exit criteria; inbox leads & first response; SLA bounds; analyst can't set.
### crm_designed_mail_invariants.sql (123) — header 1-11; markers 1@37 2@52 3@72 4@101 — designed blocks limits; templates valid & 5 categories; [placeholder] blocks scheduling.
### crm_deal_invariants.sql (89) — header 1-7; markers 1@29 2@36 3@46 6@54 4a@60 5@71 — value kept/cleared/validated; contact name fallback; support read-only; owner candidates.
### crm_journeys_invariants.sql (108) — header 1-9; markers 1@51 2@57 3@62 5@68 6@77 4@89 — journeys read model; anon refused; task list; health demo flag.
### crm_sync_invariants.sql (72) — header 1-7; markers 1@29 2@37 3@53 — e-mail change handled.
### crm_win_rate_invariants.sql (264) — header 1-24; markers 1@64 2@75 3@93 4@102 5@119 6@144 7@177 8@192 9@206 10@226 11@243 — stage history trigger; append-only; closed to clients; pipeline sums; win rate (churn excluded); call/LinkedIn steps & tasks; skip; analyst read-only.

### admin_invariants.sql (211) — header 1-14; seq lines 1@45 2@50 3@56 4@71 5@79 6@89 7@97 8@108 9@116 10@127 11@135 12@142 13@148 14@155 15@164 16@172 17@184 18@194
- (1) platform_admins, admin_audit, admin_org_notes, product_events: RLS on, no grants to anon/authenticated (39-45); (2) anon may execute no public.admin_% function (47-50); (3) **no public.admin_% function body matches app.(responses|answers|extra_answers|response_comments)** (52-56) — checks direct references only; indirect reads through app.* helpers (e.g. app.health_score, app.growth_tick) are not caught; (4) customer daglig leder not admin; (5) aal1 refused, aal2 ok; (6,7) account separation triggers; (8) org detail names no non-user employee; (9) reads audited (org.view, orgs.list); (10) admin_audit cannot be updated/deleted/truncated; (11-14) role matrix (support extends trial w/ reason; finance cannot; analyst sees business not orgs; support reads one org's trail only); (15) provider error addresses masked; (16) super-admin grants role, refuses customer account; (17) results_viewed once a day; (18) nothing survives.
### admin_roles_invariants.sql (113) — header 1-9; markers 1@35 2@44 3@56 4@65 5@75 6@94 — editor CMS/SEO yes; editor refused customer/admin/audit/business readers; no regression for marketing/support; indexing switch default on, anon reads only; super_admin only, audited.
### admin_attention_invariants.sql (97) — header 1-8; markers 1@30 2@51 3@59 4@78.
### account_owner_invariants.sql (113) — header 1-9; markers 1@31 2@51 3@61 4@74 5@81 6@94 — table closed; support sets, audited; analyst/finance refused; owner must be active admin.
### contact_invariants.sql (167) — header 1-17; seq lines 1@38 … 14@143 — (0046 contact requests, respondent conversations; not CRM) anon refused; table closed; FKs only thread + leader profile (4@61); visibility rules.
### suppression_invariants.sql (263) — header 1-24 — **complementary suppression of small groups (0034), not CRM suppression**; markers 1@62 2@115 3@124 4@135 5@143 8@161 11@189 12@198 13@222 14@234.
### health_score_invariants.sql (152) — header 1-12; markers 1@32 2@42 3@52 4@77 5@90 8@100 6@115 7@134 — not client-callable; components & missing reasons; 90 reachable; overdue wheel; all orgs consistent.
### web_invariants.sql (248) — header 1-19; seq lines 1@50 2@60 3@66 4@79 5@91 6@100 7@108 8@117 9@125 17@135 10@146 11@167 12@170 18@181 19@189 13@206 14@213 15@220 16@230 — web tables closed; no IP/UA/account column; /24-/48 network; bots dropped; respondent paths never recorded; salt rotation; 300/day cap; channels; attribution; admin-only & audited.
### web_report_invariants.sql (127) — header 1-10; markers 1@30 … 7@109.
### ticket_invariants.sql (226) — header 1-18; seq lines 1@51 2@60 3@66 4@76 5@86 6@93 7@101 8@108 9@117 10@124 11@130 12@148 13@156 14@165 15@177 16@181 17@198 18@209 — incl. (3) no ticket function body references response tables (61-67); (12) ticket content support/super_admin+aal2 only; (17) messages/events immutable.
### ticketing_p2_invariants.sql (332) — header 1-23; markers 1@54 … 18@311 — incl. (17) no new function references response tables (303-309).
### ticket_holidays_invariants.sql (120) — holidays calendar.
### lifecycle_invariants.sql (171), seo_invariants.sql (143), trends_invariants.sql (141), cms_invariants.sql (207), content_invariants.sql (125), media_invariants.sql (160), cancellation_invariants.sql (201), retention_invariants.sql (325), demo_invariants.sql (319), mail_events_invariants.sql (157) — headers summarized in the main doc (each: tables closed, role gates with aal2, audit of reads/writes, nothing survives).
### respondent_invariants.sql (185) — 21 assertions (inserted into public._inv): 1-3 invalid tokens (52-58); 4-6 out-of-round refusals (68-72); 7 anon may submit (78); 8 every answer written (79); 9 no response id returned (84); 10-11 replay refused (91-92); 12 expired token (97); 13 responses has no linkage column (112-117); 14 submitted_hour truncated (119-123); 15 response carries a group (125-127); 16 **no SELECT/ALL policy on responses/answers/extra_answers** (129-132); 17 **no anon/authenticated grants on responses/answers/extra_answers** (134-138); 18 bogus option rejected (142-145); 19 answers immutable (150-153); 20 answers not directly deletable (158-161); 21 fixture restored via cascade (168). Note: 16/17 do not list response_comments (CLAUDE.md names it); growth_firewall rule 3 does cover it via v_answer.
