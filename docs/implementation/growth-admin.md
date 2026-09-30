# Sentral › Growth — implementation plan

**Sources:** `design-reference/sentral/Sentral_Admin.dc.html` (revision 3, 30 Sep 2026) and
*Orgpuls Growth Engine – Complete Report* (30 Sep 2026). Renders of every view are in
`design-reference/sentral/renders/<Area>_<Page>-1440.png`, made by `scripts/verify/sentral-baseline.mjs`.

## 1. What the design adds

Revision 3 adds 14 views and changes three existing views. Nothing else moved: the diff against
revision 2 touches only these.

| Area | View | Route in Orgpuls | Kind |
| --- | --- | --- | --- |
| **Growth** (new area) | Board | `/admin/growth` | registry + live counts |
| | 90-day plan | `/admin/growth/plan` | registry, gates read live where a gate is measurable |
| | Funnel & lead math | `/admin/growth/funnel` | **computed** from events and web analytics |
| | Event catalogue | `/admin/growth/events` | catalogue (data) + 7-day counts + health score + firewall status |
| | Automation rules | `/admin/growth/rules` | R1–R12 registry, each bound to what implements it |
| | Experiments | `/admin/growth/experiments` | backlog (data), ICE, status |
| | Risks & decisions | `/admin/growth/risks` | guardrails, risks, open decisions with «Decide» (audited write) |
| | Coverage review | `/admin/growth/coverage` | report features → where they live, status |
| **CRM** | Consent | `/admin/crm/consent` | append-only consent ledger, preference centre, suppression |
| | Brønnøysund triggers | `/admin/crm/triggers` | daily poll, triggers, outreach queue, holdout, do-not-contact |
| | Partners | `/admin/crm/partners` | partners, codes, attribution, kit |
| | Lead scoring *(changed)* | `/admin/crm/scoring` | fit (Brønnøysund) × intent (events), routing ≥ 60 |
| | Tasks *(changed)* | `/admin/crm/tasks` | a 1-hour SLA on callback tasks |
| | Journeys *(changed)* | `/admin/crm/journeys` | the «Design principles» card |
| **Content** | Tools & lead magnets | `/admin/cms/magnets` | magnet registry, Krav-sjekk rules as versioned data |
| **Admin** | Deliverability | `/admin/deliverability` | two streams, auth check, template registry, provider, hygiene |

