# Engagement features – phased implementation with QA and visual verification

Audience: Claude Code, running autonomously, and the developer reviewing its PRs.
Source: the research report "Making the Orgpuls Survey Feel Worth Answering" (recommendations rated high or medium impact).
Related:
- [Industry pages and survey modules – instructions](https://claude.ai/artifact/N6bpUp7FoL4aFVAURCN2pF)
- [Platform admin specification](https://claude.ai/code/artifact/299692f9-4524-4966-8286-d79980fc2dbb)

## Scope

| Report item | Feature | Phase |
| --- | --- | --- |
| Language choice | Respondent picks language; invitations in the employee's language | 1 |
| 1 | "Siden sist" impact block in invitation and first screen | 2 |
| 2 | Informational thank-you screen | 2 |
| 5 | Pulse explains why a question is asked again | 2 |
| 3 | Employee results page and action board, sent automatically when results publish | 3 |
| 8 | Manager commitments on actions | 3 |
| 9 | Celebrating progress | 3 |
| 4 | Manager reply nudges for anonymous comments | 4 |
| 7 | Anonymous suggestions tied to a factor, with moderation | 4 |
| 6 | Anonymous priority vote and recorded decision | 5 |
| 10 | "Jeg vil bidra" volunteer sign-up, separated from answers | 6 |
| 11 | "Målt og fulgt opp" process badge, verification page and LinkedIn template | 7 |

Out of scope: participation meter (report item 12). Never build individual points, streaks, badges, leaderboards, prizes or completion-linked donations; see the report's "What NOT to Do".

---

## 1. How to run this

Work through the phases in order, and the steps within each phase in order. **Do not wait for human review between steps or phases.** Move on as soon as the gates pass.

### The loop for every step

1. **Read the step.** Implement it on the phase branch `feat/engagement-p{n}`. Phase 1 branches from `main`; each later phase branches from the previous phase's branch (stacked).
2. **Run the gates.** Every gate must pass.

| Gate | Command | Passes when |
| --- | --- | --- |
| G1 Static | `pnpm typecheck && pnpm lint` | No errors |
| G2 Tests | `pnpm test && pnpm test:db && pnpm e2e --grep @p{n}.{m}` | All green |
| G3 Invariants | `pnpm test:invariants` | All of I1–I7 green |
| G4 Visual | `pnpm qa:visual --step p{n}.{m}`, then open every PNG | Every screen passes the global checklist and the step checklist |
| G5 Regression | `pnpm e2e && pnpm qa:visual --all --compare` | No unintended diff against earlier baselines |

3. **Record the result** in `qa/reports/phase-{n}.md`, using the report template in section 2.6.
4. **Commit and continue.** Commit as `feat(engagement): p{n}.{m} <title>` and go straight to the next step.
5. **End of a phase:**
   - run G5 for the whole phase,
   - open a PR titled `Engagement phase {n}: <name>`, linking the phase report,
   - start the next phase immediately. Do not wait for the merge.

### When something fails

- **Up to three fix attempts per failing gate.** After the third failure, write `qa/BLOCKED.md` with the step, the gate, what you tried and the error output. Then stop.
- **Hard stops** – stop at once, write `qa/BLOCKED.md`, and do not work around the problem:
  - An invariant (I1–I7) fails and can only be fixed by weakening the test.
  - A migration would alter or delete existing survey responses.
  - Credentials or secrets are missing.
  - The QA seed script would run against production.
- **Never do these to get past a gate:**
  - skip, weaken or delete a test,
  - raise `maxDiffPixelRatio`,
  - update a baseline to hide an unintended change.

### Features gated by a human

Some features are built, tested and visually verified in full, but their feature flag stays **off** in production until a person signs off. This is not a stop – carry on to the next phase.

| Flag | Needs |
| --- | --- |
| `locale_{code}` for each non-bokmål language | Approved translation of every item and UI string |
| `action_volunteers` | Data protection impact assessment (template created in P6) |
| `measured_badge_public` | Product sign-off on badge wording and criteria |

List these in the final summary (P8).

---

## 2. QA harness (built in Phase 0)

### 2.1 Viewports

| Playwright project | Size | Used for |
| --- | --- | --- |
| `mobile` | 390 × 844, deviceScaleFactor 2 | All respondent and employee screens |
| `small` | 360 × 740 | All respondent and employee screens |
| `desktop` | 1280 × 800 | Manager, HR, verneombud and admin screens; public pages |

Capture light theme. Capture dark theme as well if the app supports it.

### 2.2 Screenshot helper

`qa/visual/shoot.ts` exports `shoot(page, id)`:
- saves `qa/screenshots/p{n}/{step}/{id}-{project}.png`,
- calls `expect(page).toHaveScreenshot()` with `maxDiffPixelRatio: 0.01` and animations disabled,
- runs axe on the page and fails on serious or critical issues.

For determinism:
- freeze the clock with `page.clock.setFixedTime('2026-10-15T10:00:00+02:00')`,
- use a fixed random seed for question order,
- wait for fonts (`document.fonts.ready`).

### 2.3 Outgoing messages

- Use a test transport for SMS and email. Nothing is really sent.
- **Email:** render the HTML in a page and screenshot it.
- **SMS:** save the text to `qa/screenshots/.../{id}.txt` and assert the segment count:
  - bokmål uses GSM-7, which includes æ, ø and å: at most 2 segments (306 characters),
  - any locale needing UCS-2 (e.g. Polish, Lithuanian): at most 3 segments (201 characters).

### 2.4 Seed tenant

`pnpm qa:seed` is idempotent. It refuses to run if `SUPABASE_URL` points at production.

- **Org:** Lumio AS, org.nr 999 999 999 (test).
- **Users:**

| Person | Role |
| --- | --- |
| Kari Nordmann | daglig leder |
| Hanne Berg | HR |
| Per Lie | avdelingsleder for Drift |
| Siri Dahl | verneombud |
| Jonas Moe | tillitsvalgt |

- **Groups:**

| Group | Respondents | Purpose |
| --- | --- | --- |
| Drift | 12 | Normal group |
| Salg | 7 | Normal group |
| Økonomi | 3 | Below threshold; must never show values |

- **History:**
  - main survey 1 closed in March 2026,
  - three actions: one closed, one in progress, one overdue,
  - one pulse re-measuring the in-progress action,
  - four anonymous comments, one of them answered.
- **Current:** main survey 2, open, sent October 2026.
- **Languages:** bokmål, plus an English translation marked as a test fixture (`source: 'qa-fixture'`, never approvable in production). Polish is present but incomplete, so it must not be offered.

### 2.5 Global visual checklist

Check every screenshot against this list, then against the step's own checklist.

1. No horizontal scroll, and no clipped or overlapping text.
2. Tap targets at least 44 px on mobile, and keyboard focus visible.
3. The copy matches this document exactly (bokmål) or the locale under test. No raw i18n keys, and no "undefined", "null" or "NaN".
4. Only existing design tokens are used, with no off-palette colours. Contrast passes axe.
5. Dates are in Norwegian format, e.g. "15. oktober 2026".
6. **Anonymity:**
   - Økonomi (n = 3) never shows a number, band, vote count, suggestion or comment.
   - No respondent name, email, phone number or token appears on any respondent-generated content.
   - No participation count appears for any group.
7. No game elements: no points, stars, trophies, confetti, rankings or "streaks".

### 2.6 Phase report template

`qa/reports/phase-{n}.md` contains:
- one table per step, with columns: screen id, project, screenshot path, global checklist (pass/fail), step checklist (pass/fail), notes,
- the list of baselines created or intentionally updated, each with a reason,
- the invariant suite result and the axe summary.

### 2.7 Invariant suite

`tests/invariants/` runs on every step. These are the non-negotiables.

| Id | Invariant |
| --- | --- |
| I1 | No API or RPC used by respondent or employee pages returns values for a group with n < `max(5, org_threshold)`, and existing differencing protection holds for every new result type |
| I2 | Tables holding respondent-generated content (votes, suggestions, count answers) have no column or foreign key referencing respondent, invitation or token |
| I3 | Respondent and employee pages send no analytics or log events containing a token, respondent id, IP or user agent. Assert with mocked logger and analytics |
| I4 | No endpoint exposes per-group or per-person participation. Participation is organisation-level only, as before |
| I5 | Token tables store only a hash. No token can be mapped back to a respondent once invitations have been sent |
| I6 | Answer rows store no locale or language |
| I7 | Reminders are still system-sent. No manager-facing screen shows who has or hasn't answered |

---

## Phase 0 – Foundation

### P0.1 Discovery and flags

- Reuse `docs/implementation/step0-findings.md` from the modules work. If it doesn't exist, run Step 0 from the industry-pages instructions first.
- Add these flags to the existing flag system, all defaulting to off in production and on in QA:
  - `engagement_since_last`, `engagement_thanks`, `engagement_pulse_reason`
  - `engagement_results_page`, `engagement_commitments`, `engagement_celebrate`
  - `engagement_reply_nudges`, `engagement_suggestions`, `engagement_vote`
  - `action_volunteers`, `measured_badge_public`
  - `locale_en`, `locale_pl`, `locale_lt`

### P0.2 QA harness, seed and baselines

- Build everything in section 2.
- Capture baselines of the existing screens:

| Screen id | Screen |
| --- | --- |
| `r-intro` | Respondent intro |
| `r-question` | First question |
| `r-submit` | Submit |
| `m-results` | Manager results overview |
| `m-factor` | Factor detail |
| `m-actions` | Actions list |
| `m-comments` | Comments |

- Visual step checklist: record existing issues in the report without fixing them, since those screens are out of scope. All new baselines must be created.

### P0.3 Invariants on the current product

- Implement I1–I7 and run them against the current product.
- If the current product fails an invariant, this is a **hard stop**: report it, because it is a live privacy issue.

---

## Phase 1 – Respondent language

### P1.1 Translation registry

- Add the table `item_translations` with columns: `item_id`, `locale`, `text`, `source`, `approved_by`, `approved_at`, primary key (`item_id`, `locale`).
  - `source` is one of `official`, `professional` or `qa-fixture`.
  - A `qa-fixture` row can't be approved outside QA; enforce this with a check or trigger that looks at an environment setting.
- Move UI strings for respondent pages into the existing i18n library, with bokmål as the source.
- A locale is **offered** only when both hold:
  - its flag is on,
  - every item in the survey's modules, and every respondent UI string, has an approved translation.
- Bokmål is always offered.

### P1.2 Language picker

- Put a compact picker at the top of the respondent intro. Show each language by its own name: "Norsk", "English", "Polski", "Lietuvių".
- Set the default in this order:
  1. `?lang=` in the invitation link,
  2. the optional `language` column in the employee list (add it to the CSV import mapping),
  3. bokmål.
- Changing the language keeps progress.
- The choice lives in the session only. **It is never stored with answers (I6), and language is never a segment or filter.**

### P1.3 Invitations in the employee's language

- Invitations and the system reminder use the employee's `language` if that locale is offered; otherwise bokmål.
- Test SMS segment limits per locale (section 2.3).

**Visual verification P1**

| Screen id | Projects | Step checklist |
| --- | --- | --- |
| `r-intro-picker` | mobile, small | Only Norsk and English shown (Polish incomplete); picker doesn't push the start button below the fold on `small` |
| `r-question-en` | mobile, small | English text; long words wrap; scale labels translated |
| `r-switch-midway` | mobile | Switching language at question 5 keeps answers 1–4 |
| `sms-invite-nb` / `sms-invite-en` | txt | Segment limits met; link present |
| `email-invite-nb` / `email-invite-en` | desktop | Correct language throughout, including footer |

---

## Phase 2 – Close the loop for respondents

### P2.1 "Siden sist" block

**Data.** Include actions whose status changed since the previous main survey closed (closed or in progress), and that are visible to the respondent's group:
- organisation-wide actions, plus
- actions for the respondent's own group, if that group has at least the threshold number of respondents.

Show at most three: closed first, then most recent.

**Send flow.** HR sees a preview and can edit the intro text before sending. Store it as `surveys.intro_message`, localised through the registry.

**SMS copy (bokmål):**
- With closed actions: "Hei! Ny arbeidsmiljøundersøkelse fra {org}. Siden sist er {n} tiltak gjennomført. Svar anonymt på ca. {min} min: {lenke}"
- With none closed: leave out the middle sentence.
- First survey: "Hei! {org} kartlegger arbeidsmiljøet. Svar anonymt på ca. {min} min: {lenke}"

**Intro block:**
- Title: "Siden sist"
- Each item: action title, status chip "Gjennomført" or "Pågår", and the owner's role.
- Footer: "Tiltakene ble valgt ut fra svarene dere ga i {måned år}."
- Empty state (first survey): "Dette er første måling. Etterpå får dere se hva som blir gjort med svarene."

### P2.2 Thank-you screen

Add a required field `surveys.results_publish_date`, set in the send flow; the default is the close date plus 7 days.

Copy:
- "Takk for svarene dine"
- "Resultatene deles med alle {dato}."
- "Daglig leder, HR, verneombud og tillitsvalgte ser de samme tallene samtidig."
- "Ingen kan se hva du har svart, og ingen grupper vises med færre enn {terskel} svar."
- "Etterpå velges tiltak ut fra svarene, og du får se hva som blir gjort."

No animation, no confetti, no share buttons.

### P2.3 Why a pulse question is asked again

On each re-measured item in a pulse, add a line under the statement:

"Spørres fordi dere jobber med: {tiltak} (startet {dato})"

Show it only if the action is visible to the respondent's group under the rule in P2.1.

**Visual verification P2**

| Screen id | Projects | Step checklist |
| --- | --- | --- |
| `sms-invite-since` | txt | "Siden sist er 1 tiltak gjennomført" (seed has one closed action); ≤ 2 segments |
| `email-invite-since` | desktop | Block matches the SMS count; links work |
| `m-send-preview` | desktop | HR can edit the intro; the preview updates |
| `r-intro-since` | mobile, small | Max 3 items; status chips; owner shown as a role; Økonomi respondents see organisation-wide actions only |
| `r-intro-first` | mobile | Empty-state copy for a first survey |
| `r-thanks` | mobile, small | Exact copy; date correct; no game elements |
| `r-pulse-reason` | mobile | Reason line only on the re-measured item; wraps cleanly |

---

## Phase 3 – Results for employees

### P3.1 Employee results page and action board

**Route and tokens.**
- Route: `/r/{token}`, public and `noindex`.
- `participant_tokens` columns: `token_hash`, `survey_id`, `group_id` (nullable), `vote_used_on` (date, nullable), `suggestions` (jsonb counter per factor).
- Tokens are generated in the send job, delivered, and only the hash is stored (I5).
- For a respondent whose group is below the threshold, store `group_id = null`, so the page shows organisation-level results only.
- Tokens expire after 12 months.

**Sending.** When results publish, send to all invitees on their channel:

"Resultatene fra arbeidsmiljøundersøkelsen i {org} er klare. Se hva dere svarte og hva som skal gjøres: {lenke}"

**Page sections, in order:**
1. "Dette fungerer": the top three factors.
2. "Dette jobber vi med": the prioritised factors.
3. "Tiltak": action board with title, factor, owner's role, deadline and status.
4. "Din gruppe": only when `group_id` is set.

If the group is below the threshold: "Gruppen din har færre enn {terskel} svar, så du ser tallene for hele virksomheten."

**No per-view logging (I3).**

### P3.2 Manager commitments

- Add to actions: `commitment_text` (max 200 characters) and `commitment_due` (date).
- In the action detail, add the editor "Min forpliktelse".
- On the board: "Forpliktelse fra {rolle}: {tekst} innen {dato}".

### P3.3 Celebrating progress

**Triggers:**
- an action is closed, or
- a factor's index rises by at least `org_settings.celebrate_min_delta` points (default 5) against the previous measurement, for the organisation or for a group that meets the threshold.

**Output:**
- a banner on the board,
- a message (org setting, default on): "Vi fikk det til: {tiltak} er gjennomført." or "{Faktor} har gått opp siden forrige måling."

**Rules:**
- Never show deltas for groups below the threshold.
- Never compare or rank groups.
- Never celebrate score levels, only improvement and completed actions.

**Visual verification P3**

| Screen id | Projects | Step checklist |
| --- | --- | --- |
| `sms-results-ready` | txt | ≤ 2 segments; link present |
| `e-board-drift` | mobile, small, desktop | All sections present; "Dette fungerer" first; Drift group shown |
| `e-board-okonomi` | mobile | Økonomi token shows organisation-level results only, plus the fallback message |
| `m-commitment-edit` | desktop | Editor validates length and date |
| `e-board-commitment` | mobile | Commitment line shown under the action |
| `e-board-celebrate` | mobile | Banner after closing the seeded action; no confetti; no group comparison |
| `sms-celebrate` | txt | Copy exact |

---

## Phase 4 – Two-way dialogue

### P4.1 Manager reply nudges

**SLA.** A comment should get its first reply within 10 working days of results publishing.
- Working days exclude weekends and Norwegian public holidays.
- Put the holidays for 2026–2027 in the data file `data/holidays-no.json`.

**Reminders.**
- Remind the comment's responsible manager on working day 5 and working day 9.
- Overdue comments are flagged to HR.

**UI.**
- Dashboard badge: "Ubesvarte kommentarer ({n})".
- Email subject: "{n} kommentarer venter på svar".
- Three reply templates, stored as data:
  1. "Takk for at du sa fra. Dette gjør vi: …"
  2. "Takk. Vi tar dette med i tiltaksarbeidet og kommer tilbake innen {dato}."
  3. "Takk for innspillet. Dette kan vi ikke gjøre nå, fordi …"
- Replies stay in the existing anonymous thread.

### P4.2 Suggestions tied to a factor

**Where.** On the employee board, under factors in the medium or high band.

**Form.**
- Prompt: "Har du et forslag til hva som kan gjøre dette bedre?"
- Help text: "Ikke skriv navn eller detaljer som kan vise hvem du er."
- Up to 500 characters.
- Limit: 3 suggestions per factor per token.

**Identifier check (server-side, before saving).** Look for:
- email addresses,
- phone numbers,
- names from the org's employee list.

If found: "Forslaget ser ut til å inneholde et navn, en e-postadresse eller et telefonnummer. Fjern det før du sender."

**Storage.** `factor_suggestions` columns: `id`, `survey_id`, `factor_ref`, `group_id` (nullable), `text`, `status`, `created_on` (date). No token reference (I2).

**Moderation.**
- A queue visible to HR and verneombud, with approve, redact-and-approve, or reject with a reason.
- Approved suggestions are visible to managers:
  - organisation-wide, and
  - per group only where the existing five-writer comment rule is met.
- "Gjør til tiltak" creates an action linked to the suggestion.

**Confirmation:** "Takk. Forslaget blir lest av HR og verneombudet før det deles."

**Visual verification P4**

| Screen id | Projects | Step checklist |
| --- | --- | --- |
| `m-dashboard-unanswered` | desktop | Badge count matches the seed (3 unanswered) |
| `email-nudge` | desktop | Subject and body; the link opens the comment |
| `m-reply-templates` | desktop | Three templates insert correctly |
| `e-suggest-form` | mobile, small | Only under medium/high factors; counter visible |
| `e-suggest-warning` | mobile | Warning when the text contains "Per Lie" |
| `e-suggest-thanks` | mobile | Copy exact |
| `m-moderation` | desktop | Visible to HR and verneombud only; redaction works |
| `m-suggestions-approved` | desktop | No Økonomi suggestions at group level |

---

## Phase 5 – Anonymous priority vote

**Opening the vote.**
- HR opens the vote at publish. It's on by default, with a 7-day window (configurable).
- Candidates: organisation-level factors in the medium or high band, at most 5.
- Voters can optionally also pick one of the factor's three suggested actions.

**Voting.**
- Card on the board: "Hva bør dere jobbe med først?" and "Du har én stemme. Ingen kan se hva du stemte."
- One vote per token. In a single transaction:
  - set `participant_tokens.vote_used_on`,
  - insert `priority_votes` (`id`, `survey_id`, `factor_ref`, `action_suggestion_ref`, `created_on` date).
- The vote row has no token or group reference.
- After voting: "Takk for stemmen din. Resultatet vises når avstemningen er ferdig {dato}."

**Results.**
- Organisation level only.
- Shown when at least the threshold number of people have voted; otherwise: "Resultatet vises når minst {terskel} har stemt."
- Group-level vote results are not shown, because they would allow differencing.

**Decision.**
- After the vote closes, daglig leder or HR, together with the verneombud, records the decision per factor with a required rationale.
- On the board: "Dere stemte – dette ble bestemt", followed by the rationale.

**Visual verification P5**

| Screen id | Projects | Step checklist |
| --- | --- | --- |
| `e-vote-open` | mobile, small | At most 5 options; the optional action choice is collapsible |
| `e-vote-done` | mobile | Voted state; the card doesn't reappear on reload |
| `e-vote-suppressed` | mobile | Suppression copy when fewer than 5 have voted |
| `e-vote-results` | mobile, desktop | Organisation level only; no group breakdown |
| `m-vote-decision` | desktop | Rationale required; verneombud appears as a participant |
| `e-board-decision` | mobile | Decision and rationale shown |

---

## Phase 6 – "Jeg vil bidra" volunteer sign-up (flag `action_volunteers`, off in production)

**Entry.** Button "Jeg vil bidra" on board actions that are planned or in progress. It opens `/bidra/{action_public_id}` with **no token in the URL or the request**: strip it, and submit in a fresh request.

**Form fields:** name, contact (phone or email), optional note.

**Notice:** "Dette er atskilt fra svarene dine. Ingen kan se hva du svarte i undersøkelsen. Navnet ditt deles bare med den som eier tiltaket og verneombudet, og slettes 30 dager etter at tiltaket er avsluttet."

**Small-group warning.** If the action's group has fewer than 10 members: "Gruppen er liten. Andre kan kanskje gjette at temaet er viktig for deg."

**Storage.**
- `action_volunteers` columns: `id`, `action_id`, `name`, `contact`, `note`, `created_on` (date), `delete_after` (date).
- Visible to the action owner and the verneombud only.
- A daily job deletes rows after `delete_after`, which is set to the action's close date plus 30 days.

**DPIA template.** Create `docs/dpia/action-volunteers.md` for a person to complete, covering: purpose, legal basis (to be decided), data minimisation, retention and the risk assessment for small groups.

**Visual verification P6** (captured with the flag on in QA)

| Screen id | Projects | Step checklist |
| --- | --- | --- |
| `e-board-volunteer-btn` | mobile | Button only on planned or in-progress actions |
| `e-volunteer-form` | mobile, small | Notice visible before the fields; no token in the URL (assert in the test) |
| `e-volunteer-small-group` | mobile | Warning shown for a group with fewer than 10 members |
| `m-volunteers-list` | desktop | Visible to the owner and verneombud; hidden from other managers |
| `prod-flag-off` | mobile | With the flag off, no button appears anywhere |

---

## Phase 7 – "Målt og fulgt opp" badge (flag `measured_badge_public`, off in production)

**Criteria.** All must be met within the calendar year; each is evaluated from data.

| Id | Criterion |
| --- | --- |
| C1 | A main survey closed with organisation n ≥ threshold |
| C2 | The employee results page was published |
| C3 | At least one action closed |
| C4 | At least one closed action re-measured in a later pulse |
| C5 | Approved in the app by the verneombud (or a tillitsvalgt if there is no verneombud) |

**Progress card** for daglig leder and HR: a checklist of C1–C5 with plain-language status. It shows no scores.

**Approval (C5).** The verneombud gets a request with a preview of the public page and the LinkedIn text, and can approve or decline with a comment.

**Badge.**
- An SVG/PNG in Orgpuls tokens, reading "Målt og fulgt opp · Arbeidsmiljøkartlegging {år}".
- No scores and no response rates.

**Public verification page** `/verifisert/{slug}` lists:
- measurement date,
- number of actions completed and re-measured,
- "Bekreftet av verneombudet" (the role, not the name),
- the validity period.

It also carries an OG image.

**LinkedIn.**
- Pre-filled text (bokmål):

  "Vi har kartlagt arbeidsmiljøet i {org} og fulgt opp med tiltak. {n} tiltak er gjennomført og målt på nytt, og arbeidet er bekreftet av verneombudet. {lenke}"

- If a vote was held, add: "De ansatte var med og valgte hva vi skulle jobbe med først."
- Provide a copy button and a share link: `https://www.linkedin.com/sharing/share-offsite/?url={verification_url}`.

**Validity.**
- 15 months.
- Revoked automatically if the approval is withdrawn; the page then shows "Ikke lenger gyldig".

**Visual verification P7**

| Screen id | Projects | Step checklist |
| --- | --- | --- |
| `m-badge-progress` | desktop, mobile | C1–C5 statuses match the seed; no scores |
| `vo-badge-approve` | desktop | Preview matches the final page |
| `badge-png` | image | Legible at 200 px wide; only brand colours |
| `pub-verified` | mobile, desktop | No scores, no names, no response rate |
| `pub-verified-og` | image | OG image renders at 1200 × 630 |
| `m-linkedin-text` | desktop | Text exact; conditional sentence only when a vote was held |
| `pub-revoked` | mobile | Revoked state |

---

## Phase 8 – Release readiness

1. Run the full regression: all e2e, all visual baselines, the invariants and axe across every screen.
2. Run Lighthouse (mobile) on `r-intro`, `r-thanks`, `/r/{token}` and `/verifisert/{slug}`: accessibility ≥ 95; performance ≥ 90.
3. Write `qa/reports/summary.md` with:
   - one table per phase, linking every screenshot,
   - flag states: on in QA, and the recommended production state,
   - human actions needed:
     - complete the DPIA,
     - approve translations per locale,
     - sign off the badge,
     - merge PRs in order,
     - confirm the defaults below,
   - known issues from P0 baselines that are out of scope.
4. Stop. This is the only planned stop.

---

## 3. Defaults to confirm

Implement these defaults and list them in the summary. None of them blocks progress.

| Setting | Default |
| --- | --- |
| Action owner shown to employees | Role, not name |
| Celebration threshold | +5 index points |
| Results publish date | Close date + 7 days |
| Comment reply SLA | 10 working days; reminders on day 5 and day 9 |
| Suggestions per factor per person | 3 |
| Vote window | 7 days; at most 5 candidate factors |
| Badge validity | 15 months |
| Badge approver | Verneombud; tillitsvalgt if there is no verneombud |
| Volunteer data retention | 30 days after the action closes |
| Result-link token expiry | 12 months |
