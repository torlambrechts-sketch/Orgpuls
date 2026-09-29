# Sentral admin — review and implementation plan

Source: `Sentral_Admin.dc_1.html` (Tor, 2026-09-29, revision 2), rendered screen by screen (23
views, 13 detail views and states) and read in full, logic included; revision 1
(`Sentral_Admin.dc.html`) is superseded. Target: the platform admin under `/admin` and
admin.orgpuls.com.

**Revision 2 adds** a sixth area, *Analytics* (Overview: visitors per day, sources, devices; Pages;
Goals: the visitor → customer funnel and counted goals); four CRM pages, *Journeys* (lifecycle
automation with steps: trigger, email, wait, condition, task, exit; detail with results and rules),
*Tasks* (calls, mails, meetings with due dates, from journeys or by hand), *Tickets* (moved from
Customers, with SLA) and *Lead scoring* (points from rules, hot/warm/cold); an SEO *Health /
Performance* switch (clicks, impressions, CTR, position per page and per query, Core Web Vitals,
index coverage); and a *visual page editor* (the page as a canvas, a block selected in place and
edited in an inspector, desktop/phone, beside a Blocks list).

## 1. What the design is

A central admin for a *portfolio* of products ("Sentral": HeiTuva, Kursrom, Vaktplan), switched
with a site pill in the header. Five areas in a horizontal top bar, each with a row of sub-pages
under it:

| Area | Sub-pages in the design |
|---|---|
| Overview | Dashboard: four KPIs, *Needs attention* (each item with its reason and one action), recent activity, language coverage, pipeline by stage |
| Customers | Customers (paying accounts: seats used, plan, MRR, status, owner) · Organizations (units under a customer) · customer detail (seats, organisations, invoices, account facts, activity, *Open as customer*, *Edit*) |
| CRM | Pipeline (deals with value, contact, next step, days in stage; board and list) · Contacts & lists (lifecycle stage and consent; lists as rules) · Campaigns (KPIs, lifecycle coverage, house rules; detail with funnel and sequence steps) · *rev. 2:* Journeys · Tasks · Tickets · Lead scoring |
| Content | Pages (language chips per page; detail with Content / Translations / SEO / Versions / Settings and a Draft → In review → Scheduled → Published flow) · Templates · Landing & front pages (front page, splash switch, campaign pages with visits and conversion) · Media · SEO (issues per page, redirects, sitemap) · Languages (coverage per language, translation queue with assignee, machine translation switch, JSON import/export) |
| Analytics *(rev. 2)* | Overview (four KPIs, visitors per day with weekends in grey, sources, devices) · Pages (views, unique, time, exit, conversion per page) · Goals (funnel from visitor to customer; goals with rule, count, trend) |
| Admin | Users & roles (six roles, access per site) · Billing & plans (plans, invoices) · Site settings (General, Access switches, Integrations: API keys, webhooks) · Audit log (type chips, expandable detail, CSV export) |

The visual language is Orgpuls's own. The same tokens (#FCF6E9, #FFFDF6, #F5C64A, #FBEBBE,
#E8DFC9, #5F5849, #A8D5D2, #FBD5C4), DM Sans, Playfair Display 500 for headings, radius 20 for
panels, pills with a status dot, and initials avatars. The one addition is Bricolage Grotesque 700
for the wordmark. Adopting it is mostly a change of layout and components, not of palette.

## 2. Senior review — where it fits, where it does not

**Fits well and is worth taking**
- *One top bar with an area-scoped sub-bar* replaces the accordion rail built today (X-093). It
  scales better: ~30 admin pages become 5 areas of 3–7 pages each, and the page gets the full width.
- *Needs attention* is the best idea in the design. The dashboard stops showing only figures and
  says what to do next. We already hold most of the signals (below).
- *Status pills with a dot, segmented filters with counts, initials avatars, and one primary action
  per page* are one component set. It replaces the ad-hoc badges and filter links across 30 pages.
- *Editorial workflow* (In review before publish), *version compare*, *language coverage per page*
  and a *translation queue* extend the CMS (X-094) and Translations (D-133) naturally.
- *Lifecycle coverage* on Campaigns reads real campaign state and shows which of the five standard
  lifecycle mails are missing.