**Navigation.** Growth is a new area in the top bar, between Analytics and Admin, as the design
draws it. The CRM/Marketing split (X-097, Tor's own request) stays. Consent goes under
**Marketing**, beside Contacts & lists, because it is the mail's legal basis. Brønnøysund
triggers and Partners go under **CRM**. Access is a new section, `growth`, for the roles that
see the CRM.

## 2. The rule that decides every block: real or registry, never invented

The design fills its screens with sample figures. CLAUDE.md forbids rendering a value the schema
does not hold. Every block is therefore one of three kinds, and the plan names which:

1. **Computed.** Counts, rates, 7-day volumes, SLA timers, fit and intent scores, health score, the
   funnel and «now» in the lead math. These are read from the database. They show an empty state
   when there is nothing yet, never a 0 % over an unknown denominator.
2. **Registry.** The report's content: tiers, board items, plan blocks, rules, experiments,
   risks, decisions, magnets, Krav-sjekk rules, event catalogue entries and the coverage list.
   Each is a seeded row (data-not-code), editable in the admin and audited. Rows are seeded
   with the **true** status for Orgpuls today, not the design's sample status. The design's
   «Consent ledger · Live» is only true once G1 ships, so the seed says «Building» until then.
3. **Assumption.** The report's planning assumptions and labelled benchmarks, such as «3 %
   blended» or «Median 8 %». They are shown as the design shows them, labelled as assumptions
   and benchmarks with their source. They are never presented as Orgpuls' own figures.

A status that can be derived is derived. «Live» on a board item means its feature flag or table
is in use, not that someone typed «Live».

## 3. Security and anonymity (report § 7.6, CLAUDE.md invariants)

- **The event stream is org-level only.** Events are written by `security definer` triggers
  on product tables.
  - No event carries a respondent, an invitation token, an answer or a response id.
  - Survey events carry bands: `survey.threshold_reached{response_rate_band}`, never a count
    below k.
  - A catalogue entry declares `pii_level` and `allowed_props`. A trigger that writes a prop
    not in `allowed_props` fails.
- **Anonymity firewall check** (`supabase/tests/growth_firewall_invariants.sql`, run in CI).
  It proves:
  - no growth, CRM or event table has a foreign key to `responses`, `answers`, `extra_answers`,
    `response_comments`, `invitations` or `employees`;
  - no catalogue entry allows a respondent identifier;
  - no `crm_contacts` address equals an employee address that is not also a member's;
  - the CRM's service paths hold no grant on the answer tables.

  The Event catalogue page shows the result of the last run, read from a table the CI step
  writes. It never displays a hard-coded «passing».
- **The consent ledger is append-only.** A withdrawal is a new row, never an edit.
  - The immutability trigger follows CLAUDE.md's rule: it compares the content columns, and
    allows a delete only when the parent is gone.
  - Suppression stores SHA-256 hashes of lower-cased addresses.
  - Double opt-in tokens are hashed and single-use, with ≥ 96 bits of entropy.
- **Brønnøysund triggers are dry-run by default** (the design's «Dry run — tasks are queued,
  not assigned»).
  - No email to a named address, ever: the generic-address test is a rule, with a test.
  - A do-not-contact list is kept.
  - HTTP 410 entities are purged.
  - Role data (name, birth date) is used for phone and letter only, and never stored beyond
    the name.
- **Every admin write is audited** (`app.admin_audit`), and the MFA-gated role check applies.
  RLS is enabled on every new table; client roles get no policy and no grant, and reads go
  through `admin_*` RPCs, as elsewhere in the admin.
- **Nothing public ships in this plan without its own design.** Krav-sjekk as a public tool,
  `/partner/[code]` pages and the «Laget med Orgpuls» thank-you line all touch public or
  respondent pages this design does not draw. They wait: see § 7.

## 4. Visual fidelity: how «pixel-perfect» is checked

- **Baselines.** One per view at 1440 wide, rendered from the design with its own fonts and
  runtime (`sentral-baseline.mjs`).
- **The admin at the same width.** `scripts/verify/sentral-run.mjs` signs in as the local admin
  (TOTP) and shoots each route.
  - It compares the shot to its baseline tile by tile (100 × 100 px). The tolerance is the
    gate's agreed 0.1 %, taken of the tile (10 differing pixels in 10 000), not of the whole
    screen as the product's v3 gate takes it: at 100 × 100, v3-run's 1 296 px would be 13 % of a
    tile and passes a stub against a full design (D-181). `--limit 1296` gives v3-run's budget
    back, for comparison.
  - A tile the shot is too narrow or too short to hold counts as wholly different, so a claim on
    it is lost rather than dropped.
  - The local admin is active only while a run holds it: the run activates it and clears its
    factor, enrols a fresh one, and deactivates it and deletes that factor when it ends.
  - Claims are recorded per view in `scripts/verify/sentral-claims.json`, the same model as
    `v3-claims.json`.
- **A local-only QA fixture** (`scripts/seed/sentral-fixture.mjs`) writes the design's sample
  customers, contacts, partners, triggers and consent rows. The data-driven views can then be
  diffed against the design, not only their chrome.
  - It refuses any database URL that is not local.
  - It never runs on hosted.
  - It is the only source of those rows.
- **Where data or a true status differs from the design** (a chip that reads «Building», not
  «Live»), those tiles leave the claims, and the reason is written in the deviation entry. No
  claim is re-recorded without reading its diff (audit rule 7).
- **Phone width.** Each view is also shot at 390 px: no horizontal scroll, the sub-bar in the
  menu sheet, tables become the design's stacked rows. Below 1280 (`--width 390`, `--width 1024`)
  the run also fails a sub-bar that hides the page you are on, and a menu sheet that lets Tab or
  Shift+Tab out or does not give focus back on Escape.

## 5. Phases

The workstreams are ordered by dependency. Each phase runs the full QC loop (§ 6) before the
next phase that depends on it starts.

| Phase | Content | Migration | Depends on |
| --- | --- | --- | --- |
| **G0 — Harness and shell** | Design rev 3 and renders; `sentral-run.mjs` + claims; QA fixture; nav area «Growth», access section `growth`, routes stubbed with the design's empty treatment; shared growth components (tier column, board card, status chip, KPI strip, labelled-assumption row) | 0140 (access, audit kinds) | — |
| **G1 — Foundations** | Event catalogue v1 (about 30 events from report § 7.7) + `app.growth_events` + product triggers; anonymity firewall suite + CI step + status table; consent ledger (append-only records, purposes, DOI, suppression hashes) folded over today's `crm_contacts` consent; health score v1 | 0141 | G0 |
| **G2 — Growth area** | Board, 90-day plan, Funnel & lead math, Event catalogue page, Automation rules, Experiments, Risks & decisions, Coverage review; registry tables seeded from the report with true statuses; «Decide» and status edits audited | 0142 | G1 |
| **G3 — CRM** | Consent page; Brønnøysund trigger engine (edge function poll of the update feed, dry run, triggers, outreach queue, holdout, do-not-contact, 410 purge); Partners (partners, codes, attribution on the organisation at signup, kit list); Lead scoring fit × intent; Tasks SLA; Journeys principles | 0143 | G1, and the CRM backlog branch (0137) merged |
| **G4 — Content and Admin** | Tools & lead magnets (magnet registry, Krav-sjekk rules as versioned data with «sist kontrollert»); Deliverability (streams, SPF/DKIM/DMARC check from DNS, template registry classification service/marketing, provider card, hygiene) | 0144 | G1 |
| **G5 — Integration** | Coverage review re-derived from what shipped; full `sentral-run` at 1440 and 390; whole-diff security review; `/audit quick`; docs (D-181–D-189, X-101); hosted migrations; edge function deploy; ship | — | G2–G4 |

G2, G3 and G4 run in parallel once G1 is merged, in separate worktrees with disjoint migration
numbers and disjoint files.

## 6. The QC loop, per phase

1. **Build** in an isolated worktree, as the phase's engineer.
2. **Gates** (exit codes, not summaries):
   - `tsc`, `lint`, `verify:i18n` and `vitest`;
   - the phase's new SQL suite, plus every existing suite it touches;
   - `wiring.mjs`, which must add no finding: every new RPC has a consumer, and every setting
     an effect;
   - `next build`.
3. **Security review** by a fresh agent that did not write the code. It is adversarial and
   checks:
   - RLS and grants on every new table, and the role matrix on every new RPC;
   - that no client selects an answer table;
   - that no respondent data reaches events, CRM or logs;
   - token rules and the audit on every write.
4. **Code review** by a fresh agent, covering:
   - Zod at every boundary (rows parsed, not cast);
   - no hard-coded text;
   - no fabricated values;
   - the immutability-trigger rule;
   - dead code. At G2 this includes the shared shapes G0 built ahead of their consumers
     (components/admin/growth.tsx: KpiStrip, Board, TierColumn, BoardCard, BulletRow,
     BenchmarkRow, SectionCard, StatusChip, and PhaseEmpty's `children`; lib/admin/dots.ts'
     `dotTone`): each is used by a view or deleted.
5. **Visual verification** by a fresh agent. It runs `sentral-run.mjs` on the phase's views at
   1440 and 390, reads every lost tile against the render, and looks at focus-visible, empty
   states and console errors.
6. **Fix.** Findings go back to the builder, and steps 2–5 repeat until the reviewers pass it.
7. **Merge, then ship.** The lead merges and reruns the whole gate set on the merged branch.
   Then:
   - migrations are applied on hosted, and edge functions deployed where changed;
   - the branch is pushed, CI goes green, and the commit is shipped to main.

## 7. Not in this plan, and why

| Item | Why it waits |
| --- | --- |
| Krav-sjekk / Risiko-sjekk as public tools, `/partner/[code]` pages | Public pages with no design in this bundle; the admin side and the versioned rules are built, so they can be switched on once a page is designed |
| «Laget med Orgpuls» on the respondent thank-you page and results poster | Changes the respondent flow (pixel-gated) and needs open decision 3 (removal for paying customers) |
| Org.nr-first signup | Changes `/registrer`, a designed page; the report's E1 experiment decides the order |
| Sending on two subdomains (`varsel.` / `nyhet.`) | DNS at Spaceship and a Brevo sender, outside the repository; the Deliverability page reads and shows the actual state |
| Journeys 2–4 as new sends, R4/R7 marketing sends | Need marketing consent under § 15 and legal decision 1; the rules are registered with their true state |

## 8. Numbering

- **Migrations:** 0140–0144, reserved. The backlog work in flight holds 0133–0137.
- **Deviations:** D-181–D-189. The backlog work will take D-175–D-180.
- **Execution record:** X-101.
