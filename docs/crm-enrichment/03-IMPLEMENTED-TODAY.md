# 03 — What is implemented today

Phase A output (A3.3) for `docs/crm-enrichment/INSTRUCTIONS.md`, written 2026-10-03 on branch `ccr-39a2fb73-jgkg09`. Read-only: no application code or database was changed. Every fact cites `path:line`; where the inventory says a range was not read in full, that range is an open item, not a finding. This file covers the CRM in depth. The rest of the admin is covered item by item in `04-GAP-ADMIN-SPEC.md`; routes outside the CRM are listed in the screenshot table at the end.

---

# Orgpuls admin Marketing CRM: application-layer inventory

Read-only inventory. Snapshot of the repo at /home/user/Orgpuls, 2026-10-03. Every fact cites `path:line-range`.
Line numbers are the file's own. Where a database function is cited (`supabase/migrations/...`), the
start line is exact. End lines come from a scripted scan, and for functions in `0141_growth_foundations.sql` and
`0145_brreg_settings_where.sql` (written in `$function$` style) only the start line can be relied on.

Abbreviations used below:
- `CRM/` = `app/(admin)/admin/crm/`
- `LA/` = `lib/admin/`
- `CA/` = `components/admin/`
- "canWrite" = the page-level expression `who?.role === 'super_admin' || who?.role === 'marketing'`

---

## 1. Admin shell & guard

### 1.1 Layout / guard (`app/(admin)/admin/layout.tsx`)
- The whole admin ("Sentral") is one layout. Its doc comment says three checks apply here and again in the DB on every call:
  signed in, an active admin role, and a second factor. "The admin is in English, by decision, and never indexed."
  (`app/(admin)/admin/layout.tsx:13-19`). `metadata` is `title:'Sentral', robots noindex/nofollow`, and `dynamic='force-dynamic'` (`:18-19`).
- Guard code (`:53-56`):
  - `whoami()` returns null, so `redirect('/admin/login')`
  - `!who.is_admin || !who.role`, so `redirect('/admin/mfa')`
  - `who.mfa_enforced && who.aal !== 'aal2'`, so `redirect('/admin/mfa')`
- There is no CRM-specific layout, loading or error file. `CRM/` holds only `page.tsx` files and one `route.ts` (file list: 20 files, 2796 lines).
- Translations: `getTranslations({ locale: 'en', namespace: 'admin' })` (`layout.tsx:58`). The admin locale is **hard-coded to `en`**. Every CRM page repeats this (for example `CRM/page.tsx:16`, `CRM/pipeline/page.tsx:20`).
- The auto-approve banner is shown to super_admin/support (`:60-62`, `:87-94`). Every admin page ends with a privacy footer `t('common.privacy')` (`:96`).
- Sign-in UI lives in `app/(adminauth)/admin/{login,mfa}/page.tsx` (file list). The admin host defaults to `admin.orgpuls.com` (`lib/hosts.ts:12`). `adminPath` strips the `/admin` prefix on the admin host (`LA/nav.ts:174`).

### 1.2 `whoami` / `call` (`lib/admin/api.ts`)
- `ROLES = ['super_admin','support','finance','analyst','marketing','editor']` (`LA/api.ts:23-24`).
- `call(fn, args, schema)` runs `supabase.rpc(fn,args)`. It parses `{ok,error}` and returns `{error}` on `!ok`. On success it Zod-parses the payload against `schema` (`LA/api.ts:28-42`). `isError` is at `:43`.
- `whoami()` runs `auth.getUser()` and then RPC `admin_whoami`, parsed with `Who = {is_admin, role|null, mfa_enforced, aal, email}` (`LA/api.ts:51-70`).
- The file header says each admin read is one SECURITY DEFINER function that "checks the caller's admin role — with a second factor — and writes an audit row" (`LA/api.ts:17-22`).

### 1.3 Role model
- **Section visibility** (menu only, not security) is defined by `BY_ROLE` (`LA/access.ts:11-25`):
  - `super_admin`: every section
  - `analyst`: includes `'crm'` (`:17`)
  - `marketing`: includes `'crm'` (`:21`)
  - `support`, `finance` and `editor` have no `crm` (`:13`, `:14`, `:24`)
  - `canSee(role, section)` is at `:54`, and `HREF.crm = '/admin/crm'` is at `:36`.
- **Growth-phase CRM views** (consent/triggers/partners) are also gated server-side in the page by `mayOpenGrowthView(role, key)`, which is `canSee(role, GROWTH_VIEWS[key].section)`. Those three views have section `'crm'` (`LA/growth.ts:25-27`, `:43`).
- **Write UI** shows only when canWrite, i.e. `super_admin` or `marketing`. That expression is repeated inline in every CRM page (e.g. `CRM/contacts/page.tsx:31`, `CRM/pipeline/page.tsx:28`, `CRM/campaigns/[id]/page.tsx:43`).
- **Database enforcement** (the real guard):
  - `app.admin_role()` returns the role only for an *active* admin, and only if MFA is not enforced or the JWT `aal = 'aal2'` (`supabase/migrations/0049_platform_admin.sql:64-72`).
  - `app.is_platform_admin(roles[])` is at `0049_platform_admin.sql:74-76`.
  - `app.crm_can_read()` = `is_platform_admin(['super_admin','marketing','analyst'])` (`supabase/migrations/0055_crm.sql:505-507`).
  - `app.crm_can_write()` = `is_platform_admin(['super_admin','marketing'])` (`0055_crm.sql:509-511`).
  - Each `admin_crm_*` RPC starts with `if not app.crm_can_read()/crm_can_write() then return {ok:false,error:'not_allowed'}`, then `perform app.admin_log('crm.<action>')`. Example: `admin_crm_companies` at `0056_crm_pipeline.sql:826-846` (check at `:832-834`, log at `:836`).
  - Exception: `admin_crm_settings` (customer exception) is super_admin only: `is_platform_admin(array['super_admin'])` (`0145_brreg_settings_where.sql:65-82`).
- **Audit**: `app.admin_audit` table (`0049_platform_admin.sql:79`ff), written by `app.admin_log(...)` inside the RPCs. The per-RPC audit action names are in §4.3.

---

## 2. Navigation

- Menu model: `MODEL` in `LA/nav.ts:61-157`. CRM pages are split across two top-bar areas:
  - **CRM** (sales) (`LA/nav.ts:78-91`): `crmPipeline` → `/admin/crm/pipeline`, `crmProspects` → `/admin/crm/prospects`, `crmTasks` → `/admin/crm/tasks`, `crmInbox` → `/admin/crm/inbox`, `crmScoring` → `/admin/crm/scoring`, `crmTriggers` → `/admin/crm/triggers`, `crmPartners` → `/admin/crm/partners`, `crmStages` → `/admin/crm/stages` (`more: true`, behind «More»). All have `section: 'crm'`.
  - **Marketing** (`LA/nav.ts:93-105`): `crmOverview` → `/admin/crm` (exact), `crmCampaigns`, `crmJourneys`, `crmContacts` → `/admin/crm/contacts` with `also: ['/admin/crm/lists','/admin/crm/segments']` (one entry with tabs), `crmConsent` → `/admin/crm/consent`, `crmTemplates`.
  - Related entries outside the two areas: `cmsMagnets` (section growth, `LA/nav.ts:113`) and `deliverability` under Admin (section growth, `LA/nav.ts:152`).
- An entry shows only if the role `canSee` the section **and** the href is in the layout's `PAGES` (`LA/nav.ts:160-166`). The layout lists `/admin/crm/{inbox,pipeline,prospects,contacts,lists,segments,campaigns,journeys,tasks,scoring,templates,stages}` explicitly (`layout.tsx:24-37`). Consent, triggers and partners come in through `GROWTH_PAGES` (`layout.tsx:49`, `LA/growth.ts:36`).
- `isCurrent` handles `exact` and `also` (`LA/nav.ts:169-171`). `AudienceTabs` renders the three tabs Contacts / Lists / Segments with labels `crm.audienceTabs.*` (`CA/AudienceTabs.tsx:1-13`).
- Labels: `nav.area.{crm,marketing}` = "CRM" and "Marketing". `nav.item.crm*` = Overview, Inbox, Pipeline, Companies, Contacts & lists, Lists, Segments, Campaigns, Templates, Stages and senders, Journeys, Tasks, Lead scoring, Consent, Brønnøysund triggers, Partners (messages/en.json `admin.nav`, read by script). Note: the nav label for `/admin/crm/prospects` is **"Companies"**, while the page title uses `crm.prospects.title`.
- Shell: `CA/AdminShell.tsx:26-40` describes the top bar, the area sub-bar, and the «More» overflow for `more:true` items (`:60-63`).
- Test: `tests/unit/admin-nav-crm.test.ts:12-31` asserts the CRM keys `[crmPipeline, crmProspects, crmTasks, crmInbox, crmScoring, crmStages]` and the Marketing keys `[crmOverview, crmCampaigns, crmJourneys, crmContacts, crmTemplates]`, given a BUILT list without triggers, partners or consent. It also asserts that lists and segments light up Contacts.

---

## 3. Routes

The common pattern on every page:
1. `t = getTranslations({locale:'en', namespace:'admin'})`
2. `m = t.raw('crm') as CrmMessages`, the whole `admin.crm` object passed to client forms (type at `CA/CrmForms.tsx:29`)
3. Reads through `LA/crm.ts` or `LA/growthCrm.ts`, which call `call()` with a Zod schema
4. An error renders `<Problem text=notAllowed|failed>`
5. canWrite controls which forms are shown

No page has its own Zod for searchParams beyond inline whitelisting (noted per page).

### 3.1 `/admin/crm`: Marketing overview (`CRM/page.tsx:1-84`)
- **Renders** (`:26-82`):
  - PageHead `overview.title/lead`
  - Card "mail": six Stats (sent with campaign count, open rate, click rate, CTOR, unsubscribe rate, bounce rate) and a rate note (`:30-40`)
  - Stat row: subscribers (joined/left 30d), won 90d, trials 90d, signups from email, tasks due (`:42-52`)
  - Card pipeline: list of stages with counts, each linking to `/admin/crm/prospects?stage=` (`:55-66`)
  - Card tasks: table of due tasks (due/company/task/owner), empty `o.noTasks` (`:67-80`)
- **Reads**: `crmOverview()` → RPC `admin_crm_overview` (`LA/crm.ts:429-450`). `crmTasks()` → `admin_crm_tasks` (`LA/crm.ts:382-389`). `crmStages()` → `admin_crm_stages` (`LA/crm.ts:293`).
- **Writes**: none.
- **Role**: DB `crm_can_read` (overview: `0056_crm_pipeline.sql:1374`; tasks: `:1065`; stages: `0112_crm_board_inbox.sql:37`). No page-level role check.
- **i18n**: `admin.crm.overview.*`, `admin.crm.tabs.campaigns` (`:32`).
- **Oddities**: `rate()` builds `"x %"` with `toLocaleString('en-GB')` (`:13`). Subscriber hint strings are filled with `.replace('{count}')` instead of ICU (`:46`). "Due" is computed against UTC `toISOString().slice(0,10)`, not Oslo (`:23`).

### 3.2 `/admin/crm/pipeline`: deal board/list (`CRM/pipeline/page.tsx:1-53`)
- **Renders**:
  - PageHead with lead `crm.board.leadSum` (open value, count, won this quarter) plus an optional win rate (`:30-31`)
  - Segmented control Board/List via `?view=list` (`:38-44`)
  - «New deal» button (canWrite) (`:45`)
  - `PipelineBoard` (`:48`)
  - Notes: unvalued deals (`:49`), and a «capped» message when there are 500 or more rows (`:50`)