- *Audit log with type chips and expandable detail*: we log everything already (`app.admin_audit`).

**Conflicts with how Orgpuls works — needs a decision or an adaptation**
1. **Several sites.** Orgpuls is one product. `platform_admins.product_id` exists, but no other
   product does. A site switcher with invented sites would break the rule against fabricated data.
   *Recommendation:* build the site pill for one site, Orgpuls (www + en), with no dropdown until a
   second product exists. Making every admin table and function product-scoped is its own project.
2. **Customer ⊃ Organizations.** In Orgpuls the organisation *is* the paying account: one org
   number, one `billing` row. There is no parent account. *Recommendation:* Customers = the
   organisations. Drop the Organizations sub-page for now, or make it the list of departments
   (groups) with headcounts, never respondent counts. A group hierarchy for Norwegian groups of
   companies (konsern) is a later product decision.
3. **MRR, Past due, Invoices.** There is no ledger: no Stripe, no Fiken (D-93/D-94, open items).
   Plans and trials are real (`billing.plan`, trial dates, cancellations); money is not. MRR can
   only be *list price × confirmed plan*, labelled as such. "Past due" and the invoice list cannot
   be shown until billing phase 2 (BILLING_RECOMMENDATION.md). *Recommendation:* show plan, trial
   and cancellation states now. Leave MRR as a list-price estimate, or leave it out (decision), and
   log the invoice omission.
4. **Deals.** The pipeline moves *companies* through stages. Deal value and next step do not exist
   (open item D-159). *Recommendation:* add them in one migration (value per year, next step, its
   date, owner, stage-entered time). Board and list then show real figures, and the dashboard gets
   pipeline by stage.
5. **Roles.** Design: Owner / Admin / Sales / Support / Editor / Developer. Ours: super_admin /
   support / finance / analyst / marketing. *Recommendation:* map, don't copy:
   - super_admin → *Owner*; marketing → *Sales & marketing*.
   - Keep support, finance and analyst.
   - Add *editor* (content, SEO and translations; no customer data). That's least privilege, and it
     is what a copywriter or translator needs.
   - Leave Developer out: there are no API keys or webhooks to administer.
   - Access per site waits for decision 1.
6. **Site settings.** API keys, customer webhooks and SSO for customers are not features Orgpuls
   has, and rendering them would be fabricating. *Recommendation:*
   - *General*: the real configuration, read-only (hosts, languages, time zone, sender domains).
   - *Access*: real switches only — MFA enforced per admin (`mfa_enforced` exists), auto-approve
     of translations (exists), and a new «allow search engines» switch that robots.txt, the sitemap
     and page meta read. It comes with its test.
   - *Integrations*: the live status of the integrations we do have: Brevo mail and SMS, the
     sending domain's DKIM/DMARC/SPF, Search Console, IndexNow, Brønnøysund, the job runs from
     Operations.
7. **Open as customer.** A read-only session as the customer's daglig leder is powerful. Results
   stay k-gated whoever looks, but the spec's support-access model asks for the customer's consent
   and a time limit. *Recommendation:* build it only as consented, time-boxed, read-only and logged
   (Phase 7), or leave it out (decision).
8. **Splash page.** «Replaces every page for every visitor» is a site-wide kill switch in a CMS. It
   is dangerous for a product where people answer surveys at `/s/…`. *Recommendation:* a
   maintenance *notice* (a banner on the public pages only, scheduled, logged). No replacement of
   pages, never on the survey or the app.
9. **Machine translation switch.** D-161 left it out. Respondent texts follow X-089 (machine drafts
   reviewed by Tor). An in-app switch needs a provider and a key. *Recommendation:* keep the queue
   and states. Leave the switch out until a provider is chosen (decision).
10. **Media library.** New: a Storage bucket with RLS, uploads with size and type checks, a web
    version of each image, alt text required, and use counts. Pages and campaigns then take
    pictures from it (D-160/D-161 left these out). It is worth doing, as its own phase.

**What we have that the design does not — kept, and placed in the new IA**
Account health, Tickets, the CRM Inbox, Companies from Brønnøysund, Segments, mail Templates,
Stages & senders, Web analytics, Cost per customer, Search Console, Industry modules, Legal review,
survey-language Translations (pl, uk, lt, sv, da), Operations/jobs, deletions, and the auto-approve
banner. None is dropped; each gets a place below.

