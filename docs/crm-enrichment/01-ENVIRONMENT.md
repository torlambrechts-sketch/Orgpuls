# 01 — Environment

Phase A output (A3.1) for `docs/crm-enrichment/INSTRUCTIONS.md`, written 2026-10-03 on branch `ccr-39a2fb73-jgkg09`. Read-only: no application code or database was changed. Every fact cites `path:line`; where the inventory says a range was not read in full, that range is an open item, not a finding. Local stack used for this phase: `supabase start` (CLI 2.119.0 via npm; CI pins 2.118.0) with every migration applied, then `npm run qa:up` (modules, design fixture, demo org, Lumio QA tenant) — never the hosted project.

---

# Orgpuls — environment inventory (read-only)

Repository `/home/user/Orgpuls`, HEAD `9a7002a` ("CRM enrichment: add the implementation brief"). Inventoried 2026-10-03. Every fact cites `path:line-range`. Nothing was modified in the repo.

**The headline:** the admin ("Sentral") already has an extensive CRM. Routes under `app/(admin)/admin/crm/*` cover inbox, pipeline, prospects, contacts, lists, segments, campaigns, journeys, tasks, scoring, templates, stages, partners, consent and triggers. Behind them sit 30+ `crm_*`/growth/brreg tables in migrations 0055–0144. A new brief exists at `docs/crm-enrichment/INSTRUCTIONS.md` (4 141 lines, committed in HEAD).

---

## 1. Package manager, versions, Node

- **Package manager:** npm, `package-lock.json` with `lockfileVersion: 3` (`package-lock.json:4`). No pnpm or yarn lockfile at the root (`ls`).
- **npm scripts** (`package.json:6-31`):
  - `dev`, `build`, `start`
  - `lint` = `eslint app components lib`
  - `typecheck` = `tsc --noEmit`
  - `seed` = `scripts/seed/design-fixture.mjs`; `seed:demo` = `scripts/seed/demo-org.mjs`
  - `verify:pixel`, `verify:probe`
  - `verify:i18n` = `scripts/verify/i18n.mjs` plus `scripts/i18n/respondent-ui.mjs --check`
  - `test` = `vitest run`
  - `modules:validate|seed|publish` (tsx)
  - `qa:up` / `qa:seed` = `bash scripts/qa/up.sh`; `qa:serve`, `qa:visual`
  - `e2e` = `scripts/qa/e2e.mjs`
  - `test:db` = `scripts/qa/test-db.sh`; `test:invariants`
  - `i18n:registry`, `i18n:pages`
  - `teams:package`, `teams:icons`
- **Declared ranges** (`package.json:33-68`) and installed versions (read from `node_modules/*/package.json`):

  | Package | Declared | Installed |
  |---|---|---|
  | next | ^15.5.0 (`:38`) | 15.5.25 |
  | react / react-dom | ^19.2.0 (`:41`) | 19.3.0 |
  | typescript | ^5.6.3 (`:63`) | 5.9.3 |
  | tailwindcss | ^3.4.14 (`:61`) | 3.4.19 |
  | next-intl | ^4.14.2 (`:39`) | 4.14.6 |
  | @supabase/supabase-js | ^2.114.0 (`:35`) | 2.116.0 |
  | @supabase/ssr | ^0.12.5 (`:34`) | — |
  | zod | ^4.5.4 (`:44`) | 4.6.5 |
  | vitest | ^2.1.5 (`:64`) | 2.1.9 |
  | @playwright/test | ^1.63.0 (`:49`) | 1.63.0 |
  | playwright-core | ^1.62.1 (`:58`) | — |
  | eslint | ^8.57.1 (`:55`), config `next/core-web-vitals` (`.eslintrc.json:1-11`) | 8.57.1 |

  Also `@axe-core/playwright` (`:47`) and `pixelmatch` (`:57`).
- **Node version:**
  - No `.nvmrc` exists.
  - `package.json` has no `engines` field (grep found none).
  - CI pins Node 22 with `actions/setup-node@v4` (`.github/workflows/ci.yml:18-21`, `:53-56`; `.github/workflows/i18n-fold.yml:39-42`).
- **Supabase CLI in CI:** pinned at 2.118.0 (`.github/workflows/ci.yml:60-62`).
- **Deploy:** Vercel with `framework: nextjs`, region `fra1` (`vercel.json:1-7`). Supabase is in eu-central-1 (`CLAUDE.md:17`).

## 2. Where the admin lives, and how it is separated

- **Route groups:**
  - `app/(admin)/admin/**` is the shell plus 61 `page.tsx` files and 7 `route.ts` exports: growth/export, crm/consent/export, web/export, translations/sheet, translations/export, audit/export and media/[key] (`find`).
  - `app/(adminauth)/admin/{layout,login/page,mfa/page}.tsx` holds sign-in and MFA. It has no shell, renders `lang="en"` and is noindex (`app/(adminauth)/admin/layout.tsx:1-12`).
- **Admin layout guard** (`app/(admin)/admin/layout.tsx:52-56`):
  - no user → `/admin/login`
  - `!is_admin || !role` → `/admin/mfa`
  - `mfa_enforced && aal !== 'aal2'` → `/admin/mfa`
  - Metadata is `title: 'Sentral'` and noindex (`:18`).
- **Hosts** (`lib/hosts.ts:1-21`):
  - `MAIN_HOST = www.orgpuls.com`
  - `ADMIN_HOST = env ADMIN_HOST || admin.orgpuls.com`
  - `EN_HOST = env EN_HOST || en.orgpuls.com`
  - `PUBLIC_HOSTS = [www, orgpuls.com, en]`, the hosts where `/admin` must not exist.
- **Middleware:**
  - `middleware.ts:1-19` delegates to `safeUpdateSession`. The matcher excludes static assets.
  - Host and path rules are in `lib/supabase/middleware.ts:155-179`. On `ADMIN_HOST`, every non-`/admin` path is rewritten to `/admin…`. On a public host, `/admin*` returns **404**. Local and preview hosts serve `/admin` as is.
  - `/admin/login` is a public path (`:109-110`).
  - `APP_ROOTS` includes `admin` and `api` (`:149`).
  - Unauthenticated admin paths redirect to `/login` on the admin host, else to `/admin/login` (`:199-204`).