- **Board component** (`CA/CrmBoard.tsx:68-249`):
  - Columns are the non-archived stages with kind `open` or `won`, sorted (`:90`).
  - Each column header shows a colour dot, the name, and `count · kr sum`. Unvalued deals show "—" instead of 0 kr (`:126-160`).
  - **HTML5 drag-and-drop** of cards between columns (`:137-148`, `:165-171`), with an optimistic update and rollback on refusal (`:101-114`).
  - A card shows company name, `contact_name` or `noContact`, value or `noValue`, owner avatar, and a footer "N days" (or "closed") plus the next step (`:174-180`).
  - An empty column shows `b.empty` (`:185`).
  - List view: rows sorted by value desc (`:202-223`).
  - Stages of kind `lost`/`parked` appear as links to `/admin/crm/prospects?stage=` with counts (`:227-235`).
  - Clicking a card opens `DealDialog` (`:251-332`). Fields: stage select (non-managed, non-archived), value (NOK), next step plus date, owner. There is a link «Open company» (`:317`).
  - `NewDeal` dialog: company name, value, next step, owner (`:335-388`).
- **Reads**: `crmStages`, `crmCompanies(null,null)` → `admin_crm_companies` (`LA/crm.ts:343-348`, limit 500 in SQL `0056_crm_pipeline.sql:845`), `whoami`, `crmOwners` → `admin_crm_owners` (`LA/crm.ts:454`), `crmPipelineSummary` → `admin_crm_pipeline_summary` (`LA/crm.ts:536-549`).
- **Writes**:
  - drag → `moveCard(id,to)` → `admin_crm_stage_move` (`LA/crmActions.ts:464-473`)
  - dialog → `saveDeal` → `admin_crm_company_save`, then `admin_crm_stage_move` if the stage changed (`LA/crmActions.ts:479-510`)
  - new deal → `saveCompany` → `admin_crm_company_save` (`LA/crmActions.ts:321-374`)
- **Role**: the page computes canWrite (`:28`). The board blocks moves when `!canWrite`, `to.managed` or `c.org_id` (`CA/CrmBoard.tsx:103`, `:132`, `:163`). DB checks are `crm_can_write` / `crm_can_read`.
- **Zod**: `moveCard` `{id uuid, to StageKey}` (`LA/crmActions.ts:465`). `saveDeal` schema at `:480-496`.
- **i18n**: `crm.board.*`, `crm.problem.*`.
- **Tests**: `tests/unit/pipeline.test.ts:4-42` (totals, shownSum, winRate). SQL: `supabase/tests/crm_deal_invariants.sql` (value/contact/owners), `crm_win_rate_invariants.sql`, `crm_inbox_invariants.sql` (board stages).

### 3.3 `/admin/crm/prospects`: companies list (`CRM/prospects/page.tsx:1-135`)
- **Renders**:
  - Stage filter chips with counts, `?stage=` (`:42-62`)
  - Search form `?q=` (`:65-77`)
  - Bulk move form `StageMoveForm id="bulk-stage"` with per-row checkboxes (canWrite) (`:78-83`, `:90-94`)
  - Table: company (org number, manager name), stage badge, owner, size, industry, place, next step (red if due), last activity, contacts. Empty: `common.none` (`:84-117`)
  - canWrite cards: «Brønnøysund» `RegistryPicker` and `ManagerRefresh` (`:122-127`), and «Add company» `CompanyForm` (`:128-130`)
- **Reads**: `crmStages`, `crmCompanies(q, stage)`, `whoami`, `listAdmins()` → `admin_list_admins` (`LA/api.ts:328`), filtered to active super_admin/marketing as owner options (`:33-35`). `registryMunicipalities()` fetches `https://data.brreg.no/enhetsregisteret/api/kommuner?size=1000` (`LA/brreg.ts:105-107`).
- **Writes**:
  - `moveStage` → `admin_crm_stage_move` (`LA/crmActions.ts:406-420`)
  - `findInRegistry` (brreg search, then `admin_crm_known_orgnrs`, then `generalManagers`) (`:681-698`)
  - `importCompanies` → `admin_crm_company_import` (`:724-738`)
  - `refreshManagers` → `admin_crm_company_import` (`:746-764`)
  - `saveCompany` (`:321-374`)
- **searchParams**: `stage` is whitelisted against stage keys (`:28`). `q` is trimmed and passed raw to the RPC (`:29`).
- **i18n**: `crm.prospects.*` (73 keys), `crm.stage.all`, `common.search`.
- **Tests**: `supabase/tests/crm_pipeline_invariants.sql`, `crm_sequences_invariants.sql` (register import, managers), `crm_stages_invariants.sql`.

### 3.4 `/admin/crm/prospects/[id]`: one company (`CRM/prospects/[id]/page.tsx:1-147`)
- **Renders**:
  - PageHead (name, org number, stage badge, back link) (`:43-48`)
  - Card details: stage plus changed date, owner, next step, register manager (DAGL/INNH plus seen date), industry, employees, municipality, website link, phone, source/form code, tags, lost reason, link to `/admin/orgs/{org_id}`, and a compact `StageMoveForm` (canWrite, only if not a customer org) (`:51-75`)
  - Card mail: «sent/opened/clicked» line and last time (`:76-81`)
  - Contacts table (contact, role, basis, status/suppressed/mailable) (`:84-98`)
  - Activity card: `ActivityForm` (canWrite) and an activity log with kind badge, time, admin, contact, due, and `TaskToggle` done/reopen (`:101-133`). Auto-task bodies `auto:<key>` are worded through `crm.tasks.auto.*` (`:30-33`).
  - canWrite: edit `CompanyForm` and «add contact» `ContactForm companyId` (`:134-143`)
- **Reads**: `crmCompany(id)` → `admin_crm_company` (`LA/crm.ts:367-380`; SQL `0143_growth_crm.sql:1511`), `crmStages`, `whoami`.
- **Writes**:
  - `logActivity` → `admin_crm_activity` (`LA/crmActions.ts:376-401`)
  - `toggleTask` → `admin_crm_task_done` (`:601-612`)
  - `saveCompany`, `saveContact` → `admin_crm_save_contact` (`:40-75`)
  - `moveStage`
- **i18n**: `crm.company.*`, `crm.prospects.*`, `crm.tasks.auto.*`, `crm.tasks.trigger.*`, `growth.g3.problem.failed` (`:122`).
- **Oddity**: the activity `kind` enum includes `'stage'` (`LA/crm.ts:352`), but `ActivityForm` offers only call/email/reply/meeting/note/task (`CA/CrmPipelineForms.tsx:165`).

### 3.5 `/admin/crm/contacts`: Contacts & lists (`CRM/contacts/page.tsx:1-181`)
- **Renders**:
  - PageHead lead `contactsPage.lead` (total, not mailable). canWrite buttons: «New list» (a link to `/admin/crm/segments?new`) and «Import» (`ImportDialog`) (`:41-50`)
  - `AudienceTabs` (`:51`)
  - Left panel: search `?q=` and a type segmented control (all/prospect/trial/customer/former with counts) (`:55-70`)
  - Contact rows: avatar, name, email, company/org name, role, stage badge, consent dot/label (suppressed/unsubscribed/pending/reachable/no basis), «Open» (`:72-84`, `:128-167`)
  - Empty: `noMatch` or `common.none` (`:85`)
  - Right panel: «lists» combines **segments** (mailable count, excluded note) and **subscription lists** (subscribed, unsubscribed note), with `noLists` empty (`:90-108`)
  - canWrite: «Add contact» card with `ContactForm` (`:111-116`)
  - Settings card: customer exception on/off. `SettingsForm` only for **super_admin**, otherwise `settings.superOnly` (`:118-122`)
- **Reads**: `crmContacts(q,type)` → `admin_crm_contacts` with `p_limit 300` (`LA/crm.ts:74-75`; SQL `0055_crm.sql:526`), `crmSegments` → `admin_crm_segments`, `crmLists` → `admin_crm_lists`, `whoami`.
- **Writes**: `saveContact`, `importContacts` → `admin_crm_import` (`LA/crmActions.ts:107-123`), `saveCrmSettings` → `admin_crm_settings` (`:125-133`).
- **searchParams**: `type` is whitelisted against `CONTACT_TYPES` (`:27`). `q` is trimmed to 100 characters (`:28`).
- **i18n**: `crm.contactsPage.*`, `crm.add.*`, `crm.settings.*`, `crm.import.*`, `crm.roleName.*`, `nav.siteName`.
- **Tests**: `supabase/tests/crm_invariants.sql`, `crm_sync_invariants.sql`, `consent_ledger_invariants.sql`.

### 3.6 `/admin/crm/contacts/[id]`: one contact (`CRM/contacts/[id]/page.tsx:1-122`)
- **Renders**:
  - Details card: type, org link, CRM company link, org number, role, source, tags, language, added, engaged, status, suppressed and mailable badges (`:37-56`)
  - Consent card: basis, consent time and source, or `consentNone`, plus an account note (`:57-68`)
  - Lists card: `ContactListForms` (canWrite) or a read-only list (`:71-79`)
  - Timeline table of every mail: campaign link and kind, status, sent, delivery, opened, clicked, unsubscribed (`:81-101`)
  - canWrite: edit `ContactForm`, «Unsubscribe» (if not already) and «Erase» `ContactActionForm` (`:103-119`)
- **Reads**: `crmContact(id)` → `admin_crm_contact` (`LA/crm.ts:90`; SQL `0055_crm.sql:556`), `crmLists`, `whoami`.
- **Writes**:
  - `saveContact`
  - `contactAction` (unsubscribe/erase with reason 5..500) → `admin_crm_contact_action` (`LA/crmActions.ts:77-88`)
  - `addToList` (consent source 3..200) → `admin_crm_list_add` (`:796-806`)
  - `removeFromList` (reason 5..500) → `admin_crm_list_remove` (`:808-816`)
- **Hard-coded**: language shown as `'English' : 'Norsk'` (`:45`). Delivery and send status are shown as raw DB strings, `{s.status}` / `{s.delivery}` (`:92-94`).

### 3.7 `/admin/crm/lists`: subscription lists (`CRM/lists/page.tsx:1-68`)
- **Renders**: PageHead and «new» link (canWrite). `AudienceTabs`. Edit/new card with `ListForm` (`?id=`, `?new`) (`:33-37`). Table: name NO (EN · key, archived badge), public, subscribed, pending, unsubscribed, growth `+joined/−left` 30d, campaigns, open rate, click rate (`:38-65`).
- **Reads**: `crmLists` → `admin_crm_lists` (`LA/crm.ts:411`; SQL `0056_crm_pipeline.sql:1080`).
- **Writes**: `saveList` → `admin_crm_list_save` (`LA/crmActions.ts:767-794`). Fields: key (new only), name_no/en, description_no/en, public, archived (`CA/CrmPipelineForms.tsx:548-586`).
- **i18n**: `crm.lists.*`.
- **Oddity**: the list key has only `max(40)` in Zod (`LA/crmActions.ts:772`). The public signup regex `^[a-z0-9-]{2,40}$` is enforced elsewhere (`lib/crm/actions.ts:23`). The DB is presumed to enforce it.

### 3.8 `/admin/crm/segments`: saved filters (`CRM/segments/page.tsx:1-74`)
- **Renders**: PageHead and «new» (canWrite). `AudienceTabs`. Edit/new card with `SegmentForm` (`:51-55`). Table: name (link if canWrite), filter description, total, mailable (`:57-71`). `describe()` turns a filter into text (`:27-42`).
- **Filter fields**: types, roles, sources, tags, lang, min/max employees, NACE, no_survey_days, mailable_only, stages, lists, bases (`LA/crm.ts:92-108`, `.strict()`).
- **SegmentForm** (`CA/CrmForms.tsx:256-403`): checkbox groups, inputs, «Preview» (`previewSegment` → `admin_crm_segment_preview`, which returns total, mailable and a sample of email/name/type), «Delete».
- **Writes**:
  - `saveSegment` → `admin_crm_segment_save` (`LA/crmActions.ts:158-167`)
  - `deleteSegment` → `admin_crm_segment_delete` (`:188-195`)
  - `previewSegment` (`:173-186`)
  - filter assembly is `filterOf` (`:136-156`)