**Engineering notes**
- The prototype navigates with `<button>`s. Ours use real links (control substitution, D-06).
- Focus-visible is specified in the design (3px ink outline, offset 2); keep it on every control.
- All labels come from next-intl, in English in both message files, as the admin is today.
- The pixel gate covers the chrome only (top bar, sub-bar, page head, panel, table row, pill), with
  baselines captured from the design with its own mock data. The screens' contents are real data and
  are checked by eye and by the browser walk.
- The wordmark font (Bricolage Grotesque 700) is added to `public/fonts` and `app/fonts.css` if it is
  not already one of the bundled files; never `next/font` (D-07).
- Every screen keeps its database function. The redesign changes readers only where a new figure is
  needed, and every new column or setting ships with its consumer and a test (wiring audit).

## 2b. Revision 2 — the added screens against what Orgpuls has

| Screen | What exists | What is real, and what is not drawn |
|---|---|---|
| Analytics › Overview | `/admin/web` (0050, 0054, 0059): views, visitors, referrers, UTM, country/region/city, per day | Visitors, sessions, views per day, sources and devices are counted (cookieless daily visitor hash; the user agent gives the device). *Bounce rate and time on site* need a session across pages, which the cookieless design (D-91) counts only as far as a same-day visitor hash allows: shown only if the reader can compute it honestly, else omitted and logged. |
| Analytics › Pages | per-path views in `web_events`; CTA clicks; sign-ups by first page | Views, visitors, sign-ups per page. *Time on page* (to the next view in the visit) and *exit rate* are counted within a visit as the same-day visitor hash allows (D-167). |
| Analytics › Goals | `funnel()`, sign-ups, trials, demo requests (0095), newsletter confirmations (0055) | The funnel and four goals from the real events: signed up, started a trial, requested a demo, newsletter signup. «Viewed pricing» is a page view of /priser. Trends compare with the previous period. |
| CRM › Journeys | Sequences and automatic follow-ups (0111), stages (0093), activities | A journey is a campaign chain: its trigger (stage or list), its mails, the waits between them, the no-click/no-open condition, its task steps and its goal. Counts come from `crm_sends`. New: a journey record over the chain (name, trigger stage, goal, send window) and *task* steps — migration. |
| CRM › Tasks | `crm_activities` kind `task` | Tasks need a due time, an owner, done and outcome: migration. Journey task steps create tasks. The *meeting link* needs a calendar integration and is not drawn (logged). |
| CRM › Tickets | `/admin/tickets` (0051) with SLA due times | Moved into CRM and redrawn: segments Open/Waiting/Solved, SLA state from `first_response_due`, owner, priority. The detail page is kept. |
| CRM › Lead scoring | account health (0060) scores organisations | Contacts get points from rules on what is known about them: clicked a mail in 30 days, replied, a trial started at their company, company size and sector from Brønnøysund, no activity for 30 days, unsubscribed. «Visited the pricing page» and «attended a demo» are not tied to a person (cookieless site; no calendar) and are not rules. Rules are rows (points editable), scores are computed, hot ≥ 70 creates a task. Migration. |
| Content › SEO › Performance | Search Console sync (0061): clicks, impressions, CTR, position per page and query | Real when Search Console is connected; before that the view says it is not connected (as `/admin/seo` does today). *Core Web Vitals* need the CrUX API (a Google API key): drawn from it when a key is set, otherwise the card says how to connect it — no figures. *Index coverage* from Search Console's own counts when synced; otherwise the sitemap and noindex counts, labelled as such. |
| Content › Pages › visual editor | CMS editor with a live preview of the real page (X-094) | The canvas draws the page's blocks as the design does; clicking one selects it and the inspector edits its fields; blocks move, duplicate and delete; desktop/phone width. The real page stays one click away in Preview. Per-block *alignment and background* are not part of the site's block kinds — the public site draws every block its one designed way — so the inspector does not offer them (logged). |

## 3. The new map: every design screen → what exists → the work

