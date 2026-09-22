# Orgpuls — Implementation Plan

**Status: S0 and S1 complete. S2 next.**

---

## 0. What is being built

Orgpuls is a Norwegian psychosocial work-environment platform. It is not a generic survey
builder: the instrument is fixed, statutory, and built on **QPS Nordic** — eleven factors,
three statements each, five-point scale, indexed 0–100, each factor bound to its legal
basis. The product's output is a document a labour inspector reads.

Source of truth: `design-reference/orgpuls/Orgpuls_Offline_Source.html` plus
`doc-page.js`, `support.js`, `image-slot.js` and `tuva/`. Twelve screens:

| # | Screen key | Nav label | Bundle lines |
| :-- | :-- | :-- | :-- |
| 1 | `home` | Innsikt | 119–237 |
| 2 | `report` | (from Innsikt) | 238–467 |
| 3 | `measure` | Målinger | 468–658 |
| 4 | `result` | (from Målinger) | 659–908 |
| 5 | `conv` | Samtaler | 909–1025 |
| 6 | `helpsite` | Hjelp | 1026–1110 |
| 7 | `conn` | Integrasjoner | 1111–1252 |
| 8 | `wheel` | Årshjulet | 1253–1393 |
| 9 | `plan` | Måleoppsett | 1394–1681 |
| 10 | `tasks` | Tiltak | 1682–1835 |
| 11 | `respond` | (respondent preview) | 1836–1924 |
| 12 | `settings` | Oppsett | 1925–2487 |

`settings` has eight sub-tabs: Selskap · Ansatte · Grupper · Roller og tilgang ·
Integrasjoner · Personvern · Assistenten · Regelverk.

Three roles drive visible differences: **Daglig leder · Avdelingsleder · Verneombud**.

### The eleven factors

| Factor | Legal basis | 2026 | 2025 | Risk |
| :-- | :-- | --: | --: | :-- |
| Ytringsklima | aml. § 4-3 · § 2A | 41 | 48 | Høy |
| Arbeidsmengde og tidspress | forskrift kap. 1A · § 4-1 | 44 | 53 | Høy |
| Motstridende krav | forskrift kap. 1A | 52 | 58 | Middels |
| Kontakt og kommunikasjon | aml. § 4-3 · forskrift 1A | 57 | 57 | Middels |
| Emosjonelle krav | forskrift kap. 1A | 58 | 59 | Middels |
| Støtte fra leder | forskrift kap. 1A | 64 | 69 | Middels |
| Medvirkning og kontroll | aml. § 4-2 | 66 | 63 | Lav |
| Integritet og verdighet | aml. § 4-3 · forskrift 1A | 69 | 70 | Lav |
| Rolleklarhet | forskrift kap. 1A | 71 | 73 | Lav |
| Støtte fra kollegaer | aml. § 4-3 | 76 | 75 | Lav |
| Anerkjennelse og mening | aml. § 4-2 | 78 | 74 | Lav |

These are **data, not code** — a seeded table plus i18n keys, so adding or re-wording a
factor is a migration and a message key, never a component change.

### Scoring, derived from the design rather than chosen

- value 1..5 → index 0..100 as `(value - 1) * 25`
- factor index = round(mean of its statements)
- overall index = round(mean of factor indices)
- bands: **Lav ≥ 65 · Middels 50–64 · Høy < 50**

Both checked against the bundle's own output before being written: the eleven indices
mean 61.45, rounding to the **61** the design prints as ARBEIDSMILJØINDEKS, and those
boundaries split them **5/4/2**, matching "5 forsvarlig · 4 følges opp · 2 høy risiko".
A different boundary does not reproduce the design's own counts.

---

## 1. Standing rules for every segment

1. **The bundle wins on visuals; the security invariants win on everything else.**
2. **Never hard-code user-facing text.** Every string comes from next-intl. Norwegian is
   the source language and must match the bundle **verbatim** — extracted, not retyped.
3. **Never fabricate data in the UI.** No invented counts, no placeholder `v1`, no 0%
   over an unknown denominator. Render the real state, nothing, or the design's own
   empty treatment.
4. **Recreate the rendering, never the prototype's structure.** No `sc-if`/`sc-for`, no
   inline styles carried across.
5. **Schema changes only as new migrations.** Never edit an applied one. The migration
   file must say what actually ran.
6. **Anything genuinely unspecified is a stop-and-ask**, logged in `docs/DEVIATIONS.md`
   with the constraint named — not invented.
7. **Log everything** in `docs/DECISION_LOG.md`, with the command output, `file:line` or
   screenshot that established it. Claims without evidence are not status.