- **i18n**: `crm.segments.*`, `crm.segmentsX.*`, `crm.type/roleName/source/basis`.
- **Oddity**: `CONTACT_SOURCES` lacks `'demo'` (`LA/crm.ts:15`), but demo leads are inserted with `source='demo'` (`supabase/migrations/0146_demo_signup.sql:106-107`). A segment therefore cannot filter on it, and `crm.source` messages have no `demo` key (7 keys: user, newsletter, contact_form, import, manual, event, brreg).

### 3.9 `/admin/crm/campaigns`: campaign list (`CRM/campaigns/page.tsx:1-161`)
- **Renders**:
  - PageHead lead `campaignsPage.lead`, and «New campaign» `NewCampaignDialog` (canWrite) (`:56-58`)
  - KPI Stats: running (drafts/cancelled), sent in 30d (delivered %), click rate, conversions (signups) (`:60-65`)
  - Campaign rows sorted by status order (sending, scheduled, draft, sent, cancelled), then date (`:77-112`, `:161`). Each row: name, kind · list/segment · sent/sends-on date, click-rate bar plus "N sent", status badge, «Open»
  - Empty: `common.none`
  - Right column: «Lifecycle coverage» list (onboarding, trialEnding, readOnly, winBack, newsletter) (`:118-142`) and «House rules» (trigger, clicks, one, suppression) (`:143-152`)
- Only `step_kind === 'mail'` rows are listed (`:29`).
- **Reads**: `crmCampaigns` → `admin_crm_campaigns` (`LA/crm.ts:152`; SQL `0137_crm_win_rate_steps.sql:538`), `crmSegments`.
- **Writes**: `createCampaign` (via dialog) → `admin_crm_campaign_save` with `p_id null`, then redirect to `/admin/crm/campaigns/{id}` (`LA/crmActions.ts:198-216`).
- **Oddity**: the doc comment says lifecycle coverage is "read from the campaigns and the product's own trial mail (0060), never ticked by hand" (`:12-16`). In code, onboarding, trialEnding and readOnly are **always** `{state: builtIn, tone:'green'}` (`:46-48`). Nothing is read for them. winBack is inferred from segments whose filter includes the type `former` (`:41-43`).

### 3.10 `/admin/crm/campaigns/[id]`: campaign or step detail (`CRM/campaigns/[id]/page.tsx:1-362`)
- **Reads**: `crmCampaign(id)` → `admin_crm_campaign` (`LA/crm.ts:236-251`; SQL `0056_crm_pipeline.sql:1306`). Also `crmSegments`, `crmLists`, `whoami`, `crmStages`, `crmSenders` → `admin_crm_senders`, `crmCampaigns`, `crmSequence(id)` → `admin_crm_sequence` (`LA/crm.ts:233`), `mailCatalogue()` (`LA/campaignMail.ts:21-24`). For drafts: `domainChecks` (live DNS) (`LA/mailDomain.ts:34-58`). For non-drafts: `inboxCheck` (`LA/campaignMail.ts:82-103`).
- **Branch A, call/LinkedIn step** (`step_kind !== 'mail'`) (`:57-112`): head with parent link. Step card: `StepForm` while draft (canWrite). Send card: `StepActions` (arm/cancel). Tasks card: made/open/done/skipped Stats and a link to `/admin/crm/tasks`. Sequence card: `SequenceSteps`.
- **Branch B, mail campaign** (`:114-361`):
  - Non-draft report header: audience; sent (queued); delivered/open/click/CTOR/unsub/bounce rates against a benchmark of the last N campaigns (`vs`) (`:138-149`, `:178-186`); a `Funnel` (`CA/CampaignFunnel.tsx:9-39`); the open note or "no benchmark" (`:190`).
  - Draft with canWrite: **CampaignStudio** (`:194-208`).
  - A/B table: variant, subject, sent, opened %, clicked %, winner badge, "deciding at" (`:212-233`).
  - Link click map: URL, utm_content, unique clicks, share of opens (`:235-248`).
  - 72-hour timeline bar strips (opens `#E0A21F`, clicks `#5C9A55`, inline hex colours) with a details table (`:153-167`, `:250-274`).
  - Pipeline card: `CampaignPipelineForm` (draft and canWrite), otherwise a summary list (target stage, on-send stage, sender, follows plus days, follow-when, auto) (`:276-294`).
  - Sequence card: `SequenceSteps`, `ResendForm` (canWrite, not cancelled), and «add a call/LinkedIn step» `StepForm follows` (`:295-311`).
  - «content locked» card when not a draft (`:312-316`).
  - Send card (canWrite): scheduled-for line, tests count `crm.campaign.tests`, and `CampaignActions` (test / schedule datetime / now / unschedule or cancel) (`:317-325`).
  - Site card: web sessions, views, signups and paid on the utm_campaign, plus the web archive link `/nyhetsbrev/arkiv/{slug}` (`:326-340`).
  - Preview card (non-draft): `MailPreview` and `InboxCheck` (`:342-358`).
- **Writes**:
  - `saveCampaign` → `admin_crm_campaign_save` (`LA/crmActions.ts:218-273`)
  - `campaignAction`: test → `admin_crm_campaign_test`; cancel → `admin_crm_campaign_cancel`; schedule/now → `blockingChecks(id)` and then `admin_crm_campaign_schedule` (`:294-316`)
  - `saveCampaignPipeline` → `admin_crm_campaign_pipeline` (`:547-575`)
  - `resendCampaign` → `admin_crm_campaign_resend` (`:578-589`)
  - `saveStep` → `admin_crm_step_save` (`:638-659`)
  - `stepAction`: arm → `admin_crm_campaign_schedule(now)`; cancel → `admin_crm_campaign_cancel` (`:662-674`)
- **Hard-coded text**: `"A: {subject} · B: {subject_b}"` (`:346`), the visible link text `orgpuls.com/nyhetsbrev/arkiv/{slug}` (`:336`), the `' pts'` suffix in the benchmark delta (`:149`), sender fallback `'Orgpuls'` (`:347`), and `+{h}–{h+1}` hours (`:265`).
- **Tests**: `tests/unit/campaign-design.test.ts:37-190` (rendering, inbox check), `tests/unit/mail.test.ts:404-535` (renderCampaign, test-send subject, opt-in), SQL `crm_designed_mail_invariants.sql`, `crm_sequences_invariants.sql`, `crm_win_rate_invariants.sql`, `crm_pipeline_invariants.sql` (A/B, archive).

### 3.11 `/admin/crm/journeys` (`CRM/journeys/page.tsx:1-132`)
- **Renders**:
  - PageHead lead (active count, waiting) and «new» `NewCampaignDialog` (canWrite) (`:35-37`)
  - Journey cards linking to `/admin/crm/campaigns/{id}`: name, status badge (active/draft/done/cancelled), "enrolls stage · N mails · N tasks · goal stage", In journey, Completed, and a «reached goal» % bar (`:40-79`)
  - Empty: dashed `none/noneLead` (`:80-85`)
  - Right: «by stage», listing each open/won stage with its journeys or `noJourney` (`:87-105`)
  - «Design principles» p1–p4, rich text from messages, with a disclaimer about what is not built (`:106-118`)
- **Reads**: `crmJourneys` → `admin_crm_journeys` (`LA/crm.ts:476`; SQL `0137_crm_win_rate_steps.sql:475`, **no admin_log**), `crmStages`.
- **Writes**: only `createCampaign` through the dialog. There is no journey-specific editor: a journey is a campaign chain.
- **Test**: `supabase/tests/crm_journeys_invariants.sql`.

### 3.12 `/admin/crm/tasks` (`CRM/tasks/page.tsx:1-150`)
- **Renders**:
  - PageHead lead (open, due today, on SLA, automated) and «New task» `NewTask` dialog (company select, body, due) (`:56-63`; `CA/TaskForms.tsx:38-99`)
  - View segments open/done/all (`?view=`) (`:66-69`)
  - Rows (`:81-142`): a priority dot (peach if `sla_due_at`) and a kind chip (call/linkedin/email/letter). The title is either the body or a worded auto-task. The sub-line is one of done/skipped/stopped date, «from journey» link, auto-source text, or manual. Then contact or manager · company link, due (late in red; «SLA» variant plus `StatusChip` minutes left/over/met/missed), owner avatar, and «Mark done» / «Skip» buttons.
  - Empty: `empty.{view}` (`:144`)
- **Reads**: `crmTaskList(view)` → `admin_crm_task_list` (`LA/crm.ts:517-527`; SQL `0143_growth_crm.sql:1434`), `crmCompanies(null,null)` (for the NewTask company select, capped at 500).
- **Writes**:
  - `toggleTask` → `admin_crm_task_done`
  - `skipTask` → `admin_crm_task_skip` (`LA/crmActions.ts:615-625`)
  - `logActivity` with `kind=task` (NewTask) (`CA/TaskForms.tsx:46-50`, `:58`)
- **searchParams**: `view` is whitelisted against `TASK_VIEWS` (`:38`).
- **Note**: the "priority" dot is derived, because the schema has no priority (`:27-28`).
- **Tests**: `tests/unit/growth-crm.test.ts:214-245` (SLA wording, auto-task key), SQL `growth_crm_invariants.sql`.

### 3.13 `/admin/crm/inbox` (`CRM/inbox/page.tsx:1-109`)
- **Renders**:
  - PageHead lead with SLA minutes (`:38`)
  - Stats: awaiting, median first response (`'N min'` / `'N.N h'`, hard-coded units), % within SLA (`within/answered`), leads, trials (`:40-46`)
  - Filter chips all/awaiting/trials/answered (`?show=`) (`:48-59`)
  - Lead rows: kind badge (trial/contact_form/demo), company or person link (CRM company or contact), sub-line, a live `LeadClock` (ticks every 1 s) (`CA/CrmBoard.tsx:22-45`), and a «Respond» link (`:61-98`)
  - Empty: `zero`/`none`
  - How-it-works note (`:99`)
  - SLA form (canWrite) (`:101-106`)
- **Reads**: `crmInbox(30)` → `admin_crm_inbox` (`LA/crm.ts:282-292`; SQL `0112_crm_board_inbox.sql:117`). Leads are trial sign-ups and contacts with `source in ('contact_form','demo')` (`0112_crm_board_inbox.sql:140-146`).
- **Writes**: `saveSla` (1..1440) → `admin_crm_sla` (`LA/crmActions.ts:452-461`).
- **Note**: there is **no message content** in the inbox, by design (`:15-19`). Replying happens elsewhere: logging an activity on the company.
- **Test**: `supabase/tests/crm_inbox_invariants.sql`.

### 3.14 `/admin/crm/scoring`: lead scoring (`CRM/scoring/page.tsx:1-171`)
- **Renders**:
  - PageHead lead (hot, nurture, trial) (`:64`)
  - Table: contact (initials, name, company · stage · brreg NACE/employees), Fit/Intent bars "n/50", «why» (strongest signals), route chip (total · founder/pql/trial/nurture), «Open» → `/admin/crm/contacts/{id}` (`:74-135`). Empty: `none`.
  - Right: fit rules with points, intent rules with points (unsourced ones shown as «no source yet» plus a cap note), and a routing rich-text box (`:137-167`)
