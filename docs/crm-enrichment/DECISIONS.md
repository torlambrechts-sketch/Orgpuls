# Decisions — CRM enrichment

Tor's answers to the questions in `06-QUESTIONS.md`, recorded with the date (rule R3). Where an answer changes a
status in `05-GAP-FEATURES.md` or a work package in `07-IMPLEMENTATION-PLAN.md`, the entry says so.

## Recorded in the brief, 3 October 2026

| Topic | Decision | Source |
| --- | --- | --- |
| Scope | All 183 features are built | `INSTRUCTIONS.md`, Part G "Risks and open decisions" |
| Rules and limits | Every restriction is a setting that defaults to fully working and unrestricted; contact rules are part of settings. The anonymity firewall is fixed | Same; rules R5, R6 |
| Existing code | The admin's CRM is partly built; Phase A measures it | Same |
| Size | Not decided separately; the full scope is sized at 169+ person-weeks | Same |

## Answers to 06-QUESTIONS.md — 2026-10-03

Tor's reply, verbatim: *"Fix email, many deals per company, organization you decide best futureproof
solution, defaults yes, we will implement stripe soon, web visitor, stop your implemented restrctions, allow
and make a setting to turn off under settings, yes"*. Each part is mapped below to the question it answers,
in the order the questions were put. Two readings are marked **(reading)**: correct them if they are wrong.

| # | Question | Decision | Effect |
| --- | --- | --- | --- |
| DEC-01 | Q1 anonymous-callable definer | **Fix it.** Done: migration 0191 + `definer_grants_invariants.sql`, applied on hosted after a read-only check confirmed the same grants there (D-207) | Q1 closed |
| DEC-02 | Q5 deal model | **Many deals per company.** A new `app.crm_deals` table; each company's current deal moves into it (the data migration is approved by this answer) | PIP-03 Conflict → planned (WP-1.1) |
| DEC-03 | Q6 which organization table | **Claude decides the future-proof option.** Decided: `app.crm_companies` is the CRM organization record for every company — prospect, customer, partner, any product. `app.organizations` stays the Orgpuls product tenant and links to it one-to-one through `crm_companies.org_id` (made unique). Reason: the admin is shared across products (Appendix 2), and a company is a CRM record before and after it is anyone's tenant; org.nr stays the shared key. No table is renamed or merged. | CRM-01/11/13/14 extend `crm_companies` |
| DEC-04 | Q8 rule defaults | **The brief's defaults.** Contact rule, consent source on import, typed reason and second-admin approval ship as settings that default to *off*. Today's stricter checks become the "on" value of those settings | CUS-07; existing consent-source and reason checks move behind settings (loosening approved) |
| DEC-05 | Q10 billing mirror | **Stripe is coming.** Build CRM-08 on deal product lines now. Orgpuls's own recurring figures and ENT-03 purchases read the Stripe mirror once it exists, behind a billing adapter; until then those two parts show nothing rather than a placeholder | CRM-08 Conflict → planned with a dependency; ENT-03 waits for Stripe |
| DEC-06 | Q11 web visitor identification | **Build it.** Identification is a setting, on by default (register row "Web visitor identification"). The IP-to-company provider is still open (open point 2), and the change to the cookieless design is recorded as a deviation when built | WEB-02 Conflict → planned |
| DEC-07 | Q9 hard-coded caps, and the restrictions built into today's code | **Remove them; allow by default; a setting can switch each back on, on the Settings screen.** (reading) Applies to the fixed caps (30 blocks, 5,000 import rows, 500 bulk ids, 200 register rows, 500/300 read caps) and today's required fields and reasons. Each becomes a registry setting defaulting to unrestricted | WP-0.1 |
| DEC-08 | Q12 health score as a scoring criterion | (reading) **Allowed, with a setting to turn it off.** The health score (organization-level counts) may be a scoring criterion; a setting switches that use off. The anonymity firewall itself stays fixed and is not a setting (R6, CLAUDE.md invariants) | PRO-03; firewall test follows calls through helpers |
| DEC-09 | Q18 production | **Yes**: CLAUDE.md's operating authority applies — migrations reach the hosted project as each package passes its gates | Phase C |

## Answers in selection format — 2026-10-03

Asked with a recommendation per question (the rule now in CLAUDE.md "How to ask Tor"). Tor chose the
recommended option every time.

| # | Question | Decision |
| --- | --- | --- |
| DEC-10 | Start building? | **Start Phase 0 now**: WP-0.1 → 0.8 one package at a time, each tested and applied on hosted, stop at the Phase 0 gate |
| DEC-11 | Staff permissions (P1, open point 10) | **Permission sets** assigned per staff member (admin, regular, custom); today's roles stay the coarse gate |
| DEC-12 | Marketing reads org detail and the audit trail (Q3, P8) | **Restrict marketing to the CRM**: those gates become allow-lists (support and super-admin keep them) |
| DEC-13 | Getting 0191 to main | **A pull request** with just the fix and its test |
| DEC-14 | Job runtime (P2, open point 3) | **pg_cron + edge functions** through Phases 0–1; decide on a worker before Phase 2 |
| DEC-15 | Mobile and desktop clients (Q17, P6) | **Defer to Phase 8** |
| DEC-16 | Admin language (Q20, P10) | **English + per-user date/number format and time zone** |
| DEC-17 | Three research rows not carried (open point 7) | **Leave all out** |
| DEC-18 | Geocoding (P3, CRM-03) | **OpenStreetMap Nominatim** behind an adapter, rate-limited, cached per address |
| DEC-19 | Webhook signing (P4) | **Signed, HMAC-SHA256**, a secret per subscription |
| DEC-20 | Abuse protection defaults (P5) | **Honeypot on + per-IP rate limit 60/min**, both settings that can be switched off |
| DEC-21 | `product_id` on existing CRM tables (Q14, P9) | **Add with default 'orgpuls'** (additive, no rewrite) |

Still open (asked at the phase that needs them): Q7 lead object (plan follows the brief: own table), Q13
threshold (plan keeps the product rule: floor 3, default 5), Q19 admin e2e (WP-0.7 adds it), open points 2
(providers beyond geocoding), 5 (recording consent, signature level), 6 (LinkedIn connector, recurring
activities), 8 (targets and costs).

Earlier note: not answered yet, carried to `07-IMPLEMENTATION-PLAN.md` § 2: Q2 (editor role), Q3, Q4, Q7, Q13–Q17, Q19,
Q20 and the ten open points. Where the plan needs an answer it proposes a default and says what it blocks.
