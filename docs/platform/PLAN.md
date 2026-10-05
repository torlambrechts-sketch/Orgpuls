# The platform split: admin and CRM leave Orgpuls (X-104)

Status: **T1 and T5 done in Orgpuls** (0205 the API, 0206 the deletion, X-105, D-230); T2–T4 are the platform's
own repository. Owner: Tor. Written 2026-10-05.

## 1. Decisions

On 2026-10-05 Tor said he was thinking of moving admin out because it is «uoversiktlig og fare for feil,
brudd ved å ha det her». He then decided:

1. **Everything admin stores today may be deleted, with no export.** Tor, 2026-10-05: «ingen av dataene er brukt … ingenting er gjort så slett». This includes the consent and send trail (3 consents, 2 sends, 8 Brønnøysund outreaches, all tests) and the admin audit log (817 rows). Production holds 0 CMS pages, 3 CRM contacts and
   0 tickets. It also holds 170 site-analytics events, 123 growth events and 1,649 cached
   Brønnøysund entities. Nothing is migrated.
2. **One platform for several products.** A SaaS platform with admin, CRM and support, of which Orgpuls
   is the first product. The platform has its own database, its own repository and its own domain.
3. **Integrated through an API.** The platform *steers* product data through commands; it never owns it.
4. **The public site stays in Orgpuls**, with its content in code and message files, as nearly all of
   it already is. The CMS is removed.
5. **Its own repository.** The platform is not a folder in this one.

## 2. Target