- **Session separation:** cookies are host-scoped ("Its session is the host's own cookie", `lib/supabase/middleware.ts:116-121`; D-90 at `docs/DEVIATIONS.md:3734-3741`).
- **CSP:** a separate admin CSP allows `https:` images on `/admin/:path*` (`next.config.ts:59`, `:90-94`).
- **vercel.json** has no admin-specific config (`vercel.json:1-7`). Open item: "DNS and Vercel for admin.orgpuls.com, and `ADMIN_HOST=admin.orgpuls.com` in the production env" is still unchecked (`docs/DECISION_LOG.md:3089`).

## 3. Admin sign-in, roles, MFA, audit

- **Login:**
  - Page: `app/(adminauth)/admin/login/page.tsx:1-26`, with `LoginForm` from `components/admin/AuthForms.tsx`.
  - Action `adminSignIn` (`lib/admin/actions.ts:38-55`): Zod email/password (min 8) → `signInWithPassword` → RPC `admin_whoami`. A non-admin is signed out with the same "invalid" answer. Sets the idle cookie `op_admin_seen`, then redirects to `/admin/mfa`.
- **MFA:**
  - Page: `app/(adminauth)/admin/mfa/page.tsx:1-53`. A non-admin sees the `notAdmin` copy. When `aal2` already holds, or MFA is not enforced, it redirects to `/admin`.
  - `mfaEnroll` (`lib/admin/actions.ts:66-77`): TOTP via `supabase.auth.mfa.enroll`, clearing unverified factors first.
  - `mfaVerify` (`:79-90`): `challengeAndVerify`, then RPC `admin_record_login`, then sets the idle cookie.
  - TOTP is enabled in `supabase/config.toml:31-33`.
- **Guard functions (app side):**
  - `whoami()` (`lib/admin/api.ts:50-70`) returns `{is_admin, role, mfa_enforced, aal, email}`.
  - `call()` wraps every `admin_*` RPC with Zod parsing (`lib/admin/api.ts:26-43`).
  - Role → section map: `SECTIONS`, `BY_ROLE`, `sectionsFor`, `canSee` (`lib/admin/access.ts:8-54`).
  - `CMS_WRITERS` = super_admin, marketing, editor (`lib/admin/access.ts:56-58`).
  - `mayOpenGrowthView` (`lib/admin/growth.ts:38-43`).
  - The app only shapes requests; "the database checks that on every call" (`lib/admin/actions.ts:28-33`).
- **Roles:**
  - TS `ROLES` = super_admin, support, finance, analyst, marketing, editor (`lib/admin/api.ts:23-24`).
  - DB enum `app.platform_role` is created with 4 values (`supabase/migrations/0049_platform_admin.sql:22`). `marketing` is added in `0055_crm.sql:37` and `editor` in `0125_editor_role.sql:6`.
  - Section access per role: `lib/admin/access.ts:11-25`.
  - DB gates:
    - `app.crm_can_read()` = super_admin, marketing, analyst (`0055_crm.sql:505-507`)
    - `app.crm_can_write()` = super_admin, marketing (`0055_crm.sql:509-511`)
    - `app.cms_can_write/read` redefined to include editor (`0126_admin.sql:15-20`)
    - 0126 rewrites eight readers to refuse editor (`0126_admin.sql:124-145`)
- **aal2 in the database:**
  - `app.admin_role()` returns the role only when the admin is active and (`not mfa_enforced` or JWT `aal = 'aal2'`) (`0049_platform_admin.sql:62-72`).
  - `app.is_platform_admin(roles[])` (`:74-76`).
  - `public.admin_whoami()` (`:192-204`).
  - Separation triggers ensure an admin is never a customer member and vice versa: `admin_not_member` and `member_not_admin` (`:37-60`).
- **Tables:**
  - `app.platform_admins` (user_id PK → auth.users, role, product_id default 'orgpuls', mfa_enforced default true, active, created_by, created_at). RLS on, no policy, no grant (`0049_platform_admin.sql:24-35`).
  - `app.admin_audit`: identity id, at, product_id, admin_id/email/role copied, action matching `^[a-z_]+\.[a-z_]+$`, org_id/org_name copied, target_type/id, reason ≤ 500, detail jsonb. It is append-only by a trigger that rejects update, delete and truncate (`:79-111`).
  - Writer: `app.admin_log(action, org, target_type, target_id, reason, detail)` (`:113-123`).
  - Reader: `public.admin_audit_list` (super_admin for everything; support for one org) (`:439-459`). Editor is excluded later (`0126_admin.sql:132`).
  - `app.admin_org_notes` (`0049:126-137`).
- **Granting roles:**
  - `public.admin_set_admin` is super_admin only, needs a reason of ≥ 5 characters, refuses customer accounts and refuses self-demotion (`0049:603-634`). Redefined for 5 roles in `0055_crm.sql:1058-1072`.
  - Neither the DB function nor the app action's Zod enum (`lib/admin/actions.ts:141-165`, enum at `:145`) accepts `editor`. No later migration redefines `admin_set_admin` (grep). How an editor gets granted could not be established; see the last section.
- **Audit areas in the UI:** `AUDIT_AREAS`, `areaOf` and the CSV-safe `csvCell` (`lib/admin/audit.ts:1-51`).
- **Session timeout:** 30-minute idle. `ADMIN_IDLE_MS = 30*60*1000` and cookie `op_admin_seen` (`lib/supabase/middleware.ts:122-124`). Enforced at `:250-261`, which redirects to `?idle=1`. The login page shows the idle notice (`app/(adminauth)/admin/login/page.tsx:6-14`).
- **IP allowlist:** none found. Grep for allowlist/ip_allow in lib, app, components and supabase returned nothing admin-related.
- **Login alerts:** none. The only trace is the audit row `admin.login` written by `admin_record_login` (`0049:206-212`).
- **First super-admin:** made by hand through a dashboard user plus an SQL insert (`docs/DEVIATIONS.md:3743-3754`). The open item is unchecked (`docs/DECISION_LOG.md:3090`).

