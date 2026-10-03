# 06 — Questions and conflicts

Phase A output (A3.6). Every Conflict and Unknown from 04 and 05, every difference found between the code,
Appendix 2 and the brief, and the ten open points of Part G. Format per A11: what was found, the options,
what each changes, and what work is blocked. Answers go to `DECISIONS.md` with the date.

Nothing below has been acted on. Phase B (the implementation plan) waits for these answers (A3.7).

---

## A. Security findings in existing code (need a decision now, not at a phase gate)

### Q1. A SECURITY DEFINER function returns contact e-mails to anonymous callers
- **Found.** `app.crm_follow_audience(app.crm_campaigns)` is `SECURITY DEFINER`, returns `(contact_id, email)` for
  the contacts who received the campaign named in the row's `follows_id`, and no migration revokes it, so
  `anon` and `authenticated` keep PostgreSQL's default `EXECUTE` (body: `mig/0111_crm_sequences.sql`, revised in
  `0137`). The `app` schema is exposed to PostgREST (`supabase/config.toml:24-25`, mirrors the hosted setting).
  Verified on the local stack on 2026-10-03:
  - `has_function_privilege('anon', …, 'execute')` = true (also `app.crm_chain_depth(uuid)`).
  - `POST /rest/v1/rpc/crm_follow_audience` with the **anon** key and `Content-Profile: app` → HTTP 200.
  - With a throwaway campaign and one send row (deleted straight after), the anonymous call returned that
    contact's id and e-mail address.
  - Exploiting it needs a campaign UUID. Campaign ids do not appear in the public archive or mail links (grep of
    `crm_archive*` and `supabase/functions/_shared/mail.ts`), so the practical risk is low; it still breaks
    "deny by default" (A7.1, CLAUDE.md invariant 4).
- **Not checked:** the hosted project's grants. Rule R8 forbids running against production; a read-only
  `has_function_privilege` SELECT through the Supabase MCP would settle it. **May I run that one read?**
- **Options.** (a) A new migration: `revoke execute on function app.crm_follow_audience(app.crm_campaigns),
  app.crm_chain_depth(uuid) from public, anon, authenticated;` plus a test in `crm_sequences_invariants.sql`
  that fails if any `app.crm_*` SECURITY DEFINER function is executable by `anon`/`authenticated`. (b) The same,
  widened to every SECURITY DEFINER function in `app` (24 others are executable by `anon`; they are trigger
  functions and org-scoped helpers such as `app.is_org_member`, which look intended — each needs a look).
- **Changes:** closes the hole; no behaviour change for the dispatcher (it runs as `service_role`).
- **Blocks:** nothing else, but I recommend shipping (a) as its own small change before Phase C. It is outside
  this phase's "no code" rule, so it needs your go-ahead.

### Q2. The `editor` admin role cannot be granted
- **Found.** The admins page offers `editor` (`app/(admin)/admin/admins/page.tsx:22,38`, from `ROLES` in
  `lib/admin/api.ts:23`), but `public.admin_set_admin` (`mig/0055_crm.sql:1071`, never redefined) accepts only
  super_admin, support, finance, analyst, marketing → `invalid_role`. `admin_roles_invariants.sql:31` inserts
  editors with direct SQL, so no test catches it.
- **Options.** Fix the whitelist in a new migration plus a test that calls `admin_set_admin` with every enum
  value; or remove `editor` from the UI. **Blocks:** nothing in this brief; it bears on SEC-07.

### Q3. Some admin gates list excluded roles instead of allowed ones
- **Found.** After `0126:131-132`, `marketing` can read `admin_org_detail` and the full admin audit trail
  (`0049:265,447` as patched). Appendix 2 limits the audit trail per org to support/super-admin.
- **Question.** Intended? If not, the fix is an allow-list. **Blocks:** SEC-07 design.

### Q4. Admin reads that write no audit row
- **Found.** About 25 admin readers (13 in the CRM, e.g. `admin_crm_segment_preview`, which returns up to 20
  contact e-mails) never call `app.admin_log`, though the file headers say every read does (`lib/admin/api.ts:17-22`).
  The web and audit CSV exports leave no audit row (04 §7).