- **Reads**: `leadScores()` → `admin_lead_scores` (`LA/growthCrm.ts:177-187`; SQL `0143_growth_crm.sql:1407`). Rows are contacts of companies in a `lead`/`trial` stage. Fit parts: industry, size, crossed, manager, active. Intent parts: tool, pdf, pricing, industry_twice, webinar, hand_raise (`LA/growthCrm.ts:153-174`).
- **Writes**: none. **No page-level role check** beyond the DB (it is not in `GROWTH_VIEWS`).
- **Data source of hand-raise**: demo requests, or tickets with channel `contact_form` and category `sales`, in the last 90 days (`0143_growth_crm.sql:793-797`). Route `founder` applies when total ≥ `founder_min` or there is a hand-raise (`:811-814`).
- **Tests**: `tests/unit/growth-crm.test.ts:192-245`, SQL `growth_crm_invariants.sql`.

### 3.15 `/admin/crm/templates`: template gallery (`CRM/templates/page.tsx:1-82`)
- **Renders**: category chips (`?category=`) with counts (`:47-50`) and a placeholders note. For each template card: name, category badge, style badge (branded/letter), description, a compact `MailPreview` rendered by the dispatcher's renderer for a sample reader, block count, a «placeholder left» note, and `TemplateStart` (canWrite) (`:52-79`).
- **Reads**: `crmTemplates` → `admin_crm_templates` (`LA/crm.ts:426`; SQL `0056_crm_pipeline.sql:1169`, no log), `mailCatalogue`.
- **Writes**: `TemplateStart` → `createCampaign` with `template_key`, `lang='no'` (hidden) (`CA/CrmPipelineForms.tsx:665-681`).
- **Categories**: newsletter, product, event, sales, customer (`LA/crm.ts:26`). Ten templates exist per the SQL test header (`supabase/tests/crm_pipeline_invariants.sql:6`).

### 3.16 `/admin/crm/stages`: stages, reply stage, sending, senders (`CRM/stages/page.tsx:1-114`)
- **Renders**:
  - Stage table: badge, key, managed/archived notes, inline «edit» `<details>` with `StageForm`; kind, order, companies, campaigns. Add form (`:28-60`).
  - «Reply moves to» card with `ReplyStageForm` or read-only (`:62-69`).
  - Sending card: sent today, inside/outside business hours, `DailyCapForm` (1..5000 or empty) (`:71-80`).
  - Senders table: name/archived/edit, email, reply-to, campaigns. Add `SenderForm` (`:82-111`).
- **Reads**: `crmStages`, `crmSenders`, `whoami`, `crmSending` → `admin_crm_sending` (`LA/crm.ts:235`).
- **Writes**:
  - `saveStage` → `admin_crm_stage_save`, with key regex, name 1..60, sort 0..9999, kind open/won/lost/parked, archived, exit criterion ≤200 (`LA/crmActions.ts:423-449`)
  - `saveReplyStage` → `admin_crm_reply_stage` (`:513-519`)
  - `saveDailyCap` → `admin_crm_daily_cap` (`:592-599`)
  - `saveSender` → `admin_crm_sender_save` (`:522-544`)
- **Oddity**: `StageForm` duplicates `STAGE_KINDS` client-side because `lib/admin/crm` is server-only (`CA/CrmStageForms.tsx:21-22`).
- **Tests**: `supabase/tests/crm_stages_invariants.sql`, `crm_sequences_invariants.sql` (daily cap).

### 3.17 `/admin/crm/consent`: consent ledger (`CRM/consent/page.tsx:1-210`)
- **Guard**: `mayOpenGrowthView(who?.role,'crmConsent')`, otherwise notAllowed (`:44-45`).
- **Renders**:
  - Head buttons (canWrite): «Export ledger (CSV)» (a plain `<a download>` to `/admin/crm/consent/export`), `PhoneNoticeDialog`, `AddSuppressionDialog` (`:74-99`)
  - KPIs: marketing contacts (% with any record), DOI confirmed %, withdrawn 30d, sunset (no click in 180d) (`:102-107`)
  - Ledger: the 20 latest records with who, purpose · channel, basis/method, DOI text, status chip, «Open» (contact or company) (`:110-155`)
  - Preference centre: per purpose, granted count and DOI share (`:158-176`)
  - Suppression: hash head…tail, reason, day; total count; footer (`:178-194`)
  - The law: three rich paragraphs (`:196-205`)
- **Reads**: `consentLedger()` → `admin_consent` (`LA/growthCrm.ts:39-58`; SQL `0143_growth_crm.sql:1053`, log `crm.consent_view`).
- **Writes**:
  - `addSuppression` (email, reason ∈ unsubscribed/hard_bounce/spam/erased/manual) → `admin_crm_suppress` (`LA/growthCrmActions.ts:31-39`)
  - `recordPhoneNotice` (org number 9 digits, notice/objected) → `admin_consent_phone_notice` (`:41-52`)
- **i18n**: `growth.g3.consent.*` (103 keys), `growth.view.crmConsent.*`, `growth.g3.*` common.
- **Tests**: `supabase/tests/consent_ledger_invariants.sql`, `growth_crm_invariants.sql`.

### 3.18 `/admin/crm/consent/export`: CSV route handler (`CRM/consent/export/route.ts:1-30`)
- `GET` → `consentExport()` → `admin_consent_export` (`LA/growthCrm.ts:77`; SQL `0143_growth_crm.sql:1109`, **crm_can_write**, logs `crm.consent_export` with record count, `:1127`).
- On error it returns status 403 or 500 with a translated text (`:20`).
- Columns: id, at, email, name, company, org_number, purpose, status, basis, method, doi_sent_at, doi_confirmed_at, by (`:15`). Headers are translated through `admin.growth.g3.consent.csv.*`. Cells use `csvCell` (formula-safe) (`:21-22`). Output is a UTF-8 BOM with CRLF, `no-store` (`:23-29`).
- There is **no page-level role check** in the handler itself. It relies on the DB.

### 3.19 `/admin/crm/triggers`: Brønnøysund triggers (`CRM/triggers/page.tsx:1-232`)
- **Guard**: `mayOpenGrowthView(...,'crmTriggers')` (`:38-39`).
- **Renders**:
  - Lead: a dry-run chip, last poll time, failed attempt plus error code, pending (`:55-71`)
  - canWrite: `EditTriggersDialog` (read-only rules, dry-run/live select, reason) and `RunPollButton` (`:76-104`)
  - KPIs: changes, matched (≥fit min), queued (held out), DNC (purged) (`:107-112`)
  - Outreach queue table: company/org number, trigger kind, employees from→to · NACE, fit, channel, status (`:115-167`). Empty `CardEmpty`.
  - Triggers by kind (`:170-192`)
  - Results per 100 contacts by channel vs holdout (`:194-215`)
  - Guardrails (`:217-227`)
- **Reads**: `brregTriggers()` → `admin_brreg_triggers` (`LA/growthCrm.ts:97-126`; SQL `0143_growth_crm.sql:1214`, no log).
- **Writes**: `setDryRun` → `admin_brreg_set_dry_run` (`LA/growthCrmActions.ts:55-66`). `runPollNow` → `admin_brreg_poll_now` (`:68-72`).
- **Tests**: `tests/unit/growth-crm.test.ts:29-190`, SQL `growth_crm_invariants.sql`.

### 3.20 `/admin/crm/partners` (`CRM/partners/page.tsx:1-179`)
- **Guard**: `mayOpenGrowthView(...,'crmPartners')` (`:39-40`).
- **Renders**:
  - «Add partner» `PartnerDialog` (canWrite) (`:86-88`)
  - KPIs: active (pilot_signed), partner trials 30d, this week, «Revenue share» (`:91-96`)
  - Partner table: name/kind/contact, code (the path column is always a dash), trials 30d, share, status chip, «Open» dialog (`:99-147`). Empty `CardEmpty`.
  - Kit list: 7 items, each «live» or «planned» (`:151-163`)
  - «who» cards: accountants/bht/hms/bransje rich text (`:165-174`)
- **Reads**: `crmPartners()` → `admin_crm_partners` (`LA/growthCrm.ts:129-150`; SQL `0143_growth_crm.sql:1331`, no log).
- **Writes**: `savePartner` → `admin_crm_partner_save`. Fields: name 2..200, org (9 digits), kind ∈ accounting/bht/hms/bransje, contact, code `[A-Z0-9]{2,20}`, share kind/pct 1..50 (percent only for percentage kinds), status ∈ in_talks/kit_sent/pilot_signed/member_offer_drafted/phase_2 (`LA/growthCrmActions.ts:75-126`).
- **Stub/hard-coded**: the «Revenue share» KPI value is the message string `'20 %'` (`growth.g3.partners.kpi.shareValue`), not data (`:95`). The KIT list is a hard-coded constant, and all items except `code` are always «planned» (`:27`, `:56`; the comment at `:18-26` admits it is interim).

---

## 4. Server actions & route handlers

### 4.1 Admin CRM actions: `lib/admin/crmActions.ts` (`'use server'`)
Shared helper `rpc()`: `supabase.rpc`, then a `{ok,error}` parse, returning `AdminResult & {data}` (`:21-29`). `AdminResult = {ok:true,message?}|{ok:false,problem}` (`LA/actions.ts:34`). The file comment says the DB decides who may act and logs each call (`:15-18`). **No action checks the role itself**: the RPCs do (`crm_can_write`), and the audit is written inside the RPC (§4.3).

