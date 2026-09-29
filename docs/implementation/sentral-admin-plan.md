# Sentral admin — review and implementation plan

Source: `Sentral_Admin.dc.html` (Tor, 2026-09-29), rendered screen by screen (19 views, 3 detail
views, the site menu) and read in full, logic included. Target: the platform admin under `/admin`
and admin.orgpuls.com. This document is the plan; nothing in it is built yet.

## 1. What the design is

A central admin for a *portfolio* of products ("Sentral": HeiTuva, Kursrom, Vaktplan), switched
with a site pill in the header. Five areas in a horizontal top bar, each with a row of sub-pages
under it:

| Area | Sub-pages in the design |
|---|---|
| Overview | Dashboard: four KPIs, *Needs attention* (each item with its reason and one action), recent activity, language coverage, pipeline by stage |
| Customers | Customers (paying accounts: seats used, plan, MRR, status, owner) · Organizations (units under a customer) · customer detail (seats, organisations, invoices, account facts, activity, *Open as customer*, *Edit*) |
| CRM | Pipeline (deals with value, contact, next step, days in stage; board and list) · Contacts & lists (lifecycle stage and consent; lists as rules) · Campaigns (KPIs, lifecycle coverage, house rules; detail with funnel and sequence steps) |
| Content | Pages (language chips per page; detail with Content / Translations / SEO / Versions / Settings and a Draft → In review → Scheduled → Published flow) · Templates · Landing & front pages (front page, splash switch, campaign pages with visits and conversion) · Media · SEO (issues per page, redirects, sitemap) · Languages (coverage per language, translation queue with assignee, machine translation switch, JSON import/export) |
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

## 3. The new map: every design screen → what exists → the work

| New place | Today | Work |
|---|---|---|
| **Overview › Dashboard** | `/admin` KPIs | Restyle. New `admin_attention()`: trials ending ≤ 7 d, cancellations and deletions due, tickets past SLA, at-risk accounts (health), failed jobs, sending-domain problems, legal texts awaiting approval, survey translations awaiting approval, CMS pages missing a language or a description. Recent activity from the audit log; language coverage from CMS + site messages; pipeline by stage once deals have values. |
| Overview › Web analytics · Cost per customer | `/admin/web`, `/admin/acquisition` | Move under Overview (Insights); restyle. |
| **Customers › Customers** | `/admin/orgs` | Restyle to the design's table. Segments: Active · Trial · Cancelling · Churned (plus Past due once invoicing exists). Seats = employees against the plan's headcount band. Owner = new `organizations.account_owner` (migration + reader + test). |
| Customers › customer detail | `/admin/orgs/[id]` + health + tickets | Merge into the design's detail: seats, account facts (plan, trial, confirmation, invoice email/EHF), health score, open tickets, activity from the audit log, *Edit*; *Open as customer* per decision 7. |
| Customers › Account health · Users · Tickets | `/admin/health`, `/admin/users`, `/admin/tickets` | Kept as sub-pages; restyled. |
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

Each phase ships on its own: gates, browser walk at 1280 and 390, docs, hosted migration, main.

| # | Phase | Contents | Migration | Size |
|---|---|---|---|---|
| 0 | Components | `components/admin/ui.tsx` v2: TopBar, SubBar, PageHead with primary action, Panel, KpiCard, SegmentFilter (with counts), StatusPill (dot), Avatar, DataTable rows, ProgressBar, Switch, Modal, EmptyState. Wordmark font. Pixel claims for the chrome. | — | M |
| 1 | Shell and IA | Top bar with 5 areas, sub-bar per area, site pill (one site), help, user menu. Phone: areas in a sheet. Every existing page moved into the map above, redirects for moved addresses, nav/access updated, the rail retired. | — | M |
| 2 | Overview | Dashboard with KPIs, Needs attention (`admin_attention`), activity, coverage; Insights sub-pages restyled. | 0116 (reader function) | M |
| 3 | Customers | List and detail as designed; account owner; health and tickets merged into the detail. | 0117 (`account_owner`) | M |
| 4 | CRM | Deals (value, next step, owner, stage since); board/list; Contacts & lists merged; Campaigns KPIs, lifecycle coverage, sequence steps. | 0118 (deal fields) | L |
| 5 | Content | Pages table; page detail tabs; In review; version compare; Templates page; Landing & front pages; SEO merged; Languages restyled. | 0119 (review state, template edit) | L |
| 6 | Media | Storage bucket and policies, upload, alt text, use counts, image block. | 0120 (bucket, table, RLS) | M |
| 7 | Admin | Users & roles with `editor`; Billing & plans (real states); Settings (General, Access, Integrations); Audit chips and export; *Open as customer* if decided. | 0121 (role, indexing setting) | M |
| 8 | Verify | Walk every screen in every role; `/audit quick` on the admin; D-/X- entries; open items. | — | S |

Order matters: 0 and 1 first, so every later screen is built once, in the new components. After
that, 2–7 can follow the value they bring. The recommended order is as listed: the dashboard is
used daily; Media is last because nothing waits on it.

## 5. Decisions for Tor

1. **One site or several?** Recommended: one (Orgpuls), the switcher ready for a second product.
2. **The wordmark.** «Sentral» as the admin's name, or «Orgpuls Admin»?
3. **Customers ⊃ Organizations.** Recommended: customer = organisation; drop the Organizations
   sub-page (or show departments).
4. **MRR before there is a ledger.** Show a list-price estimate, labelled, or nothing until billing
   phase 2?
5. **Open as customer.** Build as consented, time-boxed, read-only and logged, or leave it out?
6. **Splash page.** A maintenance notice (recommended), or nothing?
7. **Machine translation.** Leave it out until a provider is chosen (recommended), or pick one now?
8. **Roles.** Add `editor`; rename super_admin → Owner and marketing → Sales & marketing in the UI.

Until decided, the recommended option is what gets built, and every omission is logged in
DEVIATIONS.md with its reason.
