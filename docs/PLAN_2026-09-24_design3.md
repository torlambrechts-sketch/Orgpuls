# Design 3 (24 September, `Orgpuls.dc_2`): review and implementation plan

**Status:** D1–D6 decided as recommended (X-039).
- **P0 is done:** the release rule (D-68), "Anbefaler oss" (0035), the v3 baselines (D-67)
  and the fixture's history (D-69).
- **P1 is done:** the shell, at 0 px against the v3 baselines (D-70).
- **P2 is done:** Oversikt, and Enkel as a small organisation's default (D-71).
- **P3 is done:** Resultater, its five views and the puls view (D-72).
- **P4 is done:** Kommentarer (D-73).
- **P5 is done:** Målinger and "Start neste puls nå" (D-74).
- **P6 (Tiltak) is next.**

The design was reviewed in a browser. The offline copy of `dc_2` was rendered with the
same runtime as the baselines. Every screen and state was captured: the Enkel and Full
modes, top and side layouts, all 9 wizard steps, the 4 Målinger tabs, the 5 Resultater
tabs, the Tiltak board and list, and phone width. That rendering was then read against
the current code, schema and fixture.

---

## 1. What changed

| Area | Change | Size |
| :-- | :-- | :-- |
| **Shell** | The nav becomes Innsikt · Målinger · Resultater · Kommentarer (with an unanswered badge) · Tiltak · Oppsett. The header loses Grunnlag and the Tuva button and gains a Hjelp button with the Tuva face, an Enkel/Full switch and a layout toggle. The **side layout** is a 220 px rail that collapses to 62 px and runs full width. The footer columns change. | L |
| **Enkel mode** | This is the default for a daglig leder in an organisation with fewer than 50 employees. The nav shows only Oversikt and Oppsett. Oversikt is a new one-page summary: a headline sentence, the index, one line per factor, "Gjør dette nå" (open measures as checkboxes), "Venter på svar fra deg" (inline anonymous reply), Kommende målinger ("Kort oppfølging"), Lag rapport, and the documentation-status banner. | L |
| **Innsikt (Full)** | Mostly the same as today. The title and subtitle are now inside the content column. It follows the side layout's width. | S |
| **Veiviser** | New, 9 steps: Velkommen, Virksomheten (Brreg lookup), Ansatte (CSV / paste / Entra / by hand), Grupper og terskel, Verneombud and tillitsvalgt, Hva dere måler (law mode on/off), Rytme (presets, base month, a July pause, early notice to verneombud), Første utsending, Klart. It has "Fortsett senere" and "Hopp over", and opens from Oversikt ("Veiviser") and from Oppsett ("Kjør veiviseren"). | XL |
| **Målinger** | A year rail of month tiles with 2025–2027 chips and "Endre rytme". The tabs are **Kommende**, **Historikk** (type, year and sort filters, plus "Sammenlign med"), **Årshjul** (the old Årshjulet screen moves here) and **Spørsmålssett**. Deltakelse per group, and "Start neste puls nå". | L |
| **Resultater** (new; replaces Resultat) | A round picker (grunnlinje years plus pulses) and a "Sammenlign med" picker. Key figures: index, trend bars, response rate, "Anbefaler oss", "Tillit til tallene". Five tabs: **Varmekart** (group × factor, with a cell drill-down showing statements, a comment and suggested measures), **Prioritet** (score vs importance matrix), **Segmentprofil** (Team / *Ansiennitet*, the group against "resten"), **Sammenlign** (one grunnlinje against another), and **Utvikling** (every round × factor). Below them, "Forslag basert på resultatene" draws on the playbook. | XL |
| **Kommentarer** (replaces Samtaler) | A tab of Resultater with its own nav entry. It covers every round, with Temaer, filters (round, factor, status, segment), per-comment tone and inline replies. | L |
| **Tiltak** | New **Tavle** (Funn → Valgt fokus → Tiltak pågår → Effekt målt) with segment filters. A detail panel shows the steps, suggested measures and "Slik måler vi effekten" (baseline, target, measurement points). There is a **Plan** (Gantt) for the season, and a **Liste** (today's screen). | L |
| **Oppsett** | "Kjør veiviseren" in the title. Otherwise unchanged. | S |
| Removed | The Årshjulet and Samtaler screens as destinations; they become a tab of Målinger and Kommentarer. The old Resultat screen. | — |

About 3 200 lines of the bundle changed across 36 hunks, and almost every screen is
touched.

---

## 2. Review findings

### 2.1 Security and anonymity. Blockers are marked ⛔.

**⛔ S1: the wizard offers a threshold of 3 and 4.** Step 4 has chips for 3, 4, 5 and 8
svar. `app.k_min()` is 5 and cannot be lowered (invariant 1). CLAUDE.md wins on
security: build **5 and 8** only, and log the omission. No decision needed.

**⛔ S2: groups can be reconstructed by subtraction. This already exists and is not new.**
- **The leak.** `results_summary` publishes the whole-organisation index, which includes
  groups below k. `results_by_group` publishes the index of every visible group and the
  respondent count of *every* group, including suppressed ones. So
  `n_all·I_all − Σ n_g·I_g` gives the average of the suppressed remainder.
- **In the fixture:** Administrasjon (3 svar) = (28·I − 8·I_Drift − 9·I_Prosjekt −
  8·I_Verksted) / 3.
- **How accurate that is.** Integer rounding blurs it by only about ±3 index points per
  factor. For a group with **one** respondent the blur is about ±9, and one answer step
  is 8.3 points, so the result is close to that person's answers.
- **Where it shows.** The statutory report and Resultat have this today. The new Varmekart
  and Segmentprofil ("mot resten") make the arithmetic visible.
- **Fix: complementary suppression, inside the RPCs.** When the suppressed remainder is
  between 1 and k−1 people, suppress the next-smallest visible group as well, until the
  remainder is either 0 or at least k. Apply this per round, per dimension and at item
  level.
- **Cost.** In the fixture, Administrasjon plus one more group (Drift or Verksted) would
  show "—", so the design's heatmap can no longer match pixel for pixel on that row.
  → Decision **D1**.

**⛔ S3: comments carry their group.** The Varmekart drill-down shows a comment for a
single cell (Verksted × Ytringsklima), and Kommentarer filters by segment. Migration 0018
decided the opposite, on purpose: *"the group never travels with the comment even when it
is released"*. The reason is that a sentence plus an 8-person department is a smaller
haystack than the promise. → Decision **D2**.

**⛔ S4: tenure segments** (Segmentprofil › Ansiennitet, the "Under 1 år" chips in Tiltak).
- **Why it is a schema change.** A tenure band on the answer has to be stored on
  `app.responses`, which is a second quasi-identifier next to the group and the hour.
  Invariant 2 says the table carries a group and an hour and nothing that could identify
  anyone. Group × tenure × hour narrows quickly: one new hire in Verksted is a cell of one.
- **What it would need.** A new column, a start date on employees, complementary
  suppression across two dimensions, and a new invariant test.
- **Recommendation: do not build it** now. → Decision **D3**.

**S5: tone per comment.** Each comment's chip is derived from the writer's own answer to
that factor (the existing `toneOf`). This is already in production. Combined with the
filters that span rounds, it discloses a little more. Keep it, as today: the comment was
volunteered next to that answer. No decision needed; it is recorded here so the reviewer
sees it.

**S6: the writes behind the wizard.**
- **One action per step.** Each step saves through its own server action, validated with
  Zod, idempotent, and gated to `daglig_leder`. It is not one large transaction: a
  half-finished wizard is a valid state, and "Fortsett senere" relies on that.
- **Progress** goes in a new `app.setup_progress` table: one row per organisation, RLS,
  and policies and a test in the same migration.
- **Existing paths are reused.** The employee import, the Brreg lookup, groups, the
  threshold, roles, law mode and the year wheel are already written by existing actions.
  The wizard calls those and does not duplicate them.

**S7: "Start neste puls nå".** This becomes an RPC, not a client insert:
- only `daglig_leder` may call it;
- it refuses while another round is open, or within N days of the last one;
- it enqueues the normal notices through the outbox;
- it is audited.

**S8: an inline reply on Oversikt** is the same `reply` capability as Kommentarer. No new
write path.

### 2.2 Values that must not be made up (CLAUDE.md, "Never fabricate")

| Design value | Verdict |
| :-- | :-- |
| "EU-snitt 64" | **Omit.** There is no benchmark dataset; same as D-10 and "Bransjesnitt". |
| "Anbefaler oss +22" | **Buildable.** It needs a reader RPC over `app.extra_answers`, whole organisation only and k-gated, which lifts D-10. The formula needs defining for a 1–5 scale → **D5**. The generator must emit +22. |
| "Tillit til tallene: Høy · 3 av 4 grupper over terskel" | **Buildable, from a stated rule.** The input is groups above k plus response rate. For example: Høy means ≥ 75 % of groups visible *and* a response rate of at least 70 %. Needs a rule; proposal in P3. |
| Prioritet's "betydning" (importance axis) | A literal (`imp: .84`) in the prototype. The honest method is key-driver correlation (each factor against "anbefaling"), computed for the whole organisation only, with a minimum n. **D4.** |
| Trend 2023 = 60 and 2024 = 63; pulses in Mai 25, Aug 25 and Mar 26 | **Extend the fixture generator** backwards to cover them, since it is the only source of fixture rows. CI must assert the new figures. |
| "Ca. 5 minutter å svare"; "37 spørsmål · 11 områder" | Computed from the instrument rows. |
| The wizard's "Microsoft Entra" option | There is no Entra integration. Show it as unavailable, as Integrasjoner does, and log it. |
| Language chips Nynorsk and Polski | Only `no` and `en` exist; this is already logged (D-series). |
| RES2 showing 9 factors | This is the demo data behind the design, not a spec: the prototype's own `FACTORS` lists 11. The screens render whichever factors the round measured, **11** for the fixture's law mode. Law mode off shows the design's "Medarbeiderundersøkelse" set. This follows the data-not-code rule; it is not a deviation. |

### 2.3 Architecture and code quality

- **Routes.** URL state, rendered on the server; the back button and deep links work.
  - `/innsikt`: renders Oversikt when in Enkel mode, otherwise Innsikt.
  - `/resultater?runde=…&mot=…&fane=varmekart|prioritet|segment|sammenlign|utvikling&celle=gruppe:faktor`
  - `/kommentarer?runde=…&faktor=…&status=…`: a sibling route that shares the Resultater
    header.
  - `/malinger?fane=kommende|historikk|arshjul|sporsmal&ar=2026`
  - **308 redirects:** `/resultat` → `/resultater`, `/samtaler` → `/kommentarer`,
    `/arshjulet` → `/malinger?fane=arshjul`. Links in mail that has already gone out must
    keep working.
- **Enkel/Full and layout preferences.** Cookies, read on the server:
  - there is no flash of the wrong layout and no database round trip;
  - the default (Enkel for a daglig leder under 50 employees) is computed on the server
    when no cookie is set;
  - they hold no personal data.
- **One read per screen.** Supabase is in eu-central-1 and Vercel functions call it once
  per RPC, so the round trips cost more than the queries do. So:
  - **Resultater** gets one composite `results_workspace(p_round, p_compare)`, which
    returns the header, matrix, items per group, trend and playbook keys already k-gated.
    Today's screen makes several calls instead.
  - The **Kommentarer** badge becomes a `count_unanswered()` wrapped in React `cache()`,
    since it renders on every page.
- **Where suppression is enforced.** Complementary suppression (S2) belongs in a single
  SQL helper, `app.suppress_cells(...)`. Every result RPC, the report included, calls
  it, so the rule cannot drift between screens.
- **Client islands only where there is interaction:**
  - the heatmap cell selection, whose data is already on the page, so it switches
    instantly and is mirrored to `?celle=`;
  - the wizard;
  - the Tavle actions;
  - the layout toggle.

  Everything else is a server component.
- **Components are data-driven.** A factor row, a heatmap cell, a round chip or a board
  card each have one renderer keyed off the row. Nothing hard-codes 9 or 11.

### 2.4 Pixel fidelity

- **Baselines.** The existing baselines are from the old bundle, so the gate needs a
  **v3 baseline set** captured from `dc_2` with the same pipeline. That is about 35
  states:
  - Enkel and Full, top and side layouts, and the side rail collapsed;
  - every tab of Målinger and Resultater, a heatmap cell selected;
  - Kommentarer, Tiltak Tavle and Liste, Oppsett;
  - the 9 wizard steps;
  - Oversikt at 390 px.
- **Rules.** `design-reference/` gains `Orgpuls_v3.html` and `baselines-v3/`, while the
  old set stays for history. `regions.mjs` claims are rewritten per screen.
- **The fixture must hold the design's content** — the comments, owners, deadlines,
  pulses and history — or text regions will differ for reasons that aren't styling.
- **Accepted diffs.** Where a security decision changes the rendering (S1, and D1 if
  approved), the affected region becomes a documented claim, not a silent failure.

---

## 3. Decisions for the owner. Needed before the phase named.

| # | Question | Recommendation | Blocks |
| :-- | :-- | :-- | :-- |
| **D1** | Close the subtraction gap (S2) with complementary suppression? It changes how many groups the fixture shows. | **Yes.** It is a real leak for groups of 1–2, and it already exists in production. | P0 |
| **D2** | May a comment be shown with its group (heatmap drill-down, segment filter)? | **No.** Keep 0018's rule. The drill-down shows the factor's comments for the whole organisation, and the segment filter is omitted. Alternative: allow only groups with ≥ 2k respondents. | P3, P4 |
| **D3** | Tenure segments (Ansiennitet)? | **Not now.** It means a new column on `app.responses`, which is invariant 2. Segmentprofil shows Team only. | P3 |
| **D4** | Prioritet's importance axis? | A correlation with "anbefaling", whole organisation, n ≥ 20. Otherwise the tab shows the design's empty state. | P3 |
| **D5** | The formula for "Anbefaler oss" on a 1–5 scale? | The share answering 5 minus the share answering 1–3, in points (the eNPS analogue), whole organisation only. The generator emits +22. | P0 |
| **D6** | The layout toggle (the design marks it optional)? | **Build it in P1.** The shell is rebuilt anyway, and adding it later means a second pixel pass. | P1 |

---

## 4. Phases

Every phase ends with the same **gate**. A phase is not done until all of it passes:

1. **Review**, as a checklist in the commit:
   - invariants 1–8;
   - Zod at every boundary;
   - no user-facing literals, keys in `no` and `en`;
   - no invented values;
   - every omission logged in `DEVIATIONS.md`.
2. **Quality:**
   - `npx tsc --noEmit`, `npm run lint`, `npm run verify:i18n`, `npx next build`;
   - unit tests;
   - both SQL suites, plus the phase's new invariant file.
3. **Browser:** the Playwright MCP against `localhost:3000`, with the fixture login.
   - every state of the phase, in Enkel and Full, top and side layouts;
   - all three roles;
   - keyboard only (tab order, `:focus-visible`);
   - console clean;
   - 390 px.
4. **Pixel:** `pixel.mjs` against `baselines-v3`, ≤ 0.1 % per screen; `probe.mjs` for any
   failure.
5. **Ship:** commit, push the branch, CI green (database rebuilt from migrations,
   published figures asserted), then fast-forward `main`.

### P0: foundations. No new UI.
- Capture the v3 baselines from `dc_2` and commit them with the offline source.
- **Security fix (D1):**
  - `app.suppress_cells` and complementary suppression in `results_by_group`, the report
    RPCs and item level;
  - `supabase/tests/suppression_invariants.sql`, which proves that no remainder of 1…k−1
    is derivable from any published set, including with a group of 1.
- **"Anbefaler oss" (D5):** `results_recommendation(p_round)` over `extra_answers`, whole
  organisation, k-gated, with tests.
- **Extend the fixture generator:**
  - grunnlinjer for 2023 and 2024 (60 and 63);
  - pulses in Mai 25, Aug 25 and Mar 26, with the design's factor subsets and indices;
  - the design's comments and measures;
  - eNPS +22.

  It stays idempotent. CI asserts the new figures.
- Log all decisions in `DECISION_LOG.md`.

### P1: shell
- `AppNav` gains the six-item model. The Kommentarer badge counts unanswered threads
  (k-gated, cached per request).
- The header gets Hjelp with the Tuva face, the Enkel/Full switch, the layout toggle and
  the role select. The footer gets the new columns.
- The **side layout**: a 220/62 px rail, collapsed by a toggle, full width (`pageW: none`),
  with a page title bar.
- Preference cookies with the server-side default. Enkel filters the nav to Oversikt and
  Oppsett.
- The 308 redirects for `/resultat`, `/samtaler` and `/arshjulet`.
- Browser: every route in both layouts, collapsed and expanded, keyboard, and mobile. The
  side rail becomes a drawer below `md`, as the design does at phone width.

### P2: Oversikt (Enkel) and Innsikt (Full)
- Oversikt, built from existing reads:
  - the headline sentence, generated from the two lowest factors via message keys, not
    free text;
  - factor bars;
  - "Gjør dette nå" from open measures;
  - "Venter på svar" from the reply capability;
  - Kommende målinger from the wheel;
  - Lag rapport;
  - the documentation banner.
- The Innsikt adjustments.

### P3: Resultater
- `results_workspace` RPC (with suppression), then the header, round picker and compare
  picker.
- The **Varmekart** and its drill-down, then **Sammenlign** and **Utvikling**, then
  **Segmentprofil** (Team only, per D3), then **Prioritet** (per D4).
- "Forslag basert på resultatene" reuses the playbook registry (0031). "Legg i plan"
  reuses `adoptPlaybookMeasure`.
- Role scopes: the avdelingsleder sees their department's scope (0022 and 0026). Verify
  what the design shows for that role before building it.

### P4: Kommentarer
- `conversations` across all rounds (`p_round null` already exists).
- Temaer from 0030, the filters (round, factor, status; segment only if D2 allows), and
  the inline reply.
- The badge count moves to the RPC.

### P5: Målinger
- The year rail from `year_wheels` plus the rounds, then Kommende, Historikk (filters and
  "Sammenlign med" links into Resultater), Årshjul (the existing Årshjulet screen,
  re-hosted) and Spørsmålssett (the instrument).
- Deltakelse.
- **"Start neste puls nå"** as an RPC with its guards (S7) and a test.

### P6: Tiltak
- **The Tavle.** Its columns map to `measure_step`:
  - **Funn:** playbook suggestions not yet adopted;
  - **Valgt fokus:** `besluttet`, with no owner or deadline yet;
  - **Tiltak pågår:** `pagar`;
  - **Effekt målt:** `effekt_malt`.
- **The detail panel:** the steps, "Slik måler vi effekten" (the statement, now, a target
  that needs a `target` column (migration), and measurement points from the wheel), and
  "Flytt til …" through the existing step writes.
- **Plan (Gantt)** from start and deadline, plus the pulses.
- **Liste** is today's screen.

### P7: Veiviser and Oppsett
- `app.setup_progress` (RLS, policies and a test in the same migration).
- The wizard as a modal island, opened on first run (no rounds and not completed or
  skipped), from Oversikt and from "Kjør veiviseren".
- The 9 steps save through the existing actions: Brreg, import, groups, the threshold
  (5/8 only, per S1), roles, law mode, rhythm → `year_wheels`, and the first send-out →
  `rounds` and the outbox.
- A browser run of each step, "Fortsett senere" resuming at the same step, and "Hopp
  over".

### P8: hardening
- A full v3 pixel run across every state.
- Performance: Lighthouse on Innsikt and Resultater, with a budget of TTFB < 400 ms and
  LCP < 2 s on a Vercel preview, and one RPC per screen confirmed in the logs.
- An adversarial security pass over the new RPCs (differencing, role scope, anon grants).
- Supabase advisors clean.
- Docs updated: IMPLEMENTATION_PLAN, DEVIATIONS, DECISION_LOG.

**Order and dependencies:** P0 → P1 → (P2, P3) → P4 → P5 → P6 → P7 → P8.
- P2 and P3 can overlap once P1 has landed.
- P7 comes last because it writes through the actions the other phases touch.
- Each phase ships to production on its own and leaves no half-migrated navigation
  behind. P1 ships the new nav only together with redirects to working destinations.