| Action | Lines | Input / Zod | RPC | Return / side effects |
|---|---|---|---|---|
| `saveContact` | 40-75 | FormData. id uuid?; tags ≤20 matching `TAG` regex (`:37`); role ∈ CONTACT_ROLES; name ≤120, company ≤200, org_number ≤20, lang no/en; company_id uuid?; for new contacts: email ≤254, consent_source ≤200, consent_at, source=event (manual slicing, partial Zod) | `admin_crm_save_contact` | revalidates; new contact redirects to `/admin/crm/contacts/{id}` unless `stay=1` |
| `contactAction` | 77-88 | `{id uuid, action unsubscribe/erase, reason 5..500}` | `admin_crm_contact_action` | erase redirects to the list |
| `importContacts` | 107-123 | array 1..5000 of `ImportRow` (`:94-104`), parsed in the browser by `lib/csv/parse` | `admin_crm_import` | `{inserted,updated,suppressed,rejected[]}` |
| `saveCrmSettings` | 125-133 | `{on bool, reason 5..500}` | `admin_crm_settings` (super_admin only in DB) | |
| `saveSegment` | 158-167 | `Filter.strict()` via `filterOf` (`:136-156`); name not validated in TS | `admin_crm_segment_save` | redirect |
| `previewSegment` | 173-186 | Filter | `admin_crm_segment_preview` | `{total, mailable, sample[]}` |
| `deleteSegment` | 188-195 | id uuid | `admin_crm_segment_delete` | redirect |
| `createCampaign` | 198-216 | `{name 1..120, kind?, lang, template_key?}` | `admin_crm_campaign_save(p_id null)` | redirect to the new campaign |
| `saveCampaign` | 218-273 | full Zod incl. `blocks: Block[] ≤30`, ab_percent 10..50, ab_wait_hours 1..48, subject ≤150, preheader ≤200, slug ≤80 | `admin_crm_campaign_save` | |
| `campaignAction` | 294-316 | `{id, action test/schedule/now/cancel, at ≤20}`; `osloToIso` (`:276-292`) | `admin_crm_campaign_test` / `_cancel` / (`blockingChecks`, then) `_schedule` | test returns `message = to` address; `inbox_blocked` when a check fails |
| `saveCompany` | 321-374 | name 1..200, org_number, employees ≤7 chars, municipality, website, phone, owner uuid?, next_step ≤300, next_step_at date, stage StageKey?, lost_reason ≤300, value_nok `\d{1,9}`; tags | `admin_crm_company_save` | new company redirects to the company page |
| `logActivity` | 376-401 | `{company uuid, contact uuid?, kind ∈ ACTIVITY_KINDS, body 1..4000, due date?}` | `admin_crm_activity` | |
| `moveStage` | 406-420 | `{ids uuid[1..500], to StageKey?}` | `admin_crm_stage_move` | message `"moved:skipped"` |
| `saveStage` | 423-449 | see §3.16 | `admin_crm_stage_save` | |
| `saveSla` | 452-461 | int 1..1440 | `admin_crm_sla` | |
| `moveCard` | 464-473 | `{id, to}` (plain args, not FormData) | `admin_crm_stage_move` | `not_moved` if 0 moved |
| `saveDeal` | 479-510 | id, value_nok, next_step, next_step_at, owner, stage | `admin_crm_company_save`, then `admin_crm_stage_move` | |
| `saveReplyStage` | 513-519 | StageKey | `admin_crm_reply_stage` | |
| `saveSender` | 522-544 | name 1..80, email, reply_to (email), signature ≤200, archived | `admin_crm_sender_save` | |
| `saveCampaignPipeline` | 547-575 | stage_target, stage_on_send, sender_id, follows_id, follow_days `\d{1,2}`, follow_when, follow_auto | `admin_crm_campaign_pipeline` | |
| `resendCampaign` | 578-589 | `{id, days 1..60}` | `admin_crm_campaign_resend` | redirect to the new draft |
| `saveDailyCap` | 592-599 | '' or 1..5000 | `admin_crm_daily_cap` | |
| `toggleTask` | 601-612 | id, company uuid | `admin_crm_task_done` (toggles) | |
| `skipTask` | 615-625 | id, company | `admin_crm_task_skip` | |
| `saveStep` | 638-659 | `StepInput` (`:628-635`) | `admin_crm_step_save` | redirect for a new step |
| `stepAction` | 662-674 | `{id, arm/cancel}` | `admin_crm_campaign_schedule(now)` / `_cancel` | |
| `findInRegistry` | 681-698 | `SearchInput` (`LA/brreg.ts:41`) | external `data.brreg.no` (`LA/brreg.ts:53-61`), then `admin_crm_known_orgnrs`, then the roles API (`LA/brreg.ts:155-158`) | hits with known/manager |
| `importCompanies` | 724-738 | array 1..200 of `CompanyRow` (`:702-715`), tag | `admin_crm_company_import(p_source 'brreg')` | `{added,known,business,managers}` |
| `refreshManagers` | 746-764 | none; up to 100 oldest from `crmCompanies` | `admin_crm_company_import` | |
| `saveList` | 767-794 | see §3.7 | `admin_crm_list_save` | redirect |
| `addToList` | 796-806 | `{list, contact uuid, source 3..200}` | `admin_crm_list_add` | `not_consented` if 0 added |
| `removeFromList` | 808-816 | `{list, contact, reason 5..500}` | `admin_crm_list_remove` | |

### 4.2 Growth-phase CRM actions: `lib/admin/growthCrmActions.ts` (`'use server'`)
| Action | Lines | Zod | RPC |
|---|---|---|---|
| `addSuppression` | 31-39 | email ≤254, reason enum | `admin_crm_suppress` (the address is hashed in the DB, per the comment at `:9-13`) |
| `recordPhoneNotice` | 41-52 | org 9 digits, outcome notice/objected | `admin_consent_phone_notice` |
| `setDryRun` | 55-66 | `on 'true'/'false'`, reason ≤300 | `admin_brreg_set_dry_run` |
| `runPollNow` | 68-72 | none | `admin_brreg_poll_now` |
| `savePartner` | 75-126 | see §3.20 | `admin_crm_partner_save` |

### 4.3 RPC → DB role check → audit action (latest definition per scripted scan of `supabase/migrations/`)
R = `crm_can_read` (super_admin, marketing, analyst). W = `crm_can_write` (super_admin, marketing).

| RPC | Defined at (start) | Check | `admin_log` action |
|---|---|---|---|
| admin_crm_contacts | 0055_crm.sql:526 | R | crm.contacts |
| admin_crm_contact | 0055_crm.sql:556 | R | crm.contact |
| admin_crm_contact_action | 0055_crm.sql:721 | W | crm.contact_<action> |
| admin_crm_segments | 0055_crm.sql:768 | R | crm.segments |
| admin_crm_segment_preview | 0055_crm.sql:784 | R | — |
| admin_crm_segment_save | 0055_crm.sql:803 | W | crm.segment_save |
| admin_crm_segment_delete | 0055_crm.sql:833 | W | crm.segment_delete |
| admin_crm_campaign_test | 0055_crm.sql:978 | W | crm.campaign_test |
| admin_crm_campaign_schedule | 0055_crm.sql:1005 | W | crm.campaign_schedule |
| admin_crm_campaign_cancel | 0055_crm.sql:1035 | W | crm.campaign_cancel |
| admin_crm_companies | 0056_crm_pipeline.sql:826 | R | crm.companies |
| admin_crm_tasks | 0056_crm_pipeline.sql:1065 | R | — |
| admin_crm_lists | 0056_crm_pipeline.sql:1080 | R | crm.lists |
| admin_crm_list_save | 0056_crm_pipeline.sql:1104 | W | crm.list_save |
| admin_crm_list_add | 0056_crm_pipeline.sql:1143 | W | crm.list_add |
| admin_crm_templates | 0056_crm_pipeline.sql:1169 | R | — |
| admin_crm_campaign | 0056_crm_pipeline.sql:1306 | R | crm.campaign |
| admin_crm_overview | 0056_crm_pipeline.sql:1374 | R | crm.overview |
| admin_crm_save_contact | 0058_crm_admin_helpers.sql:9 | W | crm.contact_create / crm.contact_update |
| admin_crm_list_remove | 0058_crm_admin_helpers.sql:83 | W | crm.list_remove |
| admin_crm_known_orgnrs | 0058_crm_admin_helpers.sql:102 | R | — |
| admin_crm_campaign_save | 0059_attribution_server.sql:282 | W | crm.campaign_save |
| admin_crm_senders | 0093_crm_stages.sql:261 | R | — |
| admin_crm_sender_save | 0093_crm_stages.sql:281 | W | crm.sender_save |
| admin_crm_stage_move | 0093_crm_stages.sql:140 | W | crm.stage_move |
| admin_crm_activity | 0093_crm_stages.sql:544 | W | crm.activity_add |
| admin_crm_campaign_pipeline | 0111_crm_sequences.sql:100 | W | crm.campaign_pipeline |
| admin_crm_daily_cap | 0111_crm_sequences.sql:248 | W | crm.daily_cap |
| admin_crm_sending | 0111_crm_sequences.sql:265 | R | — |
| admin_crm_stages | 0112_crm_board_inbox.sql:37 | R | — |
| admin_crm_stage_save | 0112_crm_board_inbox.sql:55 | W | crm.stage_create / crm.stage_update |
| admin_crm_sla | 0112_crm_board_inbox.sql:99 | W | crm.sla |
| admin_crm_inbox | 0112_crm_board_inbox.sql:117 | R | crm.inbox |
| admin_crm_company_save | 0119_crm_deal_value.sql:23 | W (and R) | crm.company_create / crm.company_update |
| admin_crm_owners | 0119_crm_deal_value.sql:119 | R | — |
| admin_crm_pipeline_summary | 0137_crm_win_rate_steps.sql:98 | R | — |
| admin_crm_step_save | 0137_crm_win_rate_steps.sql:268 | W | crm.step_create / crm.step_save |
| admin_crm_campaign_resend | 0137_crm_win_rate_steps.sql:330 | W | crm.campaign_resend |
| admin_crm_task_skip | 0137_crm_win_rate_steps.sql:381 | W | crm.task_skip |
| admin_crm_sequence | 0137_crm_win_rate_steps.sql:433 | R | — |
| admin_crm_journeys | 0137_crm_win_rate_steps.sql:475 | R | — |
| admin_crm_campaigns | 0137_crm_win_rate_steps.sql:538 | R | crm.campaigns |
| admin_crm_company_import | 0141_growth_foundations.sql:961 | W | crm.company_import |
| admin_crm_import | 0141_growth_foundations.sql:1057 | W | crm.import |
| admin_consent | 0143_growth_crm.sql:1053 | R | crm.consent_view |
| admin_consent_export | 0143_growth_crm.sql:1109 | W | crm.consent_export |
| admin_crm_suppress | 0143_growth_crm.sql:1132 | W | crm.suppress |
| admin_consent_phone_notice | 0143_growth_crm.sql:1163 | W | crm.phone_notice |
| admin_brreg_triggers | 0143_growth_crm.sql:1214 | R | — |
| admin_brreg_poll_now | 0143_growth_crm.sql:1303 | W | crm.brreg_poll (and crm.brreg_requeue) |
| admin_crm_partners | 0143_growth_crm.sql:1331 | R | — |
| admin_crm_partner_save | 0143_growth_crm.sql:1359 | W | crm.partner_save |
| admin_lead_scores | 0143_growth_crm.sql:1407 | R | crm.lead_scores |
| admin_crm_task_list | 0143_growth_crm.sql:1434 | R | crm.task_list |
| admin_crm_task_done | 0143_growth_crm.sql:1488 | W | crm.task_done |
| admin_crm_company | 0143_growth_crm.sql:1511 | R | crm.company |
| admin_brreg_set_dry_run | 0145_brreg_settings_where.sql:38 | W | crm.brreg_dry_run |
| admin_crm_settings | 0145_brreg_settings_where.sql:65 | super_admin only | crm.settings |
| admin_crm_reply_stage | 0145_brreg_settings_where.sql:83 | W | crm.reply_stage |

Reads with no `admin_log` (scan): segment_preview, tasks, templates, known_orgnrs, senders, sending, stages, owners, pipeline_summary, sequence, journeys, brreg_triggers, partners. This contradicts the header claim that every read "writes an audit row" (`LA/api.ts:17-22`, `LA/crm.ts:6-9`).

### 4.4 Route handlers in CRM scope
- `CRM/consent/export/route.ts` `GET` (§3.18). It is the only route handler under `CRM/`.

---

## 5. Public CRM entry points