## 4. Migrations, types, seeds, demo tenant

- **Naming:** `NNNN_snake_case.sql`. There are 157 files from `0001_foundation.sql` to `0190_former_names_and_org_delete.sql`, with gaps (e.g. 0138–0140, 0152–0154, 0157–0164, 0167–0175, 0178–0184, 0187–0189) (`ls supabase/migrations`). A migration is never edited; supersede it with a new one (`CLAUDE.md:65`).
- **How migrations are applied:**
  - CI: `supabase db reset` on a local stack (`.github/workflows/ci.yml:119-122`).
  - Hosted: through the Supabase MCP (`CLAUDE.md:138`, `:159`). The latest commit message says "0190 applied on hosted" (`git log`).
  - Local QA: `scripts/qa/up.sh:7-8` (`supabase start`, optional `db reset`).
  - Edge functions deploy through the Management API: `scripts/functions/deploy.mjs:1-30` (needs `SB_MCP_PAT` or `SUPABASE_ACCESS_TOKEN`; project ref default `jmhhszsnjfqgclxzhciq`).
- **Types:**
  - `types/` holds only `images.d.ts` and `next-intl.d.ts` (`types/images.d.ts:1-4`, `types/next-intl.d.ts:1-19`). Messages are deliberately untyped (D-132).
  - There is no generated DB types file and no gen-types script in `package.json`.
  - Rows are parsed with Zod, not cast, because `supabase gen types` omits the `app` schema (`lib/rounds/read.ts:37`, `lib/entra/import.ts:13`). The exposed API schemas are `public, graphql_public, app` (`supabase/config.toml:24-25`).
  - `docs/crm-enrichment/INSTRUCTIONS.md:184` says "Regenerate database types after every migration with the repository's own command". No such command exists.
