# Journeys — /audit phase 4

Each journey: who, the steps, and what must be true after each step — **on screen**, **in the
database**, **in the mail**. `(P0)` journeys are automated first and run in every `full` audit.
Accounts on the QA stack: the local account (`dev.orgpuls@nordvik.example`, daglig leder of the
fixture organisation), the Lumio tenant (`scripts/qa/seed.mjs`, one user per role), demo tokens
`demo.<round_id>.<employee_id>`, a local super-admin created by the audit (never on hosted).

Record a screenshot per numbered step: `qa/reports/audit-<date>/<Jn>/<step>.png`.

---

## J1 (P0) — A new organisation from signup to its first round planned
Actor: new daglig leder.
1. `/registrer` with an org number → Brønnøysund facts prefilled. **Screen**: company name.
2. Confirm, sign in → wizard opens. **DB**: `organizations`, `memberships (daglig_leder)`, a trial.
3. Walk every wizard step (groups, employees CSV, wheel, notices, first round). **DB** after each:
   `setup_progress` row; groups/employees as entered; `year_wheels` + `wheel_notifications`
   (alle ansatte a day before, D-148).
4. Finish → Målinger shows the planned round with the dates the wizard said.
5. Oppsett › Selskap › Logo: «Bedriftens logo», upload a PNG. **Screen**: the header's and the side
   rail's brand mark is the logo; «Orgpuls» puts the mark back. **DB**: `org_logos` row, `in_header`.
   **Mail**: the next invitation is headed by `/logo/<key>`; the survey, `/inn/<code>`, `/r/<slug>`,
   the report cover and the poster show it (D-154).
Negative: an org number already registered; a CSV with a bad row (named, not dropped silently); an
SVG, a GIF or a file over 256 KB as the logo (refused, with its reason); a verneombud's upload
(refused).

## J2 (P0) — What the leader sets up is exactly what the employee is asked
Actor: daglig leder, then an employee.
1. Måleoppsett: pick factors, extras, one own «Skala» and one own «Fritekst» question, comment
   policy, dialogue on. Save. **DB**: `round_factors`, `round_extra_questions`, `round_org_questions`.
2. Forhåndsvis: the preview lists exactly those questions, in that wording.
3. Open the round (wheel tick or «Start nå»). **Mail** (`dispatch_claim` + `renderNotice`): the
   invitation says the minutes, the greeting if set, the results promise if alle ansatte are told.
4. Employee opens the link → intro with four promises → pages by factor → own questions present
   → submit. **Screen**: done. **DB**: one `responses` row with no linkage column; answers in
   `answers`, `extra_answers`, `org_question_answers`; the invitation marked responded; the token
   refused on a second open with the same message as an unknown one.
Negative: a question removed after opening is still asked as opened (settings fixed once open).

## J3 (P0) — Anonymity holds everywhere a figure can show
Actors: daglig leder, avdelingsleder, verneombud, an employee via `/r/<slug>`.
1. Close a round with group A at k−1 answers and group B at ≥ k.
2. For each role, visit: Innsikt, Resultater (every tab), Kommentarer, Rapport, participation,
   the employees' page, and read every mail the close produces.
3. **Assert**: no figure for A anywhere; not derivable by whole minus B (complementary
   suppression); no comment from A; participation for A hidden where it should be; the
   employees' page shows only the whole organisation.
4. **DB**: as `authenticated`, `select` on `responses`/`answers`/`extra_answers`/
   `response_comments`/`org_question_answers` is denied.

## J4 (P1) — Reminders, extension and the lagging department
1. Open round, half its time passed, one department ≥ 10 points behind → daglig leder mail
   names no department and no figure (P1-6).
2. Closing time with < 50 % answered and «Forleng» on → closes 3 days later, once; reminder to
   non-respondents only (P0-4, D-146). With it off → closes on time.
3. Reminder day and final reminder go only to those who have not answered; quiet hours hold.
4. Årshjulet: «21 dager før» → the verneombud's, tillitsvalgtes' and daglig leder's ladder rows say
   21 and their `forvarsel` is queued 21 days before the round opens; avdelingsledere and alle
   ansatte keep theirs (A-01, D-153).

## J5 (P1) — From results to measures, and follow-up
1. Leader creates a measure from a factor → Tiltak board shows it; assign owner and date.
2. Move the date into the past → next weekly run: owner gets one mail listing it; verneombud a
   copy when the wheel says so (P1-5).
3. Complete it → effect question asked next grunnlinje (P1-7) → Resultater shows the effect.
4. The employees' page lists the decided measure with its status, the owner not named.
5. § 9-2: with a round closed and no evaluation recorded, Rapport section 1 says when the evaluation
   fell due, and the Monday job sends the daglig leder one `evaluering` mail; recording one in
   «Registrer til rapporten» moves the due date by the cadence and the next reminder is dropped as
   resolved (A-02, D-153).

## J6 (P1) — Roles see what they may, and no more
For avdelingsleder and verneombud: every nav item and page; assert the scope (own department,
no single comments for verneombud, no admin of members). Direct URL to a page they may not see
→ refused, not an empty page. Another organisation's round id in a URL → refused.

## J7 (P1) — Respondent edge cases
Autosave: answer, reload → restored notice, answers back, no text stored (inspect
`localStorage`). Back button. Keys 1–5 and Enter. Expired link. Link after the round closed.
QR poster → request link by SMS/e-mail → the link works once. Language offered/not offered;
`?lang=` switch keeps answers.

## J8 (P1) — Languages end to end
With a survey language on for a pilot org: invitation in the employee's language; survey pages
and questions in it; a string not approved → the language is not offered (never half-translated).
Admin: export a package → edit → import (check, then import) → approve → the text shows; with
auto-approve on it shows without approving, marked «Auto».

## J9 (P1) — Platform admin
Sign-in needs TOTP; idle timeout; support cannot do super-admin actions; every write appears in
the audit log; legal review approve/withdraw; module publish; org trial extension; deletion
request carried out on schedule.

## J10 (P2) — Demo sandbox
`/demo` request → mail link → sandbox with DEMO banner; nothing it does sends mail to real
people; reset works; expires.

## J11 (P2) — Public site
Every page in the sitemap: 200, one h1, metadata, hreflang; forms (contact, newsletter) with
honeypot; no signed-in data on public pages; `en.orgpuls.com` renders English.

---

Adding a journey: when a feature ships, add or extend a journey here in the same commit, with
its assertions on screen, in the database and in the mail. A feature with no journey is a
finding in the next audit.
