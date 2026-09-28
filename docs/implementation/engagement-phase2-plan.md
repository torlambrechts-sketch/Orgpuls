# Engagement phase 2 — plan (task #116)

*Written 2026-09-28. Scope: `docs/implementation/engagement-phases.md` § Phase 2 (P2.1 «Siden sist»,
P2.2 thank-you screen, P2.3 why a pulse question is asked again). Built 2026-09-28 on all eight recommendations (X-085):
migration 0105, D-156, `engagement_p2_invariants.sql`. The three respondent flags were signed off
for production the same day (X-086).*

Phase 2 closes the loop for the person who answers: before they answer, what was done since last
time; after, when they will see the result; in a pulse, why a question comes back. P1-3 (0100,
D-151) already built the loop's other half, the page «Dette sa dere, dette gjør vi», and P1-4
(D-150) the respondent flow by factor with the intro page «Før du starter». Phase 2 builds on both.

---

## 1. What exists, and what phase 2 needs from it

| Needed | Exists | Gap |
| --- | --- | --- |
| Measures and their status | `app.measures` (step, completed_on, created_at, updated_at), `measure_groups` | No step history: «changed since» and «startet {dato}» cannot be read truthfully |
| The respondent's form | `respond_form(token)` → org, threshold, questions, extra, modules, own, logo | Deliberately carries no round, group or person (lib/respond/read.ts) |
| Invitation mail | `dispatch_claim` + `renderNotice`: minutes, greeting, results promise, last round's page | No «Siden sist» |
| Intro text | `organizations.invite_greeting` (0099), org-wide | Spec wants one per round |
| Results timing | the `resultat` notice is queued at close; `/r/<slug>` is live at close | Spec wants a publish date, default close + 7 days |
| Thank-you | `respond.doneTitle` «Takk. Det tok fire minutter.» + `doneLead` (the design's) | Spec's five-line copy |
| Pulse | re-measures the factors with open measures (0038, 0071) | No link from a pulse item to a measure beyond its factor |
| Flags | `engagement_since_last`, `engagement_thanks`, `engagement_pulse_reason` in lib/flags.ts | No reader |

---

## 2. Decisions needed from Tor (each with a recommendation)

1. **Whose measures does «Siden sist» list?** The spec: organisation-wide measures plus the
   respondent's own department's, when that department has at least k respondents. The survey
   deliberately knows no group, and the employees' page lists whole-organisation measures only
   (X-081).
   *Recommendation:* **whole-organisation measures only** in the first cut, as on the employees'
   page. A department's measures can follow as a database-side filter (the invitation knows the
   group; the form would carry titles only, never the group), once the k rule for "respondents" is
   defined before anyone has answered.
2. **The owner's role.** The spec shows it; D-151 and journey J5.4 say the owner is not shown, not
   even as a role, because a small team's owner is recognisable by role.
   *Recommendation:* **no owner**, as D-151.
3. **"Changed since the last survey" and «startet {dato}».** No step history exists.
   *Recommendation:* a small `app.measure_steps` log (a trigger on a step change, backfilled from
   `created_at` and `completed_on`), so both dates are recorded facts rather than guesses from
   `updated_at`, which moves on any edit.
4. **The status chips.** *Recommendation:* «Gjennomført» = gjennomført, effekt målt, lukket;
   «Pågår» = pågår. «Besluttet» (decided, not started) is not shown: it is not yet something done.
5. **The results publish date.** Today the employees' notice and page go out at close; the
   thank-you would promise «Resultatene deles med alle {dato}».
   *Recommendation:* `rounds.results_publish_on`, **default close + 7 days** as the spec says,
   editable in the send preview. Leaders keep seeing results at close; the «alle ansatte» notice
   and the employees' page wait for the date. The thank-you states that date, so the promise is
   one the scheduler keeps.
6. **The intro text.** *Recommendation:* `rounds.intro_message`, filled from the organisation's
   greeting when a round is created and editable in the send preview; bokmål is shown to everyone
   unless a translation is approved (the registry, as for own questions).
7. **SMS.** D-128 keeps every personal SMS to one segment; «Siden sist er {n} tiltak gjennomført»
   makes most two. *Recommendation:* **the count in e-mail and the survey only**; SMS unchanged.
8. **The pulse reason's place.** The spec puts it under each re-measured statement; since P1-4 a
   page is one factor. *Recommendation:* **one line under the factor's heading**, «Spørres fordi
   dere jobber med: {tiltak} (startet {dato})», for whole-organisation measures on that factor.

---

## 3. Build (after the decisions)

Stacked on the current branch, one commit per step, as engagement-phases.md § 1.

**P2.0 — Data (migration 0105).**
- `app.measure_steps` (measure_id, step, at) + trigger + backfill; RLS as measures; demo copy plan.
- `rounds.intro_message`, `rounds.results_publish_on` (default `closes_at::date + 7`).
- `respond_form`: `since` (≤ 3 items: masked title, status, closed first then most recent; `null`
  on a first survey) and `reasons` (factor → masked title and start date), both whole-organisation
  and computed in the database; still no round, group or person in the reply.
- `dispatch_claim`: `since` on an invitation (count and titles, the same rule).
- The `resultat` notice to «alle ansatte» and `round_page` wait for `results_publish_on`.
- Every new column ships with its reader and a test (wiring.mjs W1/W2).

**P2.1 — Send preview.** In Målinger, before a round opens: the intro text (editable), the publish
date, and the invitation as it will look, updating as it is edited (`m-send-preview`).

**P2.2 — Respondent flow** behind the three flags:
- «Før du starter» gets «Siden sist» (≤ 3 items, chips, footer «Tiltakene ble valgt ut fra svarene
  dere ga i {måned år}.»), or the first-survey empty state.
- The done screen gets the spec's copy with the publish date and k (`engagement_thanks`).
- A pulse's factor page gets the reason line (`engagement_pulse_reason`).
- New `respond.*` keys change the respondent UI hash: English is re-approved in admin (or
  auto-approve is on) before English respondents see it again.

**P2.3 — Mail.** The invitation carries «Siden sist» (e-mail only) when the flag is on.

**P2.4 — Proof.**
- `engagement_p2_invariants.sql`:
  - no round, group or person in `respond_form`;
  - titles masked;
  - department measures never listed;
  - ≤ 3 items;
  - the publish date holds back the employees' notice and page;
  - flags off change nothing.
- Unit tests for the mail and the SMS length.
- e2e `@p2` for the seven screens in the spec's table; `qa:visual`; axe 0.
- Journeys J2, J5 and J7 extended.

**P2.5 — Ship.**
- Deviations for the copy the design does not have. The design's thank-you is «Takk. Det tok fire
  minutter.», replaced only with the flag on.
- The report `qa/reports/phase-2.md`.
- Gates, `/audit` of the touched journeys by a fresh agent, hosted migration, deploy.
- The flags are signed off only after Tor has seen them on a pilot.

---

## 4. Risks

- **Anonymity:** the form must not learn the respondent's group. Every list is computed in the
  database and carries titles only. The invariant suite proves it.
- **A promise that must hold:** «Resultatene deles med alle {dato}» and «ser de samme tallene
  samtidig» are promises about anonymity and timing. /audit § 6 treats an unbacked one as P0, so the
  scheduler change in P2.0 is part of the thank-you, not a follow-up.
- **English:** every new respondent string needs approval before English respondents see the page
  in English (D-127).

**Size:** P2.0 ≈ half a day, P2.1–P2.3 ≈ a day, P2.4–P2.5 ≈ half a day.