| Entry | File | What it does | RPC |
|---|---|---|---|
| Newsletter signup page `/nyhetsbrev` | `app/(marketing)/nyhetsbrev/page.tsx:21-81` | Signup form with public lists (default `nyhetsbrev`). `?t=` shows a confirm button (`TokenAction`) | reads `crm_public_lists` (`lib/crm/read.ts:21-28`) |
| Signup action | `lib/crm/actions.ts:28-47` | Zod: mail, name ≤120, company ≤200, lang, source `newsletter`/`contact_form`, trap (honeypot), lists `[a-z0-9-]{2,40}` ≤20 (`:16-24`) | `crm_newsletter_signup` (latest at `0056_crm_pipeline.sql:421`); the same answer whether the address is new or known (`:7-11`) |
| Confirm (double opt-in) | `lib/crm/actions.ts:49-62`; UI `components/site/NewsletterForms.tsx:145-191` | token `[0-9a-f]{64}`, needs a button press (anti link-scanner) | `crm_confirm` (`0141_growth_foundations.sql:1225`) |
| Unsubscribe (server action) | `lib/crm/actions.ts:64-66` | token | `crm_unsubscribe` (`0141_growth_foundations.sql:1297`). **Appears unused**: `TokenAction` is used only with `action="confirm"` (`app/(marketing)/nyhetsbrev/page.tsx:39`) |
| Preference centre `/avmeld` | `app/(marketing)/avmeld/page.tsx:21-64`; UI `components/site/NewsletterForms.tsx:225-295` | Shows lists ticked per subscription, «leave all». Nothing changes until a press | reads `crm_preferences` (`lib/crm/read.ts:39-47`); writes `crm_set_preferences` through `savePreferences` (`lib/crm/actions.ts:69-79`; SQL `0141_growth_foundations.sql:1252`) |
| One-click unsubscribe API `/api/avmeld` | `app/api/avmeld/route.ts:15-32` | RFC 8058. POST `?t=` calls `crm_unsubscribe` with the anon client and always returns 200. GET redirects 303 to `/avmeld?t=` | `crm_unsubscribe` |
| Contact form `/kontakt` | `components/site/ContactBlock.tsx:40-176`, action `app/(marketing)/kontakt/actions.ts:22-43` | Files a **ticket** (`submit_contact`, topic → queue support/sales/support/personvern, `0051_tickets.sql:282-320`). With the opt-in box ticked, it also calls `signUpNewsletter(source:'contact_form')` (`ContactBlock.tsx:95`) | `submit_contact`, `crm_newsletter_signup` |
| Demo request | `lib/demo/actions.ts:42-80` | `demo_request` RPC. Once the address is proved, `app.demo_lead` upserts a `crm_contacts` row `source='demo'`, tag `demo`, basis consent only if the box was ticked (`0146_demo_signup.sql:90-119`) | `demo_request` |
| Newsletter archive `/nyhetsbrev/arkiv` and `/[slug]` | `app/(marketing)/nyhetsbrev/arkiv/page.tsx:22-73`, `.../[slug]/page.tsx:34-92` | Public web versions of campaigns with `publish_web` | `crm_archive`, `crm_archive_item` (`lib/crm/read.ts:60-92`) |
| Web beacon `/api/wv` | `app/api/wv/route.ts:37-77` | Analytics. Carries utm and campaign labels used by the campaign «Site» card and partner `ref` attribution | `track_web_event` |
| Mail event webhook | `supabase/functions/orgpuls-mail-events/index.ts:1-25`, `:156-172` | Brevo events go first to `record_crm_event` (delivery, bounces that suppress, opens, clicks with link path and utm_content; Apple proxy opens excluded), and otherwise to `record_mail_event` | `record_crm_event`, `record_mail_event` |

Search scope: `app/r`, `app/s`, `app/inn` have no CRM, newsletter or consent file (find/grep over `app` matched only the files above).

---

## 6. Jobs & sending

- **There is no Vercel cron.** `vercel.json` holds only the framework and region `fra1` (`vercel.json:1-7`). There is no `app/api/cron` (`app/api` has avmeld, i18n, sprak, wv).
- **Dispatcher** `supabase/functions/orgpuls-dispatch/index.ts`. pg_cron calls it every 5 minutes (`supabase/migrations/0032_dispatch.sql:292`, header `index.ts:1-7`).
  - The marketing section is at `index.ts:741-809`. It sends only if a marketing sender (`ORGPULS_MARKETING_FROM`) exists and Brevo reports its domain as authenticated (`:745-754`).
  - Loop: `crm_mail_claim(p_batch)`, then render (`renderOptin` / `renderCampaign` from `supabase/functions/_shared/mail.ts`), then `brevoSend`. Sender: the campaign's sender if on the marketing domain, otherwise refused permanently with `sender_domain` (`:766-773`). Tags `orgpuls-optin` / `orgpuls-crm-test` / `orgpuls-crm`. Headers `List-Unsubscribe` and `List-Unsubscribe-Post`. Results go back through `crm_mail_done` (`:756-799`).
- **The claim does the scheduling** (`crm_mail_claim`, latest `0137_crm_win_rate_steps.sql:560`). It:
  - starts due `scheduled` campaigns
  - splits an A/B test audience
  - adds automatic follow-ups in business hours (`app.crm_business_hours()`)
  - makes call/LinkedIn step tasks (`app.crm_step_tasks`)
  - finishes steps
  - decides A/B winners after `ab_wait_hours`
  - marks campaigns sent
  - applies the **daily cap** (tests and confirmations are exempt)
  - leases rows (scan of `0137_crm_win_rate_steps.sql:556-716`)
- **Other DB crons touching the CRM**:
  - `orgpuls-brreg-triggers` daily at 03:10 → `app.brreg_cron()` (`0143_growth_crm.sql:750`), with edge function `supabase/functions/orgpuls-brreg-triggers/index.ts` (264 lines, not read in full)
  - `orgpuls-lead-route` every 5 min → `app.lead_route()`, which makes founder/PQL tasks (`0143_growth_crm.sql:887`)
  - `orgpuls-wheel` hourly, which now also runs `app.growth_tick()` (`0141_growth_foundations.sql:549`)
- **Pre-send inbox check**: `checkCampaign` is pure (`lib/crm/deliverability.ts:65-139`, blocking at `:142`). It runs client-side in the studio (`CA/CampaignStudio.tsx:470-484`) and server-side before scheduling (`LA/crmActions.ts:306-309` → `LA/campaignMail.ts:106-113`). Sending-domain DKIM, DMARC and SPF are checked through public DNS with a 10-minute cache (`LA/mailDomain.ts:18-58`).
- `lib/crm/deliverability.ts:134-137` always reports `unsubscribe`, `plain_text` and `suppression` as `pass` (asserted true of every dispatcher mail).

---

## 7. Feature set as built

### Contacts
- **Fields**: id, email, name, company, org_number, org_id/org_name, role ∈ daglig_leder/hr/leder/verneombud/annet, source (string; TS enum user/newsletter/contact_form/import/manual/event/brreg, and the DB also writes `demo`), basis ∈ consent/customer/business/none, status ∈ pending/active/unsubscribed, type ∈ prospect/trial/customer/former (derived by `app.crm_type`), mailable, suppressed, consent_at, consent_source, tags[], lang, last_engaged_at, created_at, company_id?, lists[]? (`LA/crm.ts:13-16`, `:32-55`).
- **List**: search plus type filter, limit 300 (`LA/crm.ts:74-75`).
- **Detail**: timeline of every send (§3.6).
- **Create/edit**: `saveContact`.
- **CSV import**: up to 5000 rows. Columns email, name, company, org_number, role, tags, consent_source, consent_at, lang (`CA/CrmForms.tsx:167`; `LA/crmActions.ts:94-123`).
- **Unsubscribe-on-behalf** and **erase** require a reason.
- **Sync** of signed-in users into contacts (`app.crm_sync`, called in reads, e.g. `0056_crm_pipeline.sql:835`). Respondents are never contacts (`supabase/tests/crm_invariants.sql:1-6`).
- **Not present**: custom fields, a phone field on the contact, owner per contact, a notes field on the contact (activities hang off companies), merge/dedupe UI, CSV export of contacts, bulk actions on contacts.

### Consent & suppression
- Basis per contact. List membership with per-list consent (`addToList` requires a consent source).
- Customer-exception setting (super_admin only).
- Append-only consent ledger (0141). Purposes are marketing, phone_outreach and list:*. Statuses granted/withdrawn/lapsed/not_given/notice_given. Bases consent/existing_customer_15_3/legit_interest_phone/business_address. 13 methods (`LA/growthCrm.ts:13-18`).
- Ledger page and CSV export. Phone-notice record (company-level).
- Suppression list stored as hashes. Reasons unsubscribed/hard_bounce/invalid/spam/blocked/manual/erased. Admin add (`LA/growthCrm.ts:19-21`).
- Double opt-in for the newsletter. Preference centre. RFC 8058 one-click.
- "Sunset" KPI. The page says R8 (automatic sunset) is **not built** (`CRM/consent/page.tsx:27-30`).

### Segments
- Saved filters (13 filter dimensions, §3.8). Live total and mailable counts. Preview with sample. Delete.

### Lists
- Subscription lists with bilingual name and description, public flag, archived. Stats: subscribed/pending/unsubscribed/30d growth/campaigns/open/click.
- Contact add/remove.
- Public lists appear on the signup and preference centre.

### Campaigns
- **Kinds**: newsletter/campaign/promotion/announcement.
- **Statuses**: draft/scheduled/sending/sent/cancelled.
- **Style**: branded or letter. **Language**: no/en.
- **Audience**: segment and/or list.
- **Editor (Campaign studio)** (`CA/CampaignStudio.tsx:381-762`):
  - 15 block types: hero, heading, text, button, features, steps, stats, article, bullets, image, quote, event, cta, divider, ps (`LA/crm.ts:22-25`)
  - up to 30 blocks; reorder (↑/↓), duplicate, remove (no drag)
  - live desktop/phone/inbox preview through the dispatcher's renderer
  - subject and preheader meters, placeholder hints `{firma}`, `{navn}`
  - signature, publish-to-web with slug and description, utm_campaign
- **A/B**: subject B only. Test % 10–50, metric open/click, wait 1–48 h. Automatic winner release by the claim.
- **Scheduling**: datetime-local in Oslo time, or "now". Cancel/unschedule.
- **Test send** to the admin's own address (`campaignAction` test).
- **Reporting**: funnel, six rates against a last-10 benchmark, A/B table, link click map with utm_content, 72-hour timeline, site analytics (sessions/views/signups/paid on utm_campaign), web archive link.
- **Pipeline link**: `stage_target` (who gets it), `stage_on_send` (moves companies), sender persona, `follows_id` + `follow_days` + `follow_when` (no_reply/no_click/no_open) + `follow_auto`.
- **Lifecycle coverage** panel (partly hard-coded, §3.9).
- **Not present**: block types beyond these 15, image upload (URL only), saving a campaign as a template, A/B on content, send-time optimisation, recurring campaigns, per-recipient preview.

### Journeys / sequences / triggers
- A "journey" is a chain of campaigns: a first mail aimed at a stage, then follow-ups (`admin_crm_journeys`, `LA/crm.ts:456-476`).
- Steps can be mail, call or linkedin. Call and LinkedIn steps create tasks for the company owner (`LA/crm.ts:28-30`).
- «Resend after N days» to non-clickers (`resendCampaign`).
- Metrics: reached, in journey, completed, moved forward (goal), replied.
- No visual journey builder. No event-triggered entry: the page itself says «a journey started by a product event … and the 10 % holdout» are not built (`admin.crm.journeys.principles.sub`, rendered at `CRM/journeys/page.tsx:110`).
- "Triggers" in the nav means **Brønnøysund register triggers** (threshold_5, threshold_30, company_new, manager_changed). These feed an outreach queue (phone/letter/email; statuses queued/assigned/sent/holdout/do_not_contact), with dry-run, holdout % and a manual poll (`LA/growthCrm.ts:79-126`).

### Templates / designed mail
- DB-held templates: key, category, name, description, kind, style, subject, preheader, blocks, sort (`LA/crm.ts:413-426`).
- Gallery with a live render. «Use» creates a draft campaign.
- No template editor in the admin. Templates are seeded data (10 per `crm_pipeline_invariants.sql:6`).