| New place | Today | Work |
|---|---|---|
| **Overview › Dashboard** | `/admin` KPIs | Restyle. New `admin_attention()`: trials ending ≤ 7 d, cancellations and deletions due, tickets past SLA, at-risk accounts (health), failed jobs, sending-domain problems, legal texts awaiting approval, survey translations awaiting approval, CMS pages missing a language or a description. Recent activity from the audit log; language coverage from CMS + site messages; pipeline by stage once deals have values. |
| **Analytics › Overview · Pages · Goals** | `/admin/web`, `/admin/acquisition` | Rebuilt as the design's three pages (see 2b); Cost per customer stays a fourth sub-page. |
| **Customers › Customers** | `/admin/orgs` | Restyle to the design's table. Segments: Active · Trial · Cancelling · Churned (plus Past due once invoicing exists). Seats = employees against the plan's headcount band. Owner = new `organizations.account_owner` (migration + reader + test). |
| Customers › customer detail | `/admin/orgs/[id]` + health + tickets | Merge into the design's detail: seats, account facts (plan, trial, confirmation, invoice email/EHF), health score, open tickets, activity from the audit log, *Edit*; *Open as customer* per decision 7. |
| Customers › Account health · Users | `/admin/health`, `/admin/users` | Kept as sub-pages; restyled. Tickets move to CRM (rev. 2). |
| **CRM › Journeys · Tasks · Tickets · Lead scoring** | sequences (0111), activities, `/admin/tickets`, account health | See 2b. |
| **CRM › Overview · Inbox** | `/admin/crm`, `/admin/crm/inbox` | Kept; restyled. |
| CRM › Pipeline | `/admin/crm/pipeline` | Migration: deal value, next step + date, owner, `stage_since`. Board + list toggle as designed; won/open sums. |
| CRM › Companies | `/admin/crm/prospects` | Kept (Brønnøysund search and import); restyled. |
| CRM › Contacts & lists | `/admin/crm/contacts`, `/lists`, `/segments` | One page: contacts table with lifecycle segments and consent, lists and segments as cards beside it (reachable count, excluded unsubscribed). Contact detail kept. |
| CRM › Campaigns | `/admin/crm/campaigns`, `[id]`, `/templates` | KPIs (running, sent 30 d, click rate, conversions = signups attributed to campaign links), *Lifecycle coverage* from real campaigns, house rules; detail keeps the studio and funnel, adds the steps table for sequences. Mail templates stay a sub-page. |
| CRM › Stages & senders | `/admin/crm/stages` | Kept; restyled. |
| **Content › Pages** | `/admin/cms` | Adopt the design's table (language chips, status, author) over the existing hub (designed + template pages, score, traffic kept as columns). |
| Content › page detail | `/admin/cms/[id]` | Tabs: Content (existing editor + preview) · Translations (per language: state, fallback note, add/translate, JSON export/import per page) · SEO (existing score, snippet, social card) · Versions (existing revisions + *Compare*, a block diff) · Settings (template, address with 301, archive = 410). Workflow gains *In review* (migration: `review_requested_at/by`, `reviewed_by`; publish by someone else when review is on). |
| Content › Templates | seeded `cms_templates` | New page: templates with their layout thumbnail, blocks, use count; edit a template's starting words (RPC + audit). |
| Content › Landing & front pages | — | New view over real data: front page card (visits and sign-ups, 30 d, from web analytics), CMS landing/splash pages with visits and conversion; maintenance notice per decision 8. |
| Content › Media | — | New (Phase 6): bucket, RLS, upload, alt text, use counts; `image` block kind for pages. |
| Content › SEO | `/admin/seo`, `/admin/cms/redirects` | Merge: Search Console panels (kept), per-page issues from the CMS score, redirects with hits, sitemap and IndexNow status. |
| Content › Languages | `/admin/translations` | Adopt the layout: coverage per language (site no/en; survey pl/uk/lt/sv/da), translation queue, JSON/XLIFF import and export (exist), auto-approve (exists). The questionnaire, pages and sheet workflows stay behind their tabs. |
| Content › Legal review · Industry modules | `/admin/legal`, `/admin/modules` | Kept under Content; restyled. |
| **Admin › Users & roles** | `/admin/admins` | Restyle: team table + role cards with what each can do; `editor` role (migration, access matrix, database checks, tests). |
| Admin › Billing & plans | trial/plan in orgs | New view: plans with headcount band, list price, customers per plan; trials, cancellations, confirmations; invoices omitted until the ledger exists (logged). |
| Admin › Settings | — | General (read-only facts) · Access (MFA per admin, auto-approve, allow-indexing switch) · Integrations (live status). |
| Admin › Operations · Audit log | `/admin/ops`, `/admin/audit` | Kept; audit gets type chips, expandable detail and a CSV export. |