```
┌──────────────────────── platform (new repo, own Supabase project, own domain) ───────────────┐
│ accounts · products · subscriptions (mirror) · contacts · companies · deals · campaigns       │
│ tickets · CSAT · site analytics · KPIs · health score · admin users (MFA) · admin audit       │
└───────────────▲──────────────────────────────────────────────┬────────────────────────────────┘
                │ events (signed webhooks, numbers only)        │ commands (signed, scoped, audited)
┌───────────────┴──────────────────────────────────────────────▼────────────────────────────────┐
│ Orgpuls: organisations · users · surveys · answers · conversations · measures · reports        │
│ billing state (gates access) · translations · modules · legal texts · flags · public site      │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

What this gains:

- **Admin leaves product auth.** `platform_admins` and the aal2 admin role check go.
- **The anonymity firewall is no longer needed for the moved tables.** That is `growth_firewall`, 0141
  and 0143: no CRM or growth table shares a database with an answer any more.
- **A third of the code leaves.** Admin today is 22 sections, about 25,000 lines, 163 of 339 public
  functions and 81 of 190 tables.

## 3. What stays in Orgpuls, written by platform commands

| Data | Why it stays |
|---|---|
| `billing` (trial, plan, interval, free_from, confirmed_at) | it gates access (`app.org_access`) |
| `item_translations`, `ui_translation_approvals`, `message_overrides`, `item_translation_log` | the survey and the site read them at run time |
| `module_*`, `question_modules`, `module_pilots`, `locale_pilots` | the survey reads them |
| `legal_reviews`, `legal_approvals`, `dpa_versions`, `dpa_signatures` | records about texts the product shows and customers sign |
| `platform_settings` (auto-approve, site notice, indexing) | the product and the site read them |
| `demo_*` (sandboxes, settings, copy plan) | product feature |
| `outbox`, `outbox_recipients`, `mail_events`, `mail_streams` | the product's own mail |

The admin *screens* for these go. The platform's UI does the same through commands (§ 5.3).

## 4. What leaves Orgpuls

**Tables (81), dropped after cutover. The drop on the hosted project needs Tor's yes first.**

- **CRM:** `crm_*` (15), `account_owners`, `partners`, `consent_purposes`, `consent_records`,
  `mail_templates`, `mail_auth_checks`, `mail_auth_runs`
- **Prospects:** `brreg_*` (7)
- **Growth and analytics:** `growth_*` (21), `event_catalogue`, `product_events`, `kpi_daily`,
  `marketing_spend`, `org_attribution`, `web_events`, `web_salts`, `seo_runs`, `seo_search`
- **Support:** `tickets`, `ticket_*` (6), `canned_replies`, `csat_misses`
- **Trial nurture:** `lifecycle_mail`, `lifecycle_settings` (move to the platform, driven by events)
- **CMS:** `cms_*` (7)
- **Admin:** `platform_admins`, `admin_audit`, `admin_org_notes`, `demo_requests`

**Functions:** every `public.admin_*` (163) and the readers and writers of the tables above, among them:
- CRM and analytics: `crm_*`, `crm_mail_claim/done`, `track_web_event`, `track_product_event`
- signup and the site's forms: `record_signup_source`, `record_signup_heard`, `submit_contact`,
  `csat_submit`, `crm_unsubscribe`
- trial nurture: `lifecycle_mail_claim/done`
- the anonymity firewall: `growth_firewall` and its suites

**App:**
- **Screens:** `app/(admin)`, `app/(adminauth)`, `components/admin*`
- **Libraries:** `lib/admin`, `lib/crm`, `lib/cms`, `lib/brreg`, `lib/analytics`, `lib/csat`
- **Host routing:** the admin host in `lib/hosts.ts` and the middleware
- **Pages:** `/vurdering` (CSAT); the site-analytics beacon `app/api/wv`; `app/api/avmeld`
- **CMS renderers:** `components/marketing/CmsView` and the CMS branch of `[bransje]` and `artikler`.
  The coded pages stay.

**Edge functions:**
- `orgpuls-seo` and `orgpuls-brreg-triggers` move.
- `orgpuls-dispatch` loses its CRM, ticket and lifecycle streams.
- `orgpuls-mail-events` keeps product mail only.

**The parallel CRM branch** (`origin/ccr-39a2fb73-jgkg09`, 0193–0203) is **not merged**. Its intent
is rebuilt in the platform. Its migrations already applied on hosted are dropped with the rest in § 7 T5.

## 5. The API (v1)

### 5.1 Authentication (as built in 0205)

- **Commands: no route and no service key.**
  - The platform calls `public.platform_command(token, command, args)` over PostgREST with the
    project's public key.
  - The token is an HS256 JWT signed with a secret kept in Orgpuls' Vault
    (`orgpuls_platform_token_secret`). The database verifies it itself, then checks the claims:
    - `aud` = `orgpuls`
    - `sub` = the admin
    - `scope` = space-separated scopes
    - `jti` = 8–128 characters, never seen before
    - `iat` and `exp` at most 5 minutes apart
  - The app never holds a service-role key (`lib/supabase/server.ts`), and the platform never holds
    Orgpuls' keys beyond the public one.
  - HS256 rather than a key pair: the shared secret lives only in Vault and in the platform's
    environment. The database can verify HMAC with pgcrypto, while asymmetric verification would need
    a route with a key, which is the service key we keep out.
- **Events:** the dispatcher POSTs batches to the installation's webhook (`app.platform_installation`)
  with `x-orgpuls-timestamp` and `x-orgpuls-signature: sha256=<hex HMAC of "timestamp.body">` under
  `orgpuls_platform_webhook_secret`. The platform rejects anything older than 5 minutes.
- **Audit:** every call that passes the signature is written to `app.platform_commands`, append-only:
  who, which command, the argument names, the outcome. Events are kept 30 days in `app.platform_events`.
- **To connect the platform:** read the two secrets from Vault once, store them in the platform, and set
  `app.platform_installation` (webhook URL, enabled) by SQL.

### 5.2 Events, Orgpuls → platform

| Event | Fields |
|---|---|
| `org.created` | org id, name, org number, size bucket, industry, signup source and «heard about» |
| `user.invited` / `user.joined` / `user.removed` | org id, user id, role, e-mail (a customer contact, not a respondent) |
| `trial.started` / `trial.ending` / `trial.ended` | org id, dates |
| `billing.changed` | org id, plan, interval, confirmed_at, free_from |
| `org.deleted` | org id |
| `usage.daily` | per org: employees, rounds planned/open/closed, invitations sent, response rate as a whole-organisation percentage, last login |
| `contact.submitted` | the site's contact form (topic, name, e-mail, organisation, message) |
| `csat.submitted` | ticket id, score |

**Never in an event, enforced in the one function that builds events and proved by a suite:**
- any answer, comment, conversation message or thread
- who responded, or which invitation was used
- a group's or department's figure
- respondent e-mail or phone
- anything from `employees` other than the count

### 5.3 Commands, platform → Orgpuls

| Command | Scope |
|---|---|
| list and read organisations: summary, users, billing, usage, never answers | `orgs:read` |
| extend trial, set plan and interval, cancel, move to the free plan | `billing:write` |
| deactivate a user, resend an invitation | `users:write` |
| list, edit and approve translations; import a package | `translations:write` |
| publish or withdraw a module version; module and locale pilots | `modules:write` |
| record a legal review; publish a DPA version | `legal:write` |
| set auto-approve, the site notice, indexing | `settings:write` |
| create, reset or remove a demo sandbox | `demo:write` |

Each command is a row in `app.platform_command_map` naming one function and its scope; `platform_command`
calls it by parameter name (`args` is an object keyed by the function's parameters). Today's `admin_*` functions are
the starting point; the check `app.is_platform_admin(...)` becomes the verified scope.

### 5.4 Several products

The platform's model is generic from the start:
- `products`, then `installations` (a product's API base URL and keys)
- `accounts` (a customer), with `account_products` linking an account to its tenant in a product (for
  Orgpuls, an org id)
- `subscriptions` (mirrored from events)

Contacts, deals, tickets and campaigns hang on accounts, not on Orgpuls ids. A second product implements
the same event and command contract.

## 6. The public site after the CMS

- `[bransje]` and `artikler` render only their coded pages. Production has no CMS page, so nothing is
  lost.
- The contact form posts to the platform through `contact.submitted`.
- **Site analytics is a decision for the platform.** Today it is a cookieless beacon (`/api/wv`).
  Either the platform hosts the beacon on its own domain, or it is dropped in favour of Vercel
  Analytics.
- The newsletter sign-up, the preference centre and the web archive (CRM2) move to the platform's
  domain.

## 7. Steps

| Step | What | Done when |
|---|---|---|
| T0 | Freeze: no new admin or CRM work in Orgpuls; the CRM branch stays unmerged | Tor agrees |
| T1 | Orgpuls: `app.platform_commands`, `app.platform_deliveries`, event builder, webhook sender, `/api/platform/v1` with JWT and scopes; the commands of § 5.3 | suites prove no respondent field leaves; every command audited; replay refused |
| T2 | Platform repo: Next.js + Supabase project (eu-central-1), admin login with MFA, products, installations, accounts | Orgpuls installed; events arrive; a command round-trips |
| T3 | Platform features: customers and support view, billing actions, translations and modules UI, legal, CRM, tickets, KPIs | parity with today's admin for what Tor uses |
| T4 | Cutover: the admin domain points at the platform; Orgpuls stops serving `app/(admin)` | Tor uses only the platform for a week |
| T5 | Delete from Orgpuls: screens, libraries, edge streams, functions; one migration drops the 81 tables | **Tor approves the drop list before it runs on hosted**; CI green; `respondent_invariants` green |

T1 and T5 are this repository. T2 and T3 are the new one, which must be added to the session to be built
here.

## 8. Risks

- **A command API is a new door into the product.**
  - It holds less than today's admin, which runs inside the product with full DB functions.
  - It still has to be reviewed like the respondent path: narrow scopes, short tokens, audit, rate
    limits.
- **Webhook loss** would make the platform's view stale. Mitigations: deliveries are retried, and
  `usage.daily` re-syncs everything once a day.
- **Two deploys instead of one.** Contract changes need a version (`/v1`) and a period where both are
  served.
- **Lifecycle mail** (trial reminders) moves to the platform. Until T4 it keeps running where it is, so
  nothing is missed in between.

## 9. Open questions

- The platform's name, domain and repository name.
- Whether site analytics moves to the platform or is dropped (§ 6).
- Whether invoicing (today a recommendation in admin) becomes a platform feature with a payment provider.