### Pipeline / deals / stages
- **A deal = a CRM company (`app.crm_companies`)**. There is no separate deal entity.
- **Fields**: name, org_number, form_code, nace_code/label, employees, municipality, website, phone, source, stage, stage_changed_at, owner_id/email, next_step, next_step_at, lost_reason, tags[], org_id, manager_name/role/seen_at, last_activity_at, created_at, contacts (count), open_tasks, `value_nok` (yearly value, integer ≤ 9 digits), contact_name (`LA/crm.ts:308-340`).
- **Missing**: currency (NOK implied in the field name), probability, expected close date (next_step_at is the only date), labels/colour, multiple deals per company, products/line items.
- **Stages** are data: key, name, sort, kind ∈ open/won/lost/parked, managed (trial and customer follow the subscription plan), archived, exit_criterion, with company and campaign counts (`LA/crm.ts:254-266`).
- **Kanban**: yes, with HTML5 drag-and-drop (open/won columns only) plus a list view. Moves are optimistic with rollback. Managed stages and companies linked to an org cannot be moved by hand (`CA/CrmBoard.tsx:101-114`).
- **Won/lost**: via stage kind. A lost reason appears when a lost-kind stage is chosen (`CA/CrmPipelineForms.tsx:131`). Win rate uses the stage history (0137, `LA/pipeline.ts:38-55`). Won this quarter is shown.
- **Bulk stage move**: up to 500 (`LA/crmActions.ts:406-420`). Reply-received stage setting.
- **Brønnøysund register picker**: NACE, municipality span, size, org form; adds companies with their general manager and a batch tag.

### Prospects
- The same companies list as the pipeline, as a table with filters (§3.3). The nav calls it "Companies".

### Partners
- Partner registry: name, org number, kind, contact, referral code, share kind/pct, status. Trials attributed through `?ref=CODE` (30d/7d).
- Kit checklist is mostly «planned». There are no public `/partner/[code]` pages (`CRM/partners/page.tsx:18-35`).

### Tasks
- Tasks are `crm_activities` with kind `task`: body, due, done_at, company, contact, admin.
- Origins: manual, journey step (call/linkedin), rule (R2/R10: founder callback with a one-hour SLA, PQL), trigger (R11 outreach phone/letter/email).
- Views open/done (90d)/all. Mark done/reopen. Skip (step tasks only).
- **No priority field, no assignee distinct from creator/company owner, no reminders.**

### Scoring
- Fit (0–50, Brønnøysund) × intent (0–50). Only hand-raise is sourced. Five intent parts score nothing («no source yet»).
- Routes founder/pql/trial/nurture. Weights live in the DB (`app.fit_score`, `app.intent_score`). Read-only page.

### Inbox
- Inbound leads (trial, contact_form, demo) from the last 30 days, each with a first-response SLA clock. Answered = an activity logged after arrival. **No message bodies, no reply composer, no email threading.** The contact form's text lives in **Tickets** (sales queue), not in the CRM.

---

## 8. Tests

**Vitest unit** (`tests/unit/`):
- `admin-nav-crm.test.ts:12-31`: nav split and also-matching.
- `pipeline.test.ts:4-42`: totals, shownSum, unvalued, winRate, winRateText.
- `campaign-design.test.ts:37-190`: branded/letter rendering, pairs, inbox check (`checkCampaign`) incl. every check having messages (`:179`).
- `growth-crm.test.ts:29-299`: generic-address rule, brreg feed parsing, roles, DB-reply parsing, page arithmetic (naceRanges, fmt/pct, strongestSignals, slaState, dates, autoTask), referral code, the QA fixture's G3 rows.
- `mail.test.ts:404-535`: `renderCampaign` utm, test subject, opt-in, blocks and styles.
- `brreg.test.ts:7-60`: check digit, network, rate-limit for lookups (admin brreg helpers).
- `admin-roles.test.ts:6-46`: editor role, audit CSV cells.
- `sentral-fixture.test.ts:11-277`: QA fixture guards and admin pixel-gate route map (includes CRM views per `scripts/verify/sentral-routes.mjs`, not read).