- **Options.** Add the audit calls in Phase 0 (it strengthens, so R7 allows it) or record as accepted.
  **Blocks:** SF-01 step 6, A7.11.

---

## B. Conflicts between the brief and the code

### Q5. A deal is a company today (PIP-03 Conflict)
- **Found.** `app.crm_companies` carries stage, value, owner, next step and lost reason; there is no deal entity,
  so one company has at most one deal (03 §7; `mig/0119_crm_deal_value.sql:23`). The brief wants deals as their
  own record with a primary person, participants, products, many per organization.
- **Options.**
  (a) New `app.crm_deals` (company FK, own stage/value/owner/currency/close date), migrate each company's
  current deal into it, keep companies as the organization record. Changes every pipeline screen, the stage
  history, win rate, journeys' `stage_target`, the board and five SQL suites. It is a data rewrite → needs your
  explicit approval (R8).
  (b) Keep company-as-deal and adapt the spec (one open deal per company). Cheaper; several features (PIP-08,
  CRM-07/08, DOC, forecasting per deal) become awkward or impossible.
- **Blocks:** all of PIP, LEA-03, CRM-07/08, DOC, INS deal reports.

### Q6. Two organization tables
- **Found.** Customers live in `app.organizations` (product), prospects and customers-as-deals in
  `app.crm_companies`, linked by `crm_companies.org_id`. The brief says "extend the admin's organization
  record; add no second company table" but one already exists.
- **Question.** Which is "the organization" that CRM-01/13/14 extend: `crm_companies` (all companies, with a link
  to a customer org) or `app.organizations`? My reading of the code says `crm_companies`. **Blocks:** CRM-01,
  CRM-11, CRM-13, Part F mapping.

### Q7. Leads (LEA)
- **Found.** Leads are companies in a `lead` stage plus inbound contacts in the inbox, so they appear in the
  pipeline; LEA-01's acceptance says a lead never does.
- **Options.** A new `app.crm_leads` table linked to contact/company (brief), or a "leads" pipeline. **Blocks:** LEA.

### Q8. Rule defaults that would loosen what exists (R5 against R7)
- **Found.** The brief sets these defaults to *off*; today the code is stricter:
  - Contact rule: a new contact needs a consent source (`lib/admin/crmActions.ts:40-75`).
  - Consent source on import: a column of the import today.
  - Typed reason: required today on unsubscribe, erase, list removal and the customer-exception setting.
  - Second-admin approval: absent today, so no conflict.
  CLAUDE.md lists weakening an invariant as "stop and ask", and R7 forbids loosening existing checks without
  your approval.
- **Options.** (a) Ship each as a setting whose default is the **current** behaviour (no loosening), and you
  switch it off. (b) Ship with the brief's defaults (off) on your written approval. Open point 4 asks for a legal
  review of the unrestricted defaults first.
- **Blocks:** CUS-07 defaults, CRM-01/09.

### Q9. Hard-coded caps in today's code (R5)
- **Found.** 30 blocks per campaign, 5,000 rows per contact import, 500 ids per bulk move, 200 rows per register
  import, 500 companies per read (silently truncating the task picker and `refreshManagers`), 300 contacts per list.
- **Question.** Turn each into a setting (R5), or keep some as technical safeguards with a stated reason?
  **Blocks:** CUS-07.

### Q10. No billing mirror (CRM-08, ENT-03, UF-26)
- **Found.** No Stripe, no invoice table, the price list is code (D-93, D-163, D-164, D-170). Appendix 2 and the
  brief both assume Stripe mirrored into the database.
- **Question.** Where should Orgpuls's own MRR/ARR on deals come from, and what does "buy an add-on" go through?
  **Blocks:** CRM-08 (the Orgpuls part), ENT-03, INS-06.

### Q11. Company identification of web visitors (WEB-02 Conflict)
- **Found.** Web analytics keeps only a salted hash of IP + user agent, with a daily-rotating salt, so no consent
  banner is needed (Appendix 2 "Consent and tooling"; `app/api/wv/route.ts`). IP-to-company matching needs the
  network address sent to a provider and, in practice, stored.
