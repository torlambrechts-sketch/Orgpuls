# Engagement phase 1 — Respondent language

Branch `feat/engagement-p1`, stacked on `feat/engagement-p0` (phase 0 is not merged, and this
phase needs its QA harness and flags). The design and its choices are in docs/DEVIATIONS.md
D-127.

## How the gates ran

| Gate | Command | Result |
| --- | --- | --- |
| G1 | `npm run typecheck && npm run lint` | pass |
| G2 | `npm test && npm run test:db && npm run e2e -- --grep @p1` | pass: 197 unit tests, 48 SQL suites (translation_invariants new), e2e |
| G3 | `npm run test:invariants` | pass: I1–I7 (I3 on mobile and small) |
| G4 | `npm run qa:visual -- --step p1.2` and `--step p1.3`, every PNG opened | pass |
| G5 | `npm run e2e && npm run qa:visual -- --all` | pass: 22 captures, 1 skipped (r-switch-midway is mobile only) |

## P1.1 Translation registry

- `app.item_translations`, `app.ui_translation_approvals`, `public.respond_locales` and the two
  approval functions are in migration 0079. The rule for which languages are offered is in
  `lib/i18n/offered.ts`.
- The registry's English rows come from `npm run -s i18n:registry`: 33 core statements, 17
  extra texts, 81 module texts. They are all source `machine` and unapproved outside QA.
- On the QA stack (`app.environment = 'qa'`), the Lumio seed approves them, together with the
  respondent strings' hash. It also adds three Polish `qa-fixture` rows, which is too few, so
  Polish is not offered.
- translation_invariants.sql, 7 rows:
  - a `qa-fixture` approval is refused off the QA stack;
  - a changed text drops its approval;
  - a bad token learns nothing;
  - a good token gets the state, the employee's language, and the wording only for a complete
    language;
  - only the platform's people approve;
  - the dispatcher is told the language.

## P1.2 Language picker

| Screen id | Project | Screenshot | Global checklist | Step checklist | Notes |
| --- | --- | --- | --- | --- | --- |
| r-intro-picker | mobile | qa/screenshots/p1/p1.2/r-intro-picker-mobile.png | pass | pass | Only «Norsk» and «English»: Polish is incomplete. Piotr's language is Polish, so Piotr starts in bokmål |
| r-intro-picker | small | qa/screenshots/p1/p1.2/r-intro-picker-small.png | pass | pass | «Neste» stays on screen: the picker sits in the top row and takes no height |
| r-question-en | mobile | qa/screenshots/p1/p1.2/r-question-en-mobile.png | pass | pass | Eva's language is English, so Eva starts in it. Statement, factor label and scale are translated; long words wrap |
| r-question-en | small | qa/screenshots/p1/p1.2/r-question-en-small.png | pass | pass | |
| r-switch-midway | mobile | qa/screenshots/p1/p1.2/r-switch-midway-mobile.png | pass | pass | Four answers, then «English» at question 5: still 5 / 33, now in English. The flow's state is not reset |

- The flow has no intro screen (phase 0 report). The picker is in the top row of every
  question, opposite the organisation's name, which also makes switching midway possible.
- The language is the address's `?lang=` only: never a cookie, never stored with an answer (I6).
- The employee's language is `employees.language`, read from column F of the CSV import.

## P1.3 Invitations in the employee's language

| Screen id | Project | Screenshot | Global checklist | Step checklist | Notes |
| --- | --- | --- | --- | --- | --- |
| email-invite-nb | desktop | qa/screenshots/p1/p1.3/email-invite-nb-desktop.png | pass | pass | Piotr (Polish, not offered): bokmål throughout |
| email-invite-en | desktop | qa/screenshots/p1/p1.3/email-invite-en-desktop.png | pass | pass | Eva: English throughout, including the footer. The link is the plain one: the page opens in Eva's own language by the same rule (D-128) |
| sms-invite-nb | txt | qa/screenshots/p1/p1.3/sms-invite-nb.txt | — | pass | 109 characters, 1 segment, GSM-7, with the production address (https://www.orgpuls.com) and the 22-character link (0078, D-128) |
| sms-invite-en | txt | qa/screenshots/p1/p1.3/sms-invite-en.txt | — | pass | 113 characters, 1 segment, GSM-7 |

- The captures use the production address, as the dispatcher's ORGPULS_APP_URL is (verified by digest), so they show what an employee receives.
- Unit tests check all four personal kinds (invitation, reminder, second reminder, the
  asked-for link) in both languages, from a 34-character organisation name with the longest
  deadline date: each is one segment with the link whole.
- The dispatcher decides with the flags it runs with. None are set in production, so
  production mail is unchanged.

## Baselines

- **Created:** r-intro-picker, r-question-en and r-switch-midway (mobile and small) and
  email-invite-nb/en (desktop).
- **Intentionally updated:** email-invite-nb/en (desktop), after main's shorter link (0078,
  D-128) was merged in: the link box is one line instead of two, and what follows it moves up
  21 px. Nothing else in either mail changed. Phase 0's r-intro, r-question and r-submit still pass
  against their baselines. The picker adds two words in the top row and moves nothing: its
  height is taken out of the row.

## axe

Every capture is clean. The invitation e-mail had no `<title>` (axe `document-title`), and the
product's mails now carry their subject as title.

## Human gate

`locale_en` stays off in production until a person approves every English item
(`approve_item_translations`) and the respondent strings' hash (`approve_ui_translation`).
`locale_pl` and `locale_lt` need translations and messages files first.