Old addresses keep working: every moved page redirects from its old path (next.config), and the
menu model (`lib/admin/nav.ts`) and access matrix (`lib/admin/access.ts`) stay the single source of
what each role sees.

## 4. Phases

Each phase ships on its own, with the QA below. Status is kept here as phases land.

| # | Phase | Contents | Migration |
|---|---|---|---|
| 0–1 ✓ | Shell and components | Top bar with six areas, sub-bar, site pill, account menu, phone sheet; `ui.tsx` restyled (page head, panel, KPI card, pill with dot, table, segments, avatar, bar); wordmark font; every page in its area. | — |
| 2 ✓ | Overview | Dashboard: KPIs, Needs attention, recent activity, language coverage, pipeline by stage (D-163). | 0116 `admin_attention` |
| 3 ✓ | Customers | List and detail as designed; account owner; health merged (D-164). | 0118 `account_owners` |
| 4 ✓ | CRM I | Pipeline (deal value, next step, owner, stage since; board/list); Contacts & lists; Campaigns (KPIs, lifecycle coverage, house rules, detail). | deal fields |
| 5 ✓ | CRM II | Journeys (+ detail), Tasks, Tickets redrawn and moved, Lead scoring. | journeys, tasks, score rules |
| 6 ✓ | Analytics | Overview, Pages, Goals from the real counts; Sources & visits and Cost per customer behind «More» (D-167). | 0121 device class, `admin_web_report` |
| 7 ✓ | Content I | Pages table; page detail tabs with Translations; no In review or Compare, form + live preview instead of canvas (D-168, X-096). | 0123 author |
| 8 ✓ | Content II | Templates (read-only, D-168), Landing & front pages with the site notice, SEO Health/Performance, Languages overview. | 0123 site notice |
| 9 | Media | Storage, upload, alt text, use counts, image block. | bucket, table, RLS |
| 10 | Admin | Users & roles (`editor`), Billing & plans (no money figures), Site settings (General, Access, Integrations), Audit log. | role, indexing setting |

**QA for every phase**
1. The design's screen is rendered with the bundle's own fonts at 1440 × 900, and ours on the QA
   stack at the same size, from the same state: first compared side by side by eye, region by region
   (head, panels, tables, pills), then the chrome (top bar, sub-bar, page head) with
   `scripts/verify/probe.mjs` for exact spacing and type. Differences that are the data (real names,
   counts) are expected; differences in spacing, type, radius or colour are fixed.
2. Every state the design draws is reached: empty, filtered, detail, dialog, error; at 390 px no
   sideways scroll; keyboard and focus-visible on every control; no console errors.
3. Gates: tsc, lint, i18n, unit tests, build, SQL suites, the wiring audit; hosted migration; ship.

## 5. Decisions (Tor, 2026-09-29)

| # | Question | Decided |
|---|---|---|
| 1 | One site or several? | **One site**, Orgpuls (www + en). The site pill has no dropdown until a second product exists. |
| 2 | The wordmark | **Sentral**. |
| 3 | Customers ⊃ Organizations | Recommended default: customer = organisation; no Organizations sub-page. |
| 4 | MRR before a ledger | **No money figures** until billing phase 2: plans, trials, confirmations and cancellations only. MRR, past due and invoices are omitted and logged. |
| 5 | Open as customer | **Left out.** Support works from the admin's own views and the customer's tickets. |
| 6 | Splash page | Recommended default: a maintenance notice on the public pages only. |
| 7 | Machine translation | Recommended default: left out until a provider is chosen. |
| 8 | Roles | Recommended default: add `editor`; super_admin shows as Owner, marketing as Sales & marketing. |
