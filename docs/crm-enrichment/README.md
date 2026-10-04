# CRM enrichment

The brief is `INSTRUCTIONS.md` (183 features, 29 user flows, 45 system flows). Work runs in phases with a stop
for Tor's review after each.

| File | Phase | What it holds |
| --- | --- | --- |
| `01-ENVIRONMENT.md` | A3.1 | Stack, admin separation, sign-in/roles/MFA/audit, migrations and seeds, jobs, providers, UI, tests, CI |
| `02-DATABASE.md` | A3.2 | Every CRM/admin table, function, policy, grant, job; the firewall list; tests |
| `03-IMPLEMENTED-TODAY.md` | A3.3 | The CRM routes, actions and RPCs as built; baseline screenshots (`screens/baseline/`) |
| `04-GAP-ADMIN-SPEC.md` | A3.4 | Appendix 2, item by item |
| `05-GAP-FEATURES.md` | A3.5 | The 183 features, flows, settings, entities and NFRs, with status and evidence |
| `06-QUESTIONS.md` | A3.6 | Conflicts, unknowns, security findings, open points |
| `07-IMPLEMENTATION-PLAN.md` | A4 | Data model mapping, open decisions with defaults, work packages, order, test plan |
| `DECISIONS.md` | R3 | Tor's answers, dated |
| `security/`, `screens/phase-0/` | C | Each work package's security checklist; its screens at 1440 and 390 with `report.json` |
| `NEXT-SESSION.md`, `held-parts/` | C | The brief for the session that applies the four held production parts and writes the Phase 0 report (DEC-40) |

Status on 2026-10-03: Phase A complete; answers recorded (DEC-01…09); the e-mail exposure fixed (0191, D-207); Phase B plan written and waiting for approval before Phase C.

Status on 2026-10-04: Phase 0's eight work packages are done (WP-0.1–0.8, D-208–D-215) and on production except four
held parts (0195l, 0196d, 0197e, 0199f); a new session applies those and writes `reports/phase-0.md` (`NEXT-SESSION.md`).