- **Seeds:**
  - `scripts/seed/design-fixture.mjs` (1 143 lines, the design's numbers).
  - `scripts/seed/demo-org.mjs` ("Demobedriften AS", org no 990000001, the template for /demo copies; `:1-25`).
  - `scripts/seed/sentral-fixture*.mjs` (admin QA fixture, LOCAL ONLY with two guards; it writes a super-admin with a known password; `sentral-fixture.mjs:1-30`, plus g2/g3/g4 parts).
  - `scripts/qa/seed.mjs` (Lumio tenant).
- **Load order** (`scripts/qa/up.sh:1-22`, mirrored in CI `ci.yml:127-170`, `:276-284`):
  1. modules seed
  2. `app.environment='qa'`
  3. i18n registry
  4. design fixture
  5. demo org
  6. `app.wheel_tick()`
  7. `supabase/tests/local_account.sql`
  8. `scripts/qa/seed.mjs --apply`
- **Lumio AS and Kari Nordmann:**
  - Both exist in the QA seed (`scripts/qa/seed.mjs:1-60`). `QA_ORG = a1000000-0000-4000-8000-000000000001`. `kari@lumio.example` is a `daglig_leder` (`:47`), alongside Hanne Berg, Per Lie, Siri Dahl and Jonas Moe (`:46-52`).
  - The org insert uses `'Lumio AS', '999999981'` (`:171`).
  - It is LOCAL ONLY and writes auth.users with a known local-only password (`:6-8`, `:45`).
  - Kari Nordmann also appears as probe data in SQL tests (`supabase/tests/crm_pipeline_invariants.sql:100`, `former_names_invariants.sql:259`) and as the campaign preview sample (`lib/admin/campaignMail.ts:19`).
  - Neither name is in the hosted-intended seeds (design-fixture, demo-org).

## 5. Background jobs and integrations

- **pg_cron** (extension `0020_scheduler.sql:348`):

  | Job | Schedule | Source |
  |---|---|---|
  | `orgpuls-wheel` (`wheel_tick` + `growth_tick`) | hourly | `0020:350`, redefined `0141_growth_foundations.sql:549` |
  | `orgpuls-dispatch` (pg_net to the edge function) | `*/5` | `0032_dispatch.sql:287-300` |
  | `orgpuls-web-retention` | `17 3 * * *` | `0050:349` |
  | `orgpuls-lifecycle-plan` | `*/15` | `0060:125` |
  | `orgpuls-seo` | `23 3` | `0061:175` |
  | `orgpuls-kpi-capture` | — | `0062:74` |
  | `orgpuls-deletion` | `40 2` | `0064:311` |
  | `orgpuls-final-reminders` | — | `0076:615` |
  | `orgpuls-demo-expire` | — | `0094:772` |
  | `orgpuls-measure-notices` | — | `0099:113` |
  | `orgpuls-participation-alerts` | — | `0099:158` |
  | `orgpuls-evaluation-notices` | — | `0103:175` |
  | `orgpuls-brreg-triggers` | `10 3` | `0143_growth_crm.sql:750` |
  | `orgpuls-lead-route` (`app.lead_route`) | `*/5` | `0143:887` |
  | `orgpuls-entra-sync` | `40 1` | `0165:334` |

  The dispatch URL and secret come from Vault (`vault.decrypted_secrets` names `orgpuls_dispatch_url` and `orgpuls_dispatch_secret`; `0032:299-300`).
- **No Vercel crons and no `app/api/cron`.** `app/api` holds only avmeld, i18n/overrides, sprak and wv (`ls`; `vercel.json:1-7`).
- **GitHub Actions schedule:** the weekly i18n fold, Mondays at `41 3 * * 1` (`.github/workflows/i18n-fold.yml:16-24`).
- **Edge functions** (`supabase/functions/*`; list at `scripts/functions/deploy.mjs:21-22`):
  - `orgpuls-dispatch`: drains `app.outbox` through Brevo. Handles notices, ticket replies, trial mail, then marketing (newsletter and campaigns via `crm_mail_claim`/`crm_mail_done`) on a separate sender. Falls back from SMS, Teams and Slack to e-mail (`orgpuls-dispatch/index.ts:1-40`, `:756`, `:793`).
  - `orgpuls-auth-mail`: Supabase Auth send-email hook via Brevo (`orgpuls-auth-mail/index.ts:1-15`).
  - `orgpuls-mail-events`: Brevo delivery and SMS webhook → `record_crm_event` / `record_mail_event` (`orgpuls-mail-events/index.ts:1-25`).
  - `orgpuls-seo`: Search Console and IndexNow (`orgpuls-seo/index.ts:1-20`).
  - `orgpuls-brreg-triggers`: the Brønnøysund poll for the CRM trigger engine (`orgpuls-brreg-triggers/index.ts:1-25`).
  - `orgpuls-entra-sync`: Entra employee sync (`orgpuls-entra-sync/index.ts:1-18`).
  - `orgpuls-teams-bot`: Teams bot endpoint (`orgpuls-teams-bot/index.ts:1-22`).
  - Shared modules: brevo, brreg, entra, mail, seo, slack, sms, survey-texts, teams.
- **Claim pattern:** `public.dispatch_claim(p_batch)` was created in `0032_dispatch.sql:138` and last redefined in `0100_round_page.sql:224`. The CRM equivalent is `public.crm_mail_claim(p_batch)` (`0115_crm_follow_due.sql:22`; dispatcher `:756`).
- **Email:**
  - Brevo transactional API `https://api.brevo.com/v3/smtp/email` (`supabase/functions/_shared/brevo.ts:1-30`).
  - Transactional sender: `ORGPULS_MAIL_FROM` / `_NAME`. Marketing stream: `ORGPULS_MARKETING_FROM` / `_NAME`, which must be on a different domain or nothing marketing is sent (`orgpuls-dispatch/index.ts:157-177`). Brevo domain and sender setup probes are at `:213-242`.
  - Tables: `app.mail_streams` and `app.mail_templates` (`0144_growth_magnets_deliverability.sql:166`, `:187`).
- **SMS:** Brevo `transactionalSMS/send` (`_shared/brevo.ts:83`). Sender env `ORGPULS_SMS_SENDER`.
- **Slack and Teams:** customer-side survey-link channels, not admin notifications. Slack: OAuth v2, scopes at `_shared/slack.ts:1-30`, callback `app/(app)/integrasjoner/slack/callback/route.ts`. Teams: bot `0176_teams_channel.sql`.
- **Billing:** no Stripe anywhere (grep). `app.billing` is invoice/EHF only: "nothing here holds a card or talks to a payment provider" (`0048_billing.sql:1-45`). Stripe is only recommended (`docs/BILLING_RECOMMENDATION.md:1-6`). Admin Billing & plans shows counts, not money (`docs/DEVIATIONS.md:7487-7491`).
- **Feature flags:**
  - `lib/flags.ts:1-59`: `FLAG_NAMES`, env `ORGPULS_FLAGS` (comma list or `*`).
  - `lib/flags.signed-off.json:1-7`: locale_en, home_industries_block, engagement_since_last, engagement_thanks, engagement_pulse_reason.
  - DB-side "settings" singletons rather than a flags table: `app.platform_settings` (auto_approve, `0101_translations_admin.sql:23-34`; allow_indexing added in `0126_admin.sql:150-152`), `app.crm_settings` (`0055_crm.sql:54-62`), `growth_settings` (`0142:34`), `brreg_settings` (`0143:98`), `lifecycle_settings` (`0060:33`) and `demo_settings` (`0094:33`).

## 6. Encryption of provider tokens and credentials at rest

- **Supabase Vault is the mechanism.**
  - Slack bot and refresh tokens are Vault secrets. `app.slack_installs` holds only their uuids (`access_secret`, `refresh_secret`) with RLS on, no policy and no grant (`0185_slack_channel.sql:14-22`, `:103-135`).
  - Calls: `vault.create_secret` (`:373-374`), `vault.update_secret` (`:536-537`), and deletes on disconnect (`:381`, `:694`, `:722`).
  - The dispatcher URL and secret are read from `vault.decrypted_secrets` by name (`0032:299-300`, `0061:182-183`, `0143:689-690`, `0165:293-294`, `0185:219-220`).
- **Entra:** stores only the tenant id (`app.entra_tenants`, `0155_entra_signin.sql:54-71`). Graph access uses certificate credentials from edge env `ENTRA_CLIENT_ID`, `ENTRA_CERT_PRIVATE_KEY` and `ENTRA_CERT_THUMBPRINT` (`orgpuls-entra-sync/index.ts:10-13`, `:22-27`).
- **Teams:** bot credentials are env (`TEAMS_BOT_*`).
- **Not used:** pgsodium, pgcrypto `pgp_sym_*` and app-level `createCipheriv` (no grep hits in migrations, lib or app).
- **CRM:** stores tokens as hashes and keeps the suppression list as sha256 of the address (`docs/DECISION_LOG.md:1958-1961`).

## 7. Components, tokens, admin shell, language

- **Tailwind tokens** (`tailwind.config.ts:1-131`):
  - Colours transcribed from the bundle (`:13-63`), including Sentral's `viz1..viz5` chart palette (`:57-62`).
  - Fonts: display Playfair, sans DM Sans, `site` (`:64-70`).
  - Base font size 14px (`:71-74`).
  - Radius scale focus/bar/ctl/btn/cta/tile/opt/row/note/panel/card/pill (`:75-105`).
  - Max widths (`:111-115`); keyframe `ht-in` (`:116-125`).
  - No `darkMode` key and no plugins (`:126-128`).
- **No shadcn/ui and no Radix:** there is no `components.json`, and the lockfile has 0 `radix` matches.
- **Admin primitives** (`components/admin/ui.tsx`, 221 lines; doc `:6-11`):
  - Components: `PageHead`, `Card`, `Stat`, `Badge`, `Avatar`, `Bar`, `Segments`, `Table`, `Td`, `ALink`, `Problem`.
  - Formatters: `day`, `when`, `nok`, `pct`.
  - Class constants: `BTN` (including `dark` = ink-filled button, `:212`), `FIELD_LABEL`, `FIELD` (`:12-221`).
  - Also in `components/admin/`: `AdminShell.tsx` (297 lines; top bar plus sub-bar, phone sheet; doc `:26-40`), `Modal.tsx`, `SectionTabs.tsx`, `icons.tsx`, `tones.ts` and ~40 feature form files (CrmBoard, CrmForms, CampaignStudio, CrmSequence, ContactDialogs, GrowthCrmForms…).
  - Nav: `lib/admin/nav.ts:1-80`, with areas overview, customers, crm, marketing, content, analytics, growth and admin.
- **Admin layout file:** `app/(admin)/admin/layout.tsx:1-100`. `sentral.css` adds the Bricolage Grotesque wordmark font (`app/(admin)/admin/sentral.css:1-13`).
- **Dark mode:** none in the admin. There are no `dark:` variants or `prefers-color-scheme` in components/admin, app/(admin) or app (grep; the only "dark" hit is the `BTN.dark` key). The QA Playwright config forces `colorScheme: 'light'` (`playwright.config.ts:66`).
- **Admin UI language:**
  - English by decision (`app/(admin)/admin/layout.tsx:14-17`; `docs/DEVIATIONS.md:3693-3695`).
  - Strings come from the next-intl namespace `admin`, fetched with `getTranslations({ locale: 'en', namespace: 'admin' })` (layout `:58`; 67 call sites under app/(admin)).
  - The namespace is at `messages/en.json:8393` and `messages/no.json:8393`. In `no.json` it is mostly English too: 3 664 leaves are identical to en and 142 differ.
  - Sub-keys: title, nav, role, common, login, mfa, notAdmin, dashboard, orgs, org, users, ops, audit, admins, web, tickets, crm, health, seo, acquisition, deletions, modules, legal, translations, cms, customers, analytics, billing, settings, delivery, growth.
- **Admin design reference:** `design-reference/sentral/Sentral_Admin.dc.html`.

## 8. Test tooling and CI

- **Vitest** (`vitest.config.ts:1-24`): node environment, includes `tests/unit/**/*.test.ts`, aliases `server-only` to a stub. There are **71** test files in `tests/unit/`, e.g. `admin-roles`, `admin-nav-crm`, `admin-nav-growth`, `growth-crm`, `campaign-design`, `pipeline` and `customers` (`ls`).
- **Playwright** (`playwright.config.ts:1-117`): testDir `qa/e2e`, workers 1, Lumio tenant on local Supabase.
  - Projects: setup, mobile (390), small (360), tiny (320), pseudo, desktop (1280; `@manager|@public`).
  - Web server: `scripts/qa/serve.mjs`.
  - Specs: `invariants`, `p0-baselines`, `p1-language`, `pseudo`, `respondent-flow`, `respondent-keyboard`, plus `auth.setup.ts`, `fixtures.ts` and `respondent.ts`.
  - Tags:
    - `@flow`: `respondent-flow.spec.ts:32`, `respondent-keyboard.spec.ts:17`
    - `@invariants`: `invariants.spec.ts:19`
    - `@pseudo`: `pseudo.spec.ts:18`
    - `@respondent`, `@manager` (`p0-baselines.spec.ts:26`), `@public` (`p1-language.spec.ts:95`)
    - `@p0.2`, `@p1.2`, `@p1.3`
  - **No `@journey` tag exists** (grep). There are **no admin/Sentral e2e specs**.
- **axe:** used in `qa/e2e/respondent.ts` through `checkScreen(..., { axe })` (`pseudo.spec.ts:31`, `respondent-flow.spec.ts:17`, `:70`), with exceptions in `qa/known-issues.json`. Also `scripts/verify/landing-audit.mjs`.
- **SQL suites:** `supabase/tests/` has 115 files: 113 `*_invariants.sql`, plus `design_figures.sql` and `local_account.sql`. CRM and admin suites include admin, admin_roles, admin_attention, audit_p0–p2, crm, crm_pipeline, crm_stages, crm_sequences, crm_inbox, crm_deal, crm_journeys, crm_sync, crm_win_rate, crm_designed_mail, consent_ledger, growth_crm, growth_events, growth_firewall, growth_registry, growth_g4, suppression, settings and account_owner. `tests/invariants/invariants.sql` also exists.
- **CI** `.github/workflows/ci.yml` runs on pull_request and on push to main (`:3-6`):
  - **Job `static`** (`:13-46`): checkout → Node 22 → `npm ci` → `tsc --noEmit` → `npm run lint` → `modules:validate` → `npm test` (vitest) → `verify:i18n` → `next build` with placeholder Supabase env.
  - **Job `invariants`** (`:48-323`):
    1. checkout and Node 22
    2. supabase/setup-cli 2.118.0
    3. a PostgREST v16.3 retag workaround (`:75-98`)
    4. `supabase start` with retries and the ECR fallback (`:105-117`)
    5. `supabase db reset` (`:121-122`)
    6. seed modules (`:127-133`)
    7. design fixture (`:137-141`)
    8. demo org (`:148-152`)
    9. `wheel_tick()` (`:160-163`)
    10. `local_account.sql` (`:167-170`)
    11. `design_figures.sql` (`:178-181`)
    12. every `supabase/tests/*_invariants.sql`; all run and the step fails at the end (`:192-201`)
    13. **`supabase db lint --level warning`** (`:203-204`)
    14. **`node scripts/audit/wiring.mjs --security-only --db …`** (`:209-210`)
    15. `next build` against the local DB (`:225-230`)
    16. smoke: `shoot.mjs` of 11 product routes plus `mobile.mjs`, failing on `[read|write|org|middleware]` log lines (`:232-253`). **No admin route is smoked.**
    17. make the stack QA (`:276-284`)
    18. Playwright e2e `--grep '@flow|@pseudo|@invariants'` on mobile, small, tiny and pseudo (`:286-294`)
    19. page-map check (`:300-303`)
    20. upload artifacts and print the server log (`:305-323`)
  - **`i18n-fold.yml`** (`:1-84`): a weekly fold of approved texts into `messages/*.json` as a PR.
- **`scripts/audit/wiring.mjs`** (`:1-25`): the machine half of `/audit`. Checks:
  - S*: catalog security; S4 anon-executable and S5 client-writable are inventoried against `.claude/skills/audit/allowlist.json`.
  - W1: unread columns.
  - W2: settings columns no function reads.
  - R1: public RPCs no app file calls.
  - M: the settings matrix.
  - Exits 1 on any finding.
- **Pixel gate:** `scripts/verify/pixel.mjs:1-30` (0.1 % region diff against `design-reference/orgpuls/baselines/`). The admin has its own gate, `scripts/verify/sentral-run.mjs:1-25`: 100×100 tiles at 0.1 %, with claims in `scripts/verify/sentral-claims.json` and routes in `sentral-routes.mjs`. It stays a local gate, not in CI (`docs/DECISION_LOG.md:3163-3180`, X-098).
- **Dependency audit:** none. There is no `npm audit` step and no Dependabot config (`.github/` holds only `workflows/`).

## 9. Environment variables (names only) and agent config

- **No `.env.example`** or any `.env*` file in the repo (`find`). Names are documented in `docs/CLOUD_SETUP.md:41-47`, `:79-90`.
- **App (Next):**
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `ADMIN_HOST`, `EN_HOST`, `APP_HOST`
  - `ORGPULS_FLAGS`, `ORGPULS_SITE_URL`, `ORGPULS_MARKETING_FROM`
  - `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `TEAMS_BOT_APP_ID`, `ENTRA_CLIENT_ID`
  - `VERCEL`, `VERCEL_ENV`, `NODE_ENV`, `NEXT_DIST_DIR`, `ORGPULS_PSEUDO`
- **Edge functions** (`Deno.env.get` grep):
  - Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (platform-provided), `SUPABASE_ANON_KEY`
  - Mail and SMS: `BREVO_API_KEY`, `ORGPULS_MAIL_FROM`, `ORGPULS_MAIL_FROM_NAME`, `ORGPULS_MARKETING_FROM`, `ORGPULS_MARKETING_FROM_NAME`, `ORGPULS_SUPPORT_MAIL`, `ORGPULS_SMS_SENDER`
  - Orgpuls: `ORGPULS_APP_URL`, `ORGPULS_SITE_URL`, `ORGPULS_FLAGS`
  - Webhook secrets: `ORGPULS_DISPATCH_SECRET`, `ORGPULS_AUTH_HOOK_SECRET`, `ORGPULS_MAIL_EVENTS_SECRET`
  - Search Console: `GSC_SERVICE_ACCOUNT`, `GSC_SITE`
  - Entra: `ENTRA_CLIENT_ID`, `ENTRA_CERT_PRIVATE_KEY`, `ENTRA_CERT_THUMBPRINT`
  - Slack: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`
  - Teams: `TEAMS_BOT_APP_ID`, `TEAMS_BOT_SECRET`, `TEAMS_BOT_TENANT_ID`, `TEAMS_BOT_CERT_KEY`, `TEAMS_BOT_CERT_PEM`, `TEAMS_SERVICE_URL`
- **Scripts, QA and CI:**
  - `ORGPULS_DEV_EMAIL`, `ORGPULS_DEV_PASSWORD`, `SENTRAL_ADMIN_PASSWORD`
  - `SB_MCP_PAT`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`
  - `QA_DATABASE_URL`, `QA_DIST_DIR`, `QA_STEP`, `QA_PORT`, `QA_FLAGS`, `AUDIT_DB`, `FOLD_WAIT_MS`
  - `PLAYWRIGHT_BROWSERS_PATH`, `PLAYWRIGHT_CHROMIUM`, `CHROMIUM`, `AXE_PATH`, `SAMTALE_TOKENS`
  - `CI_SUPABASE_ANON_KEY` (a GitHub var, `ci.yml:46`)
- **`.mcp.json`** (`:1-10`): only a `playwright` server via `scripts/playwright-mcp.sh`. The Supabase MCP is the claude.ai connector, not `.mcp.json` (`docs/CLOUD_SETUP.md:66-77`).
- **`.claude/settings.json`** (`:1-16`): `defaultMode: bypassPermissions`. It allows Bash, Read, Write, Edit, MultiEdit, NotebookEdit, Glob, Grep, Agent, Task, TodoWrite, WebFetch, WebSearch, Artifact and `mcp__supabase` / `mcp__Supabase` / `mcp__playwright` / `mcp__github` / `mcp__Claude_Code_Remote`. Deny and ask lists are empty, and `enableAllProjectMcpServers: true`. One skill exists: `.claude/skills/audit/` (SKILL.md, allowlist.json, journeys.md, sql/security.sql, sql/wiring.sql).

## 10. docs/

**Files** (one line each, from each file's own header):

- `BILLING_RECOMMENDATION.md`: subscriptions and invoices recommendation (Stripe plus EHF), 2026-09-25.
- `CLOUD_SETUP.md`: how to set up a Claude Code cloud session (settings, env, setup script).
- `CODE_REVIEW_2026-09-23.md`: full code and database review at 5f42db4.
- `DECISION_LOG.md` (3 226 lines): append-only decisions (D-001…) and the execution record (X-001…X-100), plus "Open items".
- `DEVIATIONS.md` (10 435 lines): every departure from the design bundle (D-01…D-206).
- `IMPLEMENTATION_PLAN.md`: the original segment plan, superseded by PLAN_2026-09-24_design3.
- `PLAN_2026-09-24_design3.md`: Design 3 review and phases P0–P8.
- `landingsside-gjennomgang.md`: instructions for reviewing landing pages (NO).
- `audits/2026-09-28-deep.md`: the deep /audit report.
- `audits/2026-09-28-wiring.md`: the first wiring audit run.
- `crm-enrichment/INSTRUCTIONS.md` (4 141 lines): **the CRM Enrichment brief v1.0 (2026-10-03): 183 features, 29 user flows, 45 system flows.**
- `implementation/bransjesider-og-tilleggsmoduler.md`: industry modules and industry pages instructions.
- `implementation/crm-conversion.md`: CRM stages and campaign conversion research (2026-09-27).
- `implementation/engagement-phase2-plan.md`: engagement phase 2 plan.
- `implementation/engagement-phases.md`: phased engagement features with QA (the source of the Lumio tenant).
- `implementation/gap-analyse-soundings.md`: gap analysis against the "Soundings" research (NO).
- `implementation/growth-admin.md`: the Sentral › Growth implementation plan (G0–G4).
- `implementation/multilingual-gap-analysis.md`: the multilingual guide mapped against the product.
- `implementation/sentral-admin-plan.md`: Sentral admin review and plan from design revision 2.
- `implementation/step0-findings.md`: step 0 findings for industry modules.
- `implementation/translation-files.md`: survey-language translation files and admin › Translations.
- `integrations/entra-signin.md`: Entra sign-in operator setup (D-201).
- `integrations/slack.md`: Slack owner setup (D-205).
- `legal/vilkar-utkast.md`: terms of use source draft (NO).
- `marketing/konverteringsinstruks.md`: conversion copy and image instructions for Claude Design (NO).
- `reference/*.html` (4 files): rendered industry pages and question sets for bygg-og-anlegg and helse-og-omsorg.
- `reviews/landing-2026-09-25.md`: landing page review results (NO).
- `translations/README.md`, `da/lt/pl/sv/uk.md`: machine-draft notes per survey language.

**DECISION_LOG.md entries matching the keywords** (CRM, contact, consent, campaign, journey, sequence, deal, pipeline, prospect, segment, suppression, lead, scoring, partner, admin role, audit, settings). Ranges are section bounds. "Date" is the first 2026 date in the section; "—" means undated.

| ID | Lines | Date | Gist |
|---|---|---|---|
| X-058 | 1826-1872 | — | Platform admin as a second door: `platform_admins`, roles, aal2 in the DB, append-only `admin_audit`, role/read matrix |
| X-059 | 1873-1911 | — | Site counts its own visits; campaign/UTM attribution without following a person |
| X-061 | 1943-1970 | — | CRM (0055): contacts and consent in Orgpuls, never a respondent; basis as data; hashed suppression; separate marketing stream; opens/clicks for CRM sends only |
| X-062 | 1971-1993 | — | CRM pipeline (0056–0058): companies are the unit of sales, people the unit of consent; per-list consent; B2B role-address exception; templates as data |
| X-076 | 2311-2334 | 2026-09-27 | Stages as data, stage-aimed campaigns, follow-ups, person as sender (0093); research on what converts; mfl. § 15 decides the audience |
| X-077 | 2335-2355 | 2026-09-27 | Demo of one's own behind a proved address (consent box; lead) |
| X-078 | 2356-2373 | 2026-09-28 | No approval gates; dispatcher deployed so CRM campaigns go out from a personal sender |
| X-087 | 2493-2525 | 2026-09-28 | Deep audit P0/P1 fixes (journeys = user journeys) |
| X-088 | 2526-2545 | 2026-09-28 | Journeys' P1s (user journeys) |
| X-091 | 2609-2632 | 2026-09-29 | Admin in sections; Brreg prospecting with manager name (0110); automatic follow-ups (0111); board with exit criteria and inbox SLA (0112) |
| X-092 | 2633-2666 | 2026-09-29 | Designed campaign mail, five blocks, ten templates, placeholder block, inbox/deliverability check, studio |
| X-093 | 2667-2684 | 2026-09-29 | Municipalities as a span (CRM import); menu fits the screen |
| X-094 | 2685-2736 | 2026-09-29 | Template CMS; automatic follow-up waits for its people (0115) |
| X-095 | 2737-2826 | 2026-09-29 | Sentral redesign phases 0–10: overview/attention (0116), account owner (0118), deals `value_nok` (0119), journeys/tasks (0120), web report, CMS, media, editor role (0125/0126), site settings, audit log UI |
| X-097 | 3149-3162 | 2026-09-30 | CRM split into CRM (sales) and Marketing (mail); Contacts/Lists/Segments as tabs |
| X-099 | 3181-3208 | 2026-09-30 | Deep audit open P2/P3 findings |
| X-100 | 3209-3227 | — | Innsikt on the grunnlinje, the audit's proving tests |
| Open items | 2874-3148 | — | CRM tracking consent (EDPB 2/2023) undecided `:2878`; soft opt-in legal question `:2879`; add a sender and test `:2880`; admin host DNS `:3089`; first super-admin `:3090`; CRM lifecycle sequences and coupons open `:3122` |

Weaker keyword hits ("suppression" meaning k-anonymity suppression, "segment" meaning survey segments) are not CRM-relevant: X-039 (1451-1472), X-048 (1558-1565), X-053 (1716-1741).

**DEVIATIONS.md entries:**

| ID | Lines | Date | Gist |
|---|---|---|---|
| D-90 | 3689-3786 | — | Platform admin phase 1 on its own host: TOTP, 30-minute idle, audit, ADMIN_HOST, becoming an admin |
| D-91 | 3787-3842 | — | Admin web analytics and signup attribution (campaign tags) |
| D-100 | 4256-4297 | — | Web analytics location without the full IP (campaign) |
| D-101 | 4298-4418 | — | Marketing CRM: contacts, consent, segments, campaigns; marketing role; what is not built |
| D-102 | 4419-4465 | — | "Fortsett med Google" (consent, settings) |
| D-103 | 4466-4584 | — | Full CRM: prospects, lists, templates, A/B, reporting (0056–0058); limits |
| D-104 | 4585-4649 | — | Server-side attribution, AI channel, privacy statement (consent, leads) |
| D-105 | 4650-4706 | — | Trial service mails and account health with reasons |
| D-106 | 4707-4765 | — | Search and content in the admin, IndexNow |
| D-107 | 4766-4811 | — | Dashboard over time, cost per customer (campaign spend) |
| D-108 | 4812-4872 | — | Cancellation and deletion 30 days after the agreement ends (CRM contacts affected) |
| D-130 | 5799-5897 | 2026-09-27 | Legal review page (consent texts, audit) |
| D-142 | 6564-6634 | 2026-09-27 | CRM pipeline: stages as data, campaigns move stages, follow-ups, person sender (0093) |
| D-143 | 6635-6698 | — | Demo copy per visitor (consent box; CRM lead) |
| D-159 | 7146-7183 | 2026-09-29 | CRM design and brief built on the existing CRM: what was built, what was not |
| D-160 | 7184-7206 | — | Designed mail and inbox check: what is checked, what is not |
| D-162 | 7232-7246 | 2026-09-29 | Sentral shell: drawn vs not |
| D-163 | 7247-7270 | 2026-09-29 | Sentral Overview: drawn vs not (pipeline) |
| D-164 | 7271-7302 | — | Sentral Customers (account owner, audit) |
| D-165 | 7303-7338 | — | Sentral Pipeline: deal = company in pipeline, `value_nok` estimate, contact naming |
| D-166 | 7339-7365 | — | CRM II: journeys are follow-up chains (no second engine), tasks, tickets, lead scoring |
| D-167 | 7366-7400 | — | Sentral Analytics |
| D-168 | 7401-7441 | — | Sentral Content (SEO scoring, settings) |
| D-170 | 7470-7511 | 2026-09-29 | Sentral Admin: role mapping (Owner = super_admin, editor new, no Developer), billing without money, site settings, audit log (not pruned; 500 listed, 1 000 exported) |
| D-176 | 7711-7816 | — | Retention and deletion routine (CRM contacts, suppression) |
| D-178 | 7845-7920 | — | CRM win rate, pipeline value, manual sequence steps (0137) |
| D-179 | 7921-8002 | — | Ticketing phase 2 |
| D-181 | 8104-8370 | 2026-09-30 | Sentral › Growth G0: area, routes, admin pixel gate |
| D-182 | 8371-8675 | — | Growth G1: events, anonymity firewall, consent ledger (`consent_purposes` / `consent_records`), health score |
| D-183 | 8676-8869 | — | Growth G2: registry, eight Growth pages, funnel and lead math |
| D-185 | 8870-9152 | — | Growth G4: lead magnets and deliverability |
| D-184 | 9153-9570 | 2026-09-30 | Growth G3: consent, Brønnøysund triggers, partners, fit × intent lead scoring, task SLA |
| D-191 | 9764-9800 | 2026-10-02 | Demo signup and guide (CRM contact) |
| D-201 | 10155-10203 | 2026-10-02 | Entra sign-in (consent, settings) |
| D-204 | 10204-10247 | 2026-10-02 | Entra rules at token issuance (audit) |

Weaker hits (k-suppression, survey segments, scoring of indices) that are not CRM-relevant: D-68, D-75, D-77, D-79, D-111, D-114, D-123, D-128, D-140, D-157, D-198.

## 11. docs/IMPLEMENTATION_PLAN.md: admin and CRM parts

There are **none**. The file (`docs/IMPLEMENTATION_PLAN.md:1-166`, read in full) records only the original product segment plan:

- the twelve screens (`:7-35`)
- the factors and scoring (`:37-66`)
- the standing rules (`:70-85`)
- the per-segment gates G1–G7 (`:89-103`)
- segments S0–S14 (`:107-154`)
- risks (`:158-165`)

It states that it is superseded by `docs/PLAN_2026-09-24_design3.md` (`:3`). The admin and CRM plans live instead in:

- `docs/implementation/sentral-admin-plan.md` (Sentral, revision 2)
- `docs/implementation/growth-admin.md` (Growth G0–G4)
- `docs/implementation/crm-conversion.md` (CRM research)
- `docs/crm-enrichment/INSTRUCTIONS.md` (the new brief)

## Could not establish

- **How the `editor` role is granted.** `admin_set_admin` (`0055_crm.sql:1059-1072`) and the `setAdmin` Zod enum (`lib/admin/actions.ts:145`) accept only 5 roles, and no later migration redefines it. Either editor is granted by hand in SQL, or this is a gap. Not confirmed against the hosted DB.
- **Hosted state.** Whether every repo migration is applied on hosted (only the commit message claims 0190 is), whether the cron jobs and Vault secrets exist there, and whether `ADMIN_HOST` is set in Vercel. The Supabase MCP and Vercel were not queried.
- **The "repository's own command" for type generation** cited by `docs/crm-enrichment/INSTRUCTIONS.md:184`. No such script exists.
- **The full text of DECISION_LOG.md (226 KB) and DEVIATIONS.md (717 KB).** They were searched section by section with a keyword parser and the key entries read (X-058, X-061, X-062, X-076, X-078, X-091, X-092, X-094 head, X-095, X-097, D-90, D-170, openings of D-101…D-185). Gists of the other entries rest on their headers and openings. Dates are the first 2026 date in each section and may not be the entry date.
- **`docs/crm-enrichment/INSTRUCTIONS.md`.** Only its header and line 184 were read, not the full 4 141 lines.
- **Admin pixel and e2e coverage in CI.** None found. Whether `sentral-run.mjs` is run regularly could not be established beyond X-098.
- **SMS provider.** Inferred as Brevo from `_shared/brevo.ts:83`. `_shared/sms.ts` was read only in its header.
- **A dedicated admin login-alert or IP-allowlist mechanism outside the repo** (e.g. a Supabase dashboard setting) cannot be seen from code.