---

## 2. The per-segment gate

| Gate | What it checks | How |
| :-- | :-- | :-- |
| **G1 Static** | Types, lint, build | `tsc --noEmit`, `eslint .`, `next build` |
| **G2 Tests** | Unit + invariants | `vitest run`; a file's test count may grow, never drop |
| **G3 Pixel** | The screen is identical | Render app route and bundle screen at the same viewport, diff, assert **≤ 0.1%**; zero console errors, zero failed requests |
| **G4 i18n** | Both languages complete | Render every route in `no` and `en`; fail on a missing key; ICU placeholder parity |
| **G5 A11y** | Keyboard and focus | Every control tab-reachable; focus ring exactly `3px solid #191510`, offset 2px, radius 6px |
| **G6 Security** | Invariants still hold | Full invariant suite; assert no client-side select on `responses`/`answers` |
| **G7 Log** | The record is true | DECISION_LOG + DEVIATIONS updated; screenshots committed |

The reference harness serves the bundle locally with React, Babel and both font families
cached, so it renders with zero external requests. A segment cannot close on a
description of a screenshot — only on a diff number.

---

## 3. Segments

### S0 — Cutover and foundation — **COMPLETE**
Old application preserved on `archive/v1`. `heituva-prod` wiped: 69 tables, the `app`
schema, 211 migration records, 5 cron jobs, the `mail_outbox` queue. `auth.users` and
the three empty storage buckets left alone. `pg_net` moved out of `public`. Design
bundle, runtime, fonts, avatars and twelve baselines committed.

### S1 — Invariants before schema — **COMPLETE**
Migrations 0001–0005. Every invariant proven against the live schema:

- **INV-1** (×6) k-anonymity floor: `app.k_min()` is a function returning 5, not a
  column, so no row can lower it; an org may only raise it, to a ceiling of 10.
- **INV-2a** `app.responses` has no linkage column — absent, not nullable.
- **INV-2b** un-truncated `submitted_hour` rejected.
- **INV-2c/d** answers immutable, not directly deletable.
- **INV-2e** the freeze trigger permits FK-driven nulling and cascade.
- **INV-3a–f** replay refused and writes nothing; unknown refused; expired refused;
  out-of-round factor refused without consuming the invitation; no plaintext at rest.
- **INV-4** a round cannot reference another org's measurement.
- **k-gate** Administrasjon n=3 withheld, Verksted n=8 scored, whole org n=11 counts
  all three — exactly as the statutory report states.

### S2 — Tokens and primitives — NEXT
The old application's central flaw was 56 screen-specific components and no primitive
layer. Build that layer first: Card, Button, Pill/Chip, RiskBadge, DistributionBar,
StatTile, DataTable, Field, Select, Toggle, Tabs, Timeline. Exit on a primitive gallery
route that pixel-diffs against the corresponding bundle fragments.

### S3 — Shell, navigation, i18n, roles
Header, footer, the `ht-in` entry animation. `messages/no.json` extended from the
bundle, `en.json` translated, typed key union generated, ICU placeholder parity enforced.

### S4–S13 — One segment per screen
Innsikt → Målinger + Måleoppsett → **Respondent** (security-critical) → Resultat →
Rapport + PDF → Tiltak → Samtaler → Årshjulet → Oppsett (8 sub-tabs) → Hjelp +
Integrasjoner. Each: read the bundle lines, extract its Norwegian, build against
primitives, run all seven gates, log with evidence.

Built so far: **Målinger, Respondent, Resultat, Rapport, Tiltak, Innsikt.** Not built:
Måleoppsett, Samtaler, Årshjulet, Oppsett, Hjelp, Integrasjoner. The schema each screen
needed arrived with it — 0013-0015 for Tiltak, 0016 for the risk assessment Innsikt and
the report's section 4 both rest on — which is the order that works: a screen cannot be
built honestly ahead of the table it reads.

### S14 — Hardening
Responsive pass, full-suite re-run, advisors, CSP, error and empty states, final pixel
sweep across twelve screens × two languages × three roles.

---

## 4. Risks

| Risk | Mitigation |
| :-- | :-- |
| Security invariants re-derived from scratch | Tests written first, to fail, before any schema existed. Done in S1. |
| Auth has no design | Built from the bundle's own primitives; logged as D-03. The one surface with no pixel baseline. |
| Pixel-diffing a React app against a React prototype | 0.1% tolerance, agreed. Fonts committed so rasterisation is deterministic. |
| Cloud container is ephemeral | Everything of value must be committed AND pushed; a new session gets a fresh clone and does not inherit local commits. |
