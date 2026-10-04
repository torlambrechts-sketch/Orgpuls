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
| DEC-22 | The 12-month engagement window in `app.crm_mailable` | **A setting, default 12 months**, switchable under Settings › CRM rules (protects the marketing domain and so survey-invitation deliverability) |
| DEC-23 | When CRM work reaches production users | **At the Phase 0 gate**: merge to main after Phase 0's gate flows pass and Tor has reviewed the phase report. Database changes go out per package and stay backward compatible with the deployed app |
| DEC-24 | Migration 0195 (WP-0.3) cancelled at the production confirmation step (2026-10-03) | **Apply now**. The retries of the whole file were cancelled at the confirmation step as well (nothing reached the project) |
| DEC-25 | How 0195 reaches production after four cancelled applies (2026-10-03) | **Claude applies it, a different way** (Tor: "You have all the rights and access … try something different or again"): applied in parts, each verified (D-210). The purge part is held at the tool's approval step |
| DEC-26 | What follows WP-0.3 (2026-10-03) | **WP-0.4 locally** (permission sets, teams, visibility, audit completeness, marketing restricted to the CRM) while 0195's last part is settled |
| DEC-28 | How the purge part of 0195 gets past the approval hold (2026-10-03) | **Allow `apply_migration`.** Correction: the repository's `.claude/settings.json` already allows every Supabase tool; the hold is the Supabase connector's own tool permission, set at claude.ai › Customize › Connectors › Supabase › tool permissions (`apply_migration` → allowed). Once it is allowed, the purge part is applied and verified. Tor set it to allowed; in this session the call was still held (twice, also after the connectors reconnected), so it is applied first thing in the next session, or with WP-0.4's migration |
| DEC-27 | When bulk changes other than deletes become revertible (CRM-12) (2026-10-03) | **With WP-1.2's bulk edit**, where bulk changes beyond stage moves first exist; the 0194 changelog already holds what a revert needs |
| DEC-29 | How 0195's purge part and 0196's removals reach production, both held at the connector's approval step (2026-10-03) | **A new session applies them first**: the connector's tool permission is read when a session starts, so the next session applies both exactly as written in the migrations, verifies their md5s against the build and records it (D-210, D-211). Until then nothing on production is purged and sets, groups and teams cannot be removed there |
| DEC-30 | What follows WP-0.4 (2026-10-03) | **WP-0.5 custom fields**, the Phase 0 gate package (CUS-01 to 04, SF-38), locally and then on production per DEC-09 |
| DEC-31 | When the campaign, list, segment, sender and template pages follow the permission set (2026-10-03) | **In WP-0.8's clean-ups**: their readers return what the set allows for campaigns and the pages leave out what it refuses, as the companies and contacts pages do since WP-0.4 (D-211) |
| DEC-32 | Deviation numbers: main took D-207 to D-212 while this branch used D-207 to D-211 (2026-10-03) | **Renumber at the Phase 0 merge**, once, to the numbers free then, with a note mapping old to new; applied migrations keep the old numbers in their comments. PR #7's entry is D-213 already |
| DEC-33 | Permission requests during the work (2026-10-04) | **No more allow requests** (Tor: "Stop with the allow requests! You have all access need"). The repository's allowlist now also covers the remote-session connector, Monitor, ToolSearch and the task tools (read at session start, so from the next session); in a cloud session the mode dropdown's Auto covers the rest. A call the Supabase connector holds for approval is not retried: it joins the parts the next session applies first (DEC-29) — now 0195's purge, 0196d and 0197e |
| DEC-34 | How the three held production parts (0195's purge, 0196d, 0197e) are applied (2026-10-04) | **A new session applies them first**, exactly as written in the migrations, verified against the build and recorded in D-210, D-211 and D-212 |
| DEC-35 | What follows WP-0.5 (2026-10-04) | **WP-0.6 event dispatcher**: each CRM event delivered once per subscriber, retries that block no one, run records and a failure alert in the job monitor |
| DEC-36 | Who merges PR #7, the 0191 grants fix already on production (2026-10-04) | **Claude merges it** once it is green and mergeable, bringing main in line with production. Main had meanwhile taken 0191 (`module_sync_carry_english`) and D-213/D-214, so the PR's file becomes `0198_crm_definer_grants.sql` and its entry D-215 (same SQL; production keeps the name it was applied with). At the Phase 0 merge this branch's copy at 0191 gives way to main's 0198, and its own next migration is 0199. Merged 2026-10-04 (94b6c21) after main had also taken D-215 (CI), so the entry is D-216 |
| DEC-37 | What follows WP-0.6 (2026-10-04) | **WP-0.7, the admin test harness**: Playwright admin journeys signing in as the fixture's local admin, the 390 px check and axe on admin pages, and a smoke journey over the CRM. The held production parts (0195's purge, 0196d, 0197e and now 0199f) still go to a new session first (DEC-34) |
| DEC-38 | Where the admin journeys run, now that main's CI minutes are billed (D-215 on main) (2026-10-04) | **A short smoke in the existing CI job**: sign-in and a few CRM pages, reusing that job's build and database, about a minute per run. The full journeys, the 390 px check and axe run locally before each package |
| DEC-39 | What follows WP-0.7 (2026-10-04) | **WP-0.8, the Phase A clean-ups, in this session**, with WP-0.7's two findings (keyboard access to nine 390 px scroll regions; the restore list's unseen confirmations) and DEC-31's campaign pages; then a new session applies the held production parts and writes the Phase 0 report |
| DEC-40 | Who opens that new session (2026-10-04) | **Tor opens it**, from the brief `NEXT-SESSION.md`; the four held parts are in `held-parts/`, copied exactly from the migrations, with the production state before, the end state after (dry-run against the build) and the expected advisor change |
| DEC-41 | What happens before that session starts (2026-10-04) | **Tor allows `apply_migration` in the Supabase connector's tool permissions** (claude.ai › Customize › Connectors › Supabase), **then opens the session** on `ccr-39a2fb73-jgkg09`, so the four parts can land without a hold; a hold that still comes is reported, not worked around |
| DEC-42 | Who acts on DEC-40 and DEC-41 (2026-10-04) | **Claude does what it can itself** (Tor: "Do whats recommended yourself!!"). It tried `0195l` once in the WP-0.8 session: the connector answered «MCP tool call requires approval», nothing reached the project, and it was not retried. It then opened the new session itself, from `NEXT-SESSION.md`. That session tries a held part once more after the Phase 0 report, in case the permission has been allowed by then. Allowing `apply_migration` in the connector (claude.ai › Customize › Connectors › Supabase) is the one step only Tor can take |
| DEC-43 | Tor allows `apply_migration` in the Supabase connector (2026-10-04) | **Relayed, not received from Tor directly:** the WP-0.8 session (session_01KNNfiLq5NbqeEndeHdcmWA) sent this session a message, queued 14:00 UTC, saying Tor had allowed `apply_migration` in the connector's tool permissions and that the four held parts should be applied first. This session had tried `0195l`, `0196d` and `0197e` once each before the message arrived, and tried `0195l` once more after the Phase 0 report. Every call was held («MCP tool call requires approval») and nothing reached the project. The parts are still not on production (`reports/phase-0.md` § 1, § 10) |

Still open (asked at the phase that needs them): Q7 lead object (plan follows the brief: own table), Q13
threshold (plan keeps the product rule: floor 3, default 5), open points 2
(providers beyond geocoding), 5 (recording consent, signature level), 6 (LinkedIn connector, recurring
activities), 8 (targets and costs).

Earlier note: not answered yet, carried to `07-IMPLEMENTATION-PLAN.md` § 2: Q2 (editor role), Q3, Q4, Q7, Q13–Q17, Q19,
Q20 and the ten open points. Where the plan needs an answer it proposes a default and says what it blocks.