- **Question.** Is company identification wanted under that design, with which provider and legal basis?
  **Blocks:** WEB-02 to WEB-04, UF-19.

### Q12. The firewall and count-only reads of responses
- **Found.** `app.health_score` and `app.growth_tick` count rows in `app.responses` (counts, no content), reached
  from admin functions. R6 says no CRM function may *reach* response-level tables; PRO-03 wants the health score
  as a scoring criterion.
- **Options.** (a) Treat organization-level counts through the existing health score as allowed (Appendix 2's
  "aggregates ≥ 5"), and test that no CRM function references a response table except through it. (b) Ban it,
  and drop the health score as a criterion.
- **Also:** `admin_invariants #3` scans only `public.admin_*` bodies; indirect reads through `app.*` helpers are not
  caught. The brief's firewall test (A8) would need to follow calls. **Blocks:** PRO-03, the firewall test design.

### Q13. Anonymity threshold: 5 in Appendix 2, floor 3 in the product
- **Found.** D-198 / `mig/0150_k_floor_three.sql`: floor 3, default 5, frozen per round. Appendix 2 and Part G say
  n ≥ 5 for every admin view.
- **Question.** Confirm the product rule (floor 3, default 5) governs the admin too. **Blocks:** nothing in CRM
  directly; the firewall tests cite the threshold.

### Q14. `product_id`
- **Found.** On 12 tables only, none created after 0056 (02 §8), though 0049's header promises it on every admin
  table.
- **Options.** Put it on every new CRM table (brief) and backfill the existing CRM tables (a data rewrite, R8), or
  only on new ones. **Blocks:** A6 conventions.

### Q15. Schema for the CRM tables
- **Found.** Every CRM and growth table is in `app`, next to the answer tables. Growth seed rows describe the
  firewall as a "separate schema" (`mig/0142:593,680`), which is not true.
- **Options.** Keep `app` (consistent, the firewall is enforced by grants and tests) or a new `crm` schema (a
  physical boundary; changes every client `.schema()` call and the exposed-schemas setting). **Blocks:** Phase B
  data model.

---

## C. Scope, pace and stack

### Q16. Scale of the work
- The gap is 0 Implemented, 52 Partial, 127 Missing, 4 Conflict of 183 features; 11 of 29 user flows and 16 of 45
  system flows are partly there, none fully. Part G sizes the full build at 169+ person-weeks.
- **Question.** The brief says all 183 are in scope. Do you want Phase B to plan all nine phases in detail, or
  plan Phase 0 and Phase 1 in detail and the rest at module level, re-planning at each gate? I recommend the
  latter.

### Q17. Mobile apps and the desktop recorder
- MOB-01…08 need iOS/Android clients; MTG-03/07 a macOS/Windows app. CLAUDE.md fixes the stack (Next.js, no
  substitutes) and has no mobile stack.
- **Options.** A new React Native/Expo app (a new stack and dependencies, R9), a PWA on the existing stack (no
  native scanner or call log), or defer. **Blocks:** MOB, MTG-03/07, AIA-07.

### Q18. Production and environments (R8 against CLAUDE.md)
- R8: never run against production; work against a local or development database. CLAUDE.md: applying
  migrations and deploying to production is "run freely". This phase stayed local.
- **Question.** For Phase C, should migrations reach the hosted project as packages are approved (CLAUDE.md), or
  only after a phase gate? Is there a development project, or is a Supabase branch wanted?

### Q19. End-to-end tests for the admin
- Playwright exists (`playwright.config.ts`, `qa/e2e/`) but has no admin spec; the admin's visual gate
  (`scripts/verify/sentral-run.mjs`) runs locally only and not in CI.
- **Proposal.** Add admin `@journey` specs with the existing Playwright and the fixture's local admin sign-in, and
  run `sentral-run.mjs` in CI. No new dependency. **OK?**

### Q20. Admin interface language
- The admin renders English only (by decision); `messages/no.json` carries a near copy of `admin.*` that can never
  render. CUS-05 asks for per-user language, date/number format and time zone.