**SQL suites** (`supabase/tests/`, run by CI loop `for suite in supabase/tests/*_invariants.sql`, `.github/workflows/ci.yml:196`):
- `crm_invariants.sql` (271 lines; RLS closed, who may call what, respondents never contacts, `:1-6`)
- `crm_pipeline_invariants.sql` (301; companies/lists/templates/A-B/archive)
- `crm_stages_invariants.sql` (198)
- `crm_sequences_invariants.sql` (228)
- `crm_inbox_invariants.sql` (121)
- `crm_deal_invariants.sql` (89; its header says «support may read, not write» (`:6`), which does not match `crm_can_read`'s role list (super_admin, marketing, analyst); not verified)
- `crm_journeys_invariants.sql` (108)
- `crm_win_rate_invariants.sql` (264)
- `crm_designed_mail_invariants.sql` (123)
- `crm_sync_invariants.sql` (72)
- `consent_ledger_invariants.sql` (313)
- `growth_crm_invariants.sql` (792)
- Also mentioning crm: `demo_invariants.sql`, `retention_invariants.sql`, `growth_firewall_invariants.sql`, `admin_roles_invariants.sql`, `growth_g4_invariants.sql`, `cancellation_invariants.sql`, `legal_invariants.sql` (grep hits).

**Playwright / e2e**: none for the CRM. `qa/e2e/` holds auth.setup, invariants, p0-baselines, p1-language, pseudo, respondent-flow and respondent-keyboard specs. None references `/admin/crm` (grep). The admin visual gate is `scripts/verify/sentral-*.mjs` (not read). A screenshot `qa/reports/campaign-design/studio-1440-full.png` exists.

**Coverage gaps (none found by grep)**: no unit tests for `lib/admin/crmActions.ts` input shaping (osloToIso, filterOf, saveDeal), for `lib/crm/actions.ts`, for `/api/avmeld`, or for the consent CSV route.

---

## 9. Stubs, hard-coded text, oddities

**Hard-coded user-facing text (violates "never hard-code" for the admin, which is English-only)**:
- `'Norsk'` / `'English'` option labels: `CA/CrmForms.tsx:115-116`, `:332-333`, `:429-430`; `CA/CampaignStudio.tsx:540-541`; detail value `CRM/contacts/[id]/page.tsx:45`.
- `'A: … · B: …'`: `CRM/campaigns/[id]/page.tsx:346`. `' pts'`: `:149`. Visible URL text `orgpuls.com/nyhetsbrev/arkiv/…`: `:336`. Sender fallback `'Orgpuls'`: `:347`, `CA/CampaignStudio.tsx:755`, `CRM/templates/page.tsx:66`.
- Inbox median units `' min'` / `' h'`: `CRM/inbox/page.tsx:34`. LeadClock units `' h '`, `' m'`, `' d '`: `CA/CrmBoard.tsx:36-38`.
- Placeholder `"dl-bygg-oslo"`: `CA/CrmPipelineForms.tsx:476`.
- Studio glyph buttons ↑ ↓ ⧉ ✕ (they have aria-labels): `CA/CampaignStudio.tsx:649-678`. «P.S.» thumbnail: `:222`.
- Sample recipient «Kari Nordmann», «Eksempel AS»: `LA/campaignMail.ts:19`, duplicated inline in `CA/CampaignStudio.tsx:451-452` (preview-only sample data, labelled by `studio.sample`).
- Raw DB enums shown: send `status` / `delivery` (`CRM/contacts/[id]/page.tsx:92-94`); trigger `kind` in monospace (`CRM/triggers/page.tsx:137`, `:183`, the design's choice).
- Inline hex colours: timeline `#E0A21F` / `#5C9A55` (`CRM/campaigns/[id]/page.tsx:253-254`); public ListBox `#191510` / `#E8DFC9` (`components/site/NewsletterForms.tsx:198`).
- Message templating sometimes uses `.replace('{x}', …)` on raw strings instead of ICU (`CRM/page.tsx:46`, `CRM/stages/page.tsx:75`, `CRM/inbox/page.tsx:38,43`, `CRM/prospects/[id]/page.tsx:78`).

**Possibly fabricated or placeholder values (CLAUDE.md "never fabricate")**:
- Partners «Revenue share» KPI = message literal `'20 %'` (`CRM/partners/page.tsx:95`; en.json `admin.growth.g3.partners.kpi.shareValue`). The hint says «proposed … open decision 7». The target and gate text («target 1,5 per active partner a month», «gate: 5 signed pilots by week 10») are also literals.
- Campaigns lifecycle coverage: three rows always «Built in» green (`CRM/campaigns/page.tsx:46-48`), which contradicts the comment at `:12-16`.
- Partners kit states are hard-coded (`CRM/partners/page.tsx:27`, `:56`), acknowledged as interim.
- Partner code "path" column always shows a dash (`CRM/partners/page.tsx:117-118`, acknowledged).

**Locale oddities**:
- The admin always renders `en`, and `messages/no.json` `admin.crm` (lines 9352-10721) is a near-copy of en. 73 of 1080 keys differ (Norwegian translations such as `crm.tabs.stages` = "Faser") that can never render. `admin.growth.g3` is identical in both files.
- Number formatting is mixed: `toLocaleString('en-GB')` (`CRM/page.tsx:13`, `CRM/lists/page.tsx:13`) vs `'nb-NO'` (`CRM/campaigns/page.tsx:62`) vs space-grouped `fmt` (`LA/growthCrmView.ts:7`).

**Behavioural oddities**:
- Several reads skip `admin_log` despite the comments (§4.3).
- `CRM/page.tsx:23` computes "due" in UTC. `CRM/tasks/page.tsx:42` uses Oslo.
- `CRM/scoring/page.tsx` has no `mayOpenGrowthView`/canSee check, unlike consent/triggers/partners. It relies on the DB.
- `crmCompanies` is capped at 500 rows (SQL `0056_crm_pipeline.sql:845`). The pipeline notes this (`CRM/pipeline/page.tsx:50`), but the NewTask company select (`CRM/tasks/page.tsx:39`, `:59`) and `refreshManagers` (`LA/crmActions.ts:747`) silently see only 500.
- `'demo'` source is missing from `CONTACT_SOURCES` and from the `crm.source` messages (§3.8).
- `unsubscribeNewsletter` and `TokenAction action="unsubscribe"` are unused (§5).
- `crm.campaignsCol` and `crm.stats` message groups: no reference found in `app/(admin)`, `components/admin`, `lib/admin` (grep). Probably dead keys.
- Duplicated client constants (`STAGE_KINDS`, `KINDS`) because `lib/admin/crm` is `server-only` (`CA/CrmStageForms.tsx:21-22`, `CA/CrmStepForms.tsx:21-22`).
- `saveSegment` does not validate `name` in TS (`LA/crmActions.ts:163`). `saveContact` builds its payload by slicing, without one Zod object (`:47-63`).
- The overview task list (`crmTasks`) and the tasks page (`crmTaskList`) are two different RPCs for overlapping data (`LA/crm.ts:382-389` vs `:517-527`).

**No TODO/FIXME/mock markers** were found in the CRM app files (grep over `CRM/`, `lib/crm`, `LA/crm*.ts`, `LA/growthCrm*.ts`, the CRM components).

---

## 10. Related admin areas: how they connect

- **Dashboard** `/admin`: reads `crmPipelineSummary`, `crmStages` for the pipeline KPI and panel (`app/(admin)/admin/page.tsx:10`, `:30`, `:81-89`, `:197-213`). The «tasks» attention item links to `/admin/crm` (`:67-68`).
- **Tickets**: queues include `sales` (`LA/api.ts:406`). The contact form's topic 1 goes to queue and category `sales` (`0051_tickets.sql:318-320`). Sales tickets from the contact form count as a **hand-raise** in lead scoring (`0143_growth_crm.sql:793-797`). The ticket pages do not link to the CRM (grep of the tickets pages found no `crm`).
- **Orgs detail** `/admin/orgs/[id]`: has its own **internal notes** (`NoteForm`, `d.notes`) (`app/(admin)/admin/orgs/[id]/page.tsx:5`, `:331-337`). These are separate from CRM activities. There is no link back to the CRM company. The CRM links forward to `/admin/orgs/{org_id}` (`CRM/prospects/[id]/page.tsx:69`, `CRM/contacts/[id]/page.tsx:39`). Org tags: none found.
- **Web analytics**: the campaign page shows `web.{sessions,views,signups,paid}` by utm_campaign from `admin_crm_campaign` (`CRM/campaigns/[id]/page.tsx:326-332`). The beacon is `/api/wv` (§5).
- **Acquisition**: a spend entry has an optional `campaign` label (`app/(admin)/admin/acquisition/page.tsx:82`, `:104`). No direct CRM link.
- **Deliverability** `/admin/deliverability`: the registry classifies template sources including `crm` and streams transactional/marketing (`LA/deliverability.ts:16-19`). «Run authentication check» is restricted to the CRM writers (`LA/deliverability.ts:79-82`) and reuses `domainChecks` (`LA/mailDomain.ts:37`). It covers the CRM's sends (`app/(admin)/admin/deliverability/page.tsx:34-39`).
- **Growth**: consent, triggers and partners are G3 "growth views" in section crm (`LA/growth.ts:25-27`). Lead routing uses `growth_events` for PQL (`0143_growth_crm.sql:801-808`).

---

## 11. Unknowns / not verified

- The full bodies of most RPCs were not read; only role check and audit lines were scanned. Exact SQL semantics are not inventoried here: mailability, follow-audience, the company_save stage guards, `crm_sync`, and the import validation rules.
- `supabase/functions/orgpuls-brreg-triggers/index.ts` (264 lines) and `supabase/functions/_shared/mail.ts` (renderer) were not read in full.
- The `admin_whoami` RPC body was not read. The guard semantics are inferred from `Who` and from `app.admin_role` (`0049_platform_admin.sql:64-72`).
- `scripts/verify/sentral-routes.mjs` / `sentral-claims.json` (admin pixel-gate coverage of the CRM routes) were not read.
- `CA/ui.tsx`, `CA/Modal.tsx`, `CA/ActionForms.tsx` (`Outcome`, `useKeptAction`), `CA/growth.tsx` (`StatusChip`, `KpiStrip`, `CardEmpty`) and `CA/SectionTabs.tsx` are shared primitives. They were not read in full.
- `docs/DEVIATIONS.md` and `docs/DECISION_LOG.md` entries for the CRM (D-101, D-103, D-142, D-184, X-092, X-095, X-097) were not read.
- Whether `crm.campaignsCol` / `crm.stats` are truly unused: grep only (they could be read through `t.raw` objects passed whole). `m.stats` was not referenced in the CRM code I read.
- The design reference for the CRM screens (`design-reference/orgpuls/`) was not consulted.

---

## 12. Baseline screenshots (A3.3)

Captured 2026-10-03 against the local QA stack (`npm run qa:up` + `scripts/seed/sentral-fixture.mjs`), served by `next start -H 127.0.0.1 -p 3400`, signed in as the fixture's local super-admin with a fresh TOTP factor (the same sign-in as `scripts/verify/sentral-run.mjs`; the admin is deactivated again afterwards). Script: a one-off Playwright run kept in the session scratchpad; raw results in `screens/baseline/report.json`.

- 58 routes × 2 widths = 116 full-page shots in `screens/baseline/1440/` and `screens/baseline/390/`. Three dynamic routes were not shot because the seed holds no row for them: `/admin/cms/[id]`, `/admin/crm/campaigns/[id]`, `/admin/tickets/[id]`. These are open items for the baseline.
- Every shot: HTTP 200, the route itself (no redirect), **no console or page errors**, and **no horizontal page scroll at 390 px** (`scrollWidth − innerWidth = 0`).
- The admin's own pixel gate also passes: `node scripts/verify/sentral-run.mjs --base http://127.0.0.1:3400` → `pass: 16 of 16 views compared`, `no console errors` (exit 0).
- Inspected by eye: pipeline (1440, 390), company detail (1440). At 390 the board's columns scroll sideways inside the board, not the page. The single-company page's stage control reuses the bulk wording «Each to its next stage».

| Route | 1440 | 390 | Result |
| --- | --- | --- | --- |
| `/admin` | `screens/baseline/1440/dashboard.png` | `screens/baseline/390/dashboard.png` | ok |
| `/admin/acquisition` | `screens/baseline/1440/acquisition.png` | `screens/baseline/390/acquisition.png` | ok |
| `/admin/admins` | `screens/baseline/1440/admins.png` | `screens/baseline/390/admins.png` | ok |
| `/admin/audit` | `screens/baseline/1440/audit.png` | `screens/baseline/390/audit.png` | ok |
| `/admin/billing` | `screens/baseline/1440/billing.png` | `screens/baseline/390/billing.png` | ok |
| `/admin/cms` | `screens/baseline/1440/cms.png` | `screens/baseline/390/cms.png` | ok |
| `/admin/cms/[id]` | — | — | not shot: no seeded row |
| `/admin/cms/landing` | `screens/baseline/1440/cms_landing.png` | `screens/baseline/390/cms_landing.png` | ok |
| `/admin/cms/magnets` | `screens/baseline/1440/cms_magnets.png` | `screens/baseline/390/cms_magnets.png` | ok |
| `/admin/cms/media` | `screens/baseline/1440/cms_media.png` | `screens/baseline/390/cms_media.png` | ok |
| `/admin/cms/new` | `screens/baseline/1440/cms_new.png` | `screens/baseline/390/cms_new.png` | ok |
| `/admin/cms/redirects` | `screens/baseline/1440/cms_redirects.png` | `screens/baseline/390/cms_redirects.png` | ok |
| `/admin/cms/site` | `screens/baseline/1440/cms_site.png` | `screens/baseline/390/cms_site.png` | ok |
| `/admin/cms/templates` | `screens/baseline/1440/cms_templates.png` | `screens/baseline/390/cms_templates.png` | ok |
| `/admin/crm` | `screens/baseline/1440/crm.png` | `screens/baseline/390/crm.png` | ok |
| `/admin/crm/campaigns` | `screens/baseline/1440/crm_campaigns.png` | `screens/baseline/390/crm_campaigns.png` | ok |
| `/admin/crm/campaigns/[id]` | — | — | not shot: no seeded row |
| `/admin/crm/consent` | `screens/baseline/1440/crm_consent.png` | `screens/baseline/390/crm_consent.png` | ok |
| `/admin/crm/contacts` | `screens/baseline/1440/crm_contacts.png` | `screens/baseline/390/crm_contacts.png` | ok |
| `/admin/crm/contacts/[id]` | `screens/baseline/1440/crm_contacts_id.png` | `screens/baseline/390/crm_contacts_id.png` | ok |
| `/admin/crm/inbox` | `screens/baseline/1440/crm_inbox.png` | `screens/baseline/390/crm_inbox.png` | ok |
| `/admin/crm/journeys` | `screens/baseline/1440/crm_journeys.png` | `screens/baseline/390/crm_journeys.png` | ok |
| `/admin/crm/lists` | `screens/baseline/1440/crm_lists.png` | `screens/baseline/390/crm_lists.png` | ok |
| `/admin/crm/partners` | `screens/baseline/1440/crm_partners.png` | `screens/baseline/390/crm_partners.png` | ok |
| `/admin/crm/pipeline` | `screens/baseline/1440/crm_pipeline.png` | `screens/baseline/390/crm_pipeline.png` | ok |
| `/admin/crm/prospects` | `screens/baseline/1440/crm_prospects.png` | `screens/baseline/390/crm_prospects.png` | ok |
| `/admin/crm/prospects/[id]` | `screens/baseline/1440/crm_prospects_id.png` | `screens/baseline/390/crm_prospects_id.png` | ok |
| `/admin/crm/scoring` | `screens/baseline/1440/crm_scoring.png` | `screens/baseline/390/crm_scoring.png` | ok |
| `/admin/crm/segments` | `screens/baseline/1440/crm_segments.png` | `screens/baseline/390/crm_segments.png` | ok |
| `/admin/crm/stages` | `screens/baseline/1440/crm_stages.png` | `screens/baseline/390/crm_stages.png` | ok |
| `/admin/crm/tasks` | `screens/baseline/1440/crm_tasks.png` | `screens/baseline/390/crm_tasks.png` | ok |
| `/admin/crm/templates` | `screens/baseline/1440/crm_templates.png` | `screens/baseline/390/crm_templates.png` | ok |
| `/admin/crm/triggers` | `screens/baseline/1440/crm_triggers.png` | `screens/baseline/390/crm_triggers.png` | ok |
| `/admin/deliverability` | `screens/baseline/1440/deliverability.png` | `screens/baseline/390/deliverability.png` | ok |
| `/admin/growth` | `screens/baseline/1440/growth.png` | `screens/baseline/390/growth.png` | ok |
| `/admin/growth/coverage` | `screens/baseline/1440/growth_coverage.png` | `screens/baseline/390/growth_coverage.png` | ok |
| `/admin/growth/events` | `screens/baseline/1440/growth_events.png` | `screens/baseline/390/growth_events.png` | ok |
| `/admin/growth/experiments` | `screens/baseline/1440/growth_experiments.png` | `screens/baseline/390/growth_experiments.png` | ok |
| `/admin/growth/funnel` | `screens/baseline/1440/growth_funnel.png` | `screens/baseline/390/growth_funnel.png` | ok |
| `/admin/growth/plan` | `screens/baseline/1440/growth_plan.png` | `screens/baseline/390/growth_plan.png` | ok |
| `/admin/growth/risks` | `screens/baseline/1440/growth_risks.png` | `screens/baseline/390/growth_risks.png` | ok |
| `/admin/growth/rules` | `screens/baseline/1440/growth_rules.png` | `screens/baseline/390/growth_rules.png` | ok |
| `/admin/health` | `screens/baseline/1440/health.png` | `screens/baseline/390/health.png` | ok |
| `/admin/legal` | `screens/baseline/1440/legal.png` | `screens/baseline/390/legal.png` | ok |
| `/admin/modules` | `screens/baseline/1440/modules.png` | `screens/baseline/390/modules.png` | ok |
| `/admin/ops` | `screens/baseline/1440/ops.png` | `screens/baseline/390/ops.png` | ok |
| `/admin/orgs` | `screens/baseline/1440/orgs.png` | `screens/baseline/390/orgs.png` | ok |
| `/admin/orgs/[id]` | `screens/baseline/1440/orgs_id.png` | `screens/baseline/390/orgs_id.png` | ok |
| `/admin/seo` | `screens/baseline/1440/seo.png` | `screens/baseline/390/seo.png` | ok |
| `/admin/settings` | `screens/baseline/1440/settings.png` | `screens/baseline/390/settings.png` | ok |
| `/admin/tickets` | `screens/baseline/1440/tickets.png` | `screens/baseline/390/tickets.png` | ok |
| `/admin/tickets/[id]` | — | — | not shot: no seeded row |
| `/admin/tickets/canned` | `screens/baseline/1440/tickets_canned.png` | `screens/baseline/390/tickets_canned.png` | ok |
| `/admin/tickets/mentions` | `screens/baseline/1440/tickets_mentions.png` | `screens/baseline/390/tickets_mentions.png` | ok |
| `/admin/tickets/reports` | `screens/baseline/1440/tickets_reports.png` | `screens/baseline/390/tickets_reports.png` | ok |
| `/admin/translations` | `screens/baseline/1440/translations.png` | `screens/baseline/390/translations.png` | ok |
| `/admin/users` | `screens/baseline/1440/users.png` | `screens/baseline/390/users.png` | ok |
| `/admin/web` | `screens/baseline/1440/web.png` | `screens/baseline/390/web.png` | ok |
| `/admin/web/goals` | `screens/baseline/1440/web_goals.png` | `screens/baseline/390/web_goals.png` | ok |
| `/admin/web/pages` | `screens/baseline/1440/web_pages.png` | `screens/baseline/390/web_pages.png` | ok |
| `/admin/web/visits` | `screens/baseline/1440/web_visits.png` | `screens/baseline/390/web_visits.png` | ok |
