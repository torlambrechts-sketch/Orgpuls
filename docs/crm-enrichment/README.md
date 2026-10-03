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
| `DECISIONS.md` | R3 | Tor's answers, dated |

Status on 2026-10-03: Phase A complete, stopped for review (A3.7). No application code or database was changed.