- **Question.** Build per-user locale for the admin, or keep English with only date/number/time-zone preferences?

---

## D. Open points from Part G (A12)

| # | Open point | What I need from you | Blocks |
| --- | --- | --- | --- |
| 1 | One engine | Confirm the "lifecycle-messaging engine" to extend is the dispatcher + `crm_mail_claim` loop (pg_cron every 5 min, `supabase/functions/orgpuls-dispatch`), and that workflows, sequences and assignment extend it rather than add a worker | AUT, SF-04…06 |
| 2 | Build or buy per provider | A provider per service: mail sync (Gmail/M365/IMAP), calendar, telephony, messaging (WhatsApp), transcription, language model, company/person data, IP-to-company, e-signature, accounting (INT-08), video links. Each brings a dependency or API key (R9, A7.8: tokens go to Supabase Vault, the mechanism the repo already uses) | COM, ACT-08/09, CRM-04, PRO, AIA, MTG, DOC, INT |
| 3 | Job runtime | pg_cron + edge functions today (edge functions have a wall-clock limit). Database queues and cron, or a separate worker for mail sync and meeting capture | COM-02, MTG, imports |
| 4 | Legal exposure of the defaults | Which settings each market needs on; legal review before go-live (see Q8) | CUS-07 |
| 5 | Recording consent and signature level | A consent policy for MTG; the signature level for DOC-05 | MTG, DOC |
| 6 | Undefined items | Define the LinkedIn connector (LEA-06); native recurring activities or not; one deal per activity or more | LEA-06, ACT |
| 7 | Three inventory rows not carried | Add named migration sources, the Mailchimp migrator, partnership discounts, or confirm left out | — |
| 8 | Targets and running costs | Performance targets (pipeline load, search, reports, mail-sync delay), RPO/RTO, and a cost model for AI, transcription, enrichment | NFR, Phase 7 |
| 9 | Originality | Confirm neutral names; today's nav already uses its own ("Sentral", "Companies", "Journeys") | — |
| 10 | Staff roles | The roles today are super_admin, support, finance, analyst, marketing, editor (`app.platform_role`). Add `sales` and `project` roles to the enum, or build permission sets (SEC-07) as rows assigned to staff, with roles kept as coarse gates? | SEC-07, every write path |

## E. Smaller differences recorded, no decision needed unless you disagree

- Hard-coded or fabricated values in today's CRM: the Partners «Revenue share» KPI is the message literal
  `'20 %'` (`CRM/partners/page.tsx:95`); the campaigns page marks three lifecycle rows «Built in» without reading
  data (`CRM/campaigns/page.tsx:46-48`); hard-coded text ('Norsk'/'English', ' pts', 'min'/'h', 'A: … · B: …'). I
  propose fixing these in Phase 0 under CLAUDE.md's "never fabricate" and "never hard-code".
- `demo` contact source is written by `0146` but missing from `CONTACT_SOURCES` and its messages (`lib/admin/crm.ts:15`).
- The lead-scoring page has no page-level role check, unlike consent/triggers/partners (the database still
  enforces `crm_can_read`).
- The overview computes "due" in UTC; the tasks page in Oslo time.
- No generated database types exist (CLAUDE.md: `supabase gen types` does not emit `app`; rows are Zod-parsed).
  A6's "regenerate types after every migration" does not apply; the Zod schemas are updated instead.
- Database tests: the repository uses plain-SQL `*_invariants.sql` suites run by psql in CI, not pgTAP. A8 says to
  follow the repository, so new tests follow that style.
- `supabase/tests/crm_deal_invariants.sql:6` says "support may read, not write", which does not match
  `crm_can_read` (super_admin, marketing, analyst). Unverified; to check when that suite is next touched.
- `respondent_invariants` checks 16–17 leave out `response_comments` (the growth firewall's rule 3 covers it).
- 0126 and 0150 rewrite live function bodies by text replacement, so the final text of some functions (e.g.
  `admin_org_detail`) exists only in the database; 02 reads them from the local stack where needed.
- Some copy still says "fem svar" although the floor is 3.
- No `.env.example` exists; 01 lists the variable names.
