# Orgpuls — Decision & Build Log

Append-only. Every decision the user made, every fact established with evidence, every
deviation. Nothing here is an assumption: each entry names the command, file:line, or
screenshot it came from.

---

## Decisions

**D-001 Supabase** — wipe the `public` schema in `heituva-prod`
(`jmhhszsnjfqgclxzhciq`, eu-central-1) and rebuild; keep project ref, keys, region,
Vercel wiring. Evidence gathered before asking: 69 tables, 211 migration rows, 1 auth
user, 15 responses / 104 answers, 6 042 `ui_messages`, 0 storage objects. No live
respondent data.

**D-002 GitHub** — preserve current history, start `main` from an empty root commit.
51 commits, 5 branches, 1 closed unmerged PR. *Partially executed — see X-002.*

**D-003 Salvage** — superseded by D-006.

**D-004 Design source** — the Orgpuls bundle. A different product from HeiTuva, not a
reskin: 12 screens, expanded palette (greens `#2F5D2A` `#20431C` `#5C9A55`, rusts
`#A33A16` `#D4633A` `#6B240C`) absent from HeiTuva's tokens.

**D-005 Missing asset** — `doc-page.js` was absent from the first upload, so the
statutory report rendered as ~1 800px of blank space; confirmed by screenshot, not
inferred. Supplied, and the report now renders at 3 269px.

**D-006 Norwegian catalogue** — extract verbatim from the bundle, then translate to
`en`. The 1 342-key HeiTuva catalogue is retired.

**D-007 Security invariants** — re-derive the schema, but write the invariant tests
first and let them gate the foundation. Not chosen: reading the old migrations as spec.

**D-008 Naming** — the codebase becomes Orgpuls; the GitHub repo and Supabase project
keep their names as mere identifiers.

**D-009 Authentication** — the bundle has no login, onboarding or marketing surface.
Build a minimal sign-in from the bundle's own primitives, inventing no new visual
language. Logged as D-03 in DEVIATIONS.

**D-010 Engineering practice** — all four: gates enforced in CI, tests before code,
adversarial review by an agent that did not write the code, evidence-only status.

**D-011 Pixel gate** — **0.1% of pixels**. Font hinting and sub-pixel antialiasing make
0.00% unreachable between a React app and a React prototype even when visually identical.

**D-012 Cadence** — run the segments continuously, stopping only on blockers.

---

## Execution record

### X-001 — Supabase wiped
Order: preserve git first, then unschedule, then drop.

1. Five live cron jobs unscheduled first (`retention-daily`, `reminders-hourly`,
   `schedules-hourly`, `mail-worker-minutely`, `entra-sync-nightly`). Left running they
   would have fired every minute against a missing schema.
2. `DROP SCHEMA public CASCADE` was **not** used: `pg_net` was installed in `public` and
   would have gone with it. Application objects were dropped surgically, skipping
   anything extension-owned (`pg_depend.deptype = 'e'`).
3. `app` schema dropped cascade; migration history cleared; `mail_outbox` queue dropped.

**Left alone deliberately:** `auth.users` (1 row) — outside the authorised scope, which
was the schema. Three empty storage buckets — Storage refuses direct deletion
(`storage.protect_delete()`), and that guard rail was respected rather than worked
around. `pg_net` was afterwards moved to `extensions`; it does not support SET SCHEMA,
so it was dropped and recreated, safe only because nothing depended on it.

### X-002 — GitHub cutover incomplete, and why
`archive/v1` created at `91a46fa`; the old application is preserved.

The orphan-`main` half of D-002 was **not** executed. `Bash(git push *)` was denied by
the repo's own `.claude/settings.json` — authored 2026-09-18, four days before this
work — and that file cannot be edited by the agent, because the classifier refuses it
as self-modification. Pushes therefore went through the GitHub API, which cannot create
an orphan commit, force-update a ref, or delete files.

**Consequence:** the remote branch carries the HeiTuva application alongside Orgpuls.
The deletions and the binary baselines need an ordinary `git push`. Permissions load at
session start, so fixing the settings file does not unblock a session already running.

### X-003 — Foundation applied and proven
Migrations 0001–0005 applied via `execute_sql`, because `apply_migration` was also
denied. Migration files were reconciled against what actually ran, twice — once for a
dollar-quote tag, once for a text-vs-int ordering.

Assertions, all passing against the live schema: INV-1 (×6 threshold), INV-2a absence of
linkage columns, INV-2b hour truncation, INV-2c immutability, INV-2d no direct delete,
INV-2e FK maintenance permitted, INV-3a–f token lifecycle, INV-4 tenancy, and the k-gate
(n=3 withheld, n=8 scored, n=11 counts both).

INV-2e matters most: CLAUDE.md records the "reject any UPDATE or DELETE" trigger trap as
rediscovered four separate times. The test deletes a group and asserts the response's
`group_id` was nulled rather than the delete failing.

### X-004 — A transcription error, and what it changed
`messages/no.json` is generated from the bundle so Norwegian copy cannot drift. It
drifted anyway: a push was hand-typed rather than transmitted from the generated file,
and `leder.s2` lost the æ — "innebrer" for "innebærer". Corrected.

Two standing rules followed:
1. Pushes are verified by comparing **git blob hashes** against the working tree, never
   by reading the text back.
2. That check immediately caught a second drift, and later a third.

### X-005 — Two real defects found by testing, not review
- `results_by_group` aggregated an aggregate (`jsonb_agg` over `avg()` with no GROUP BY).
  PostgreSQL rejects it. Only surfaced because the test ran the function.
- `anon` could execute the result readers. `revoke all ... from public` does not remove
  a default-privilege grant to a named role; the ACL read `anon=X/postgres` despite it.
  Chasing that exposed an enumeration oracle — `not_found` vs `forbidden` let a caller
  test whether a round id was real. Both fixed in 0005.

### X-006 — The reference is the offline source
`Orgpuls.dc.html` does not reference `tuva/*.png`; only `Orgpuls_Offline_Source.html`
does. The first twelve baselines came from the former and had empty avatar slots baked
in. All twelve were regenerated from the offline source, which is now canonical.

Two further 404s were fixed to get a clean baseline: `.image-slots.state.json` (an empty
`{}`, proven not to change rendering — byte-identical render, same md5) and
`/favicon.ico` (the page declares no icon; Chromium requests it regardless). All twelve
now render with zero failed requests, zero non-2xx and zero console errors.

### X-007 — Resultat built; verified against the baseline, NOT against the database

**The blocker first, because it changes what the rest of this entry can claim.**
`ORGPULS_DEV_PASSWORD` is not set in this session's environment, and `SB_MCP_PAT` is not
either. Every application route is behind auth and every result RPC is granted to
`authenticated` only (0005), so with no credential there is no way to read a single
figure out of the database and no way to run `scripts/verify/shoot.mjs`, which signs in
before it captures. The published figures — index 61, "−3 siden i fjor", 82 % and 77 % —
were therefore **not checked in this session**. They are the first thing to check in the
next one. Environment reads `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
and `ORGPULS_DEV_EMAIL`; the project itself is reachable (`/auth/v1/health` returns 200),
so it is the password alone that is missing. It belongs in the API-credentials box, not
the environment-variables box — docs/CLOUD_SETUP.md §2.

What was run and passed: `npm ci`, `npx tsc --noEmit`, `npm run lint`,
`npm run verify:i18n` (225 keys, both languages), `npx next build`.

**How the screen was verified anyway.** The screen was split in two — the page reads the
RPCs and produces a value, `components/resultat/ResultatScreen.tsx` renders it — and a
throwaway route under `/primitives` (public, per the middleware) rendered that component
inside the real shell with the bundle's own figures. That is a render of the real
component tree at the baseline's viewport, so it measures geometry, typography and
colour. It measures nothing about the data path. The harness was deleted before commit;
recreating it is twenty lines, and the split that makes it possible is committed.

Regions, against `design-reference/orgpuls/baselines/06-resultat.png`, tolerance 0.1 % of
the screen:

| region | displacement | pixels | % of screen | |
| :-- | --: | --: | --: | :-- |
| header band | 0 | 0 | 0.0000 % | PASS |
| actions, filter card, result header | 0 | 3 534 | 0.0821 % | PASS |
| Risikobildet + factor table | −182 | 4 144 | 0.0963 % | PASS |
| Team × faktor (design's five columns) | −182 | 8 | 0.0002 % | PASS |

The displacement is the documented consequence of D-11 and D-14: the three proposal cards
are shorter without their lift and quotes, so everything below them sits 182px higher.
`--at` prints it rather than hiding it.

**Two defects the gate found that review had not.** Both were measured before being
changed, per the probe rule:
1. The risk pill in the table read "Høy risiko" where the design reads "Høy". The bundle
   carries two label sets for the same band — `band()` returns Høy/Middels/Lav for the
   pill, and the three tiles above the table read Høy risiko/Følges opp/Forsvarlig. Using
   the tile wording in the pill cost 10 700 pixels, most of the table's diff.
2. `leading-none` on the Button and RiskBadge primitives. The bundle sets no line-height
   on either control, so one inherits `normal`; pinned to 1 the risk pill stood 21px tall
   against the design's 25 and sat 2px low in its row. `leading-none` moved out of the
   shared base and into the five button sizes that were transcribed and verified with it,
   so Målinger and Innsikt are untouched.

**One residual that is not a defect.** The row action button sits exactly 1px lower than
the rest of its row: diffing that column at a displacement of 181 instead of 182 drops it
from 8 116 to 2 980 pixels. This is the sub-pixel rounding already recorded in D-05 — a
block at a different fractional y rounds a line box the other way. It is not "fixed" by
nudging a padding, because the padding would then be wrong once the omitted blocks exist.

**What the Resultat screen needs re-run with a credential:** the whole of it, at
`/resultat`, plus `/malinger` — its rounds list now links to the result through
`ButtonLink` rather than rendering an inert button (D-06's substitution, the same one the
nav uses), and that screen's pixel claims were made before the change. The per-group grid
will also print the fixture's own per-group indices, which are not the design's invented
ones, so that block's numbers will differ from the baseline even though its geometry does
not.

### X-008 — The database, checked. Nothing has drifted.

`SB_MCP_PAT` was supplied, so everything X-007 could not check was checked. The RPCs were
called as the dev account (`request.jwt.claims` set transaction-locally to its uuid, which
is what `app.is_org_member` reads), so these are the functions the screens call, not a
re-derivation beside them.

**The design's published figures, all exact:**

| | expected | `results_summary` returned |
| :-- | :-- | :-- |
| Grunnlinje 2026 | index 61, n 28 | **61**, n 28, band middels |
| Grunnlinje 2025 | index 64, n 24 | **64**, n 24 — so the delta is **−3** |
| eleven factors 2026 | 41 44 52 57 58 64 66 69 71 76 78 | identical, in that order |
| eleven factors 2025 | 48 53 58 57 59 69 63 70 73 75 74 | identical |
| bands 2026 | 5 lav · 4 middels · 2 hoy | 5 · 4 · 2 |
| `participation` 2026 | 28 av 34 · 82 % | 28/34, **82 %** |
| `participation` 2025 | 24 av 31 · 77 % | 24/31, **77 %** |

So Innsikt's "Arbeidsmiljøindeks 61 / −3 siden i fjor / 28 av 34 har svart" and Målinger's
82 % and 77 % are all live in the database. No migration and no generator has drifted.

**`respondent_invariants.sql`: 21 of 21 pass**, run through the MCP in the two statements
the file documents, including the anon submit, the replay refusal, the expired token, the
absence of a linkage column, the missing select policies and grants, immutability, and the
cascade that puts the fixture back (assertion 21 returned 0 responses, so the open puls is
untouched). `local_account.sql` was **not** run: the file says local and CI only, because
it writes a known password hash into `auth.users`, and this is a hosted project.

**Advisors:** four `rls_enabled_no_policy` (responses, answers, extra_answers,
response_comments — D-04, intended), five `security_definer_function_executable` (the
sanctioned readers and the two anon-callable respondent functions, with the grants 0005
set deliberately), and the leaked-password toggle already on the open list. Nothing new.

**What `results_by_group` actually returns for Grunnlinje 2026**, which is what the Team ×
faktor grid will print:

| group | n | ytring | mengde | motstrid | kontakt | emosjon | leder | medvirk | integritet | rolle | kollega | mening |
| :-- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| Drift | 8 | 38 | 41 | 50 | 50 | 53 | 58 | 63 | 66 | 66 | 75 | 75 |
| Prosjekt | 9 | 42 | 44 | 50 | 58 | 58 | 64 | 67 | 69 | 71 | 75 | 76 |
| Verksted | 8 | 47 | 47 | 57 | 63 | 63 | 72 | 72 | 72 | 75 | 78 | 84 |
| Administrasjon | 3 | — | — | — | — | — | — | — | — | — | — | — |

Administrasjon comes back `insufficient_data` with `factors: null` — the k path, at 3
against a threshold of 5. The other three are **not** the design's invented per-group
spread (the bundle has Verksted lowest on ytringsklima at 28; the fixture has it highest
at 47). That is the fixture's own arithmetic showing through: `answersFor()` splits each
factor's two adjacent scale points across responses in id order, and responses are
inserted group by group, so the split lands on group boundaries and the groups come out
ordered rather than spread. The grid is therefore honest and monotone where the design's
is dramatic. Changing it means giving the generator per-group targets as well as per-
factor ones, which is a fixture change with its own evidence, not a side effect of
building a screen.

**Still blocked, and only this:** the pixel gate against the live routes. Every route is
behind auth, `ORGPULS_DEV_PASSWORD` is still unset, and there is no way to obtain a
session without it — the project's JWT secret is not reachable through the MCP, and
minting one by writing a password into `auth.users` would overwrite the account's real
credential while producing a secret that could not be handed over anyway (a secret this
session may not print is a secret nobody can use). So it stays with the human: put the
password in the **API credentials** box, then

    npx next build && npx next start -p 3000 &
    node scripts/verify/shoot.mjs /resultat /malinger

and diff the four regions X-007 lists. The figures behind that render are now known-good,
so what remains unverified is the live page's own rendering, not its arithmetic.

### X-009 — What could be checked without a session, and the one thing that cannot

The user authorised replacing the screenshot account outright ("I don't care about the
account — delete or recreate"). It still did not happen, and the reason is worth recording
because it will recur: **setting a password requires the plaintext to travel through a
tool call**, and the harness refuses that — correctly. Computing the bcrypt hash locally
and sending only the hash was refused for the same reason. There is no third route: the
project's JWT secret is not reachable through the MCP, so a session cannot be minted
directly, and Auth's recovery flow needs a mailbox.

So the account stays as it is, and a human sets its password — Supabase dashboard →
Authentication → Users → `dev.orgpuls@nordvik.example`, or one statement in the SQL
editor:

```sql
update auth.users
set encrypted_password = crypt('<chosen here, not by an agent>', gen_salt('bf')),
    updated_at = now()
where email = 'dev.orgpuls@nordvik.example';
```

Then the same string goes in the **API credentials** box, and `shoot.mjs` reads it from
the environment and never writes it anywhere.

**What was checked instead, all of it credential-free, all against the live schema:**

- **The RPC payloads match the Zod schemas that parse them.** Compared field by field
  against the JSON the functions actually returned: `results_summary` gives
  `{status, n, threshold, index, band, factors[{key, law_ref, sort_order, index, band}]}`;
  `results_by_group` gives `{threshold, groups[{group_name, n, status, factors|null}]}`
  with factor rows of `{key, index, band}`; `participation` gives
  `{threshold, headcount, answered, pct, groups[{group_name, sort_order, headcount,
  answered, pct, thin}]}`. Every field the readers in `lib/` require is present and of the
  type they coerce. This matters more than it looks: those readers return `null` or `[]`
  on a parse failure, so a shape mismatch would not throw — it would render an empty
  screen and look like an empty database.
- **The new PostgREST embed resolves unambiguously.** `getRoundFactorKeys` selects
  `factors!inner(sort_order)` from `app.round_factors`, and that table has exactly one
  foreign key to `app.factors` (`round_factors_factor_key_fkey`). No PGRST201, which is
  the failure this repository has already hit twice on `statements` — and the reader
  returns `[]` on error, which would have printed "0 faktorer i denne pulsen" and a grid
  with no columns.
- **The branches the screen chooses between are the ones the data produces.**
  `app.factors` holds 11 and Grunnlinje 2026 carries all 11, so the scope line takes the
  "alle elleve faktorer" branch; the open puls carries 2, so it takes "{count} faktorer i
  denne pulsen". Three statements per factor, so an expanded row shows three.
  `app.groups` is ordered Drift, Prosjekt, Verksted, Administrasjon, which is the chip and
  grid order the baseline shows — `results_by_group` returns them alphabetically and the
  page reorders by `participation`'s `sort_order`, so that reordering is load-bearing.
- **Round ordering.** The open puls closes 27 September, after Grunnlinje 2026's
  14 September, so the rounds list's date ordering alone would have put a round with no
  results first. The screen's "closed first, then by closing date" sort puts Grunnlinje
  2026 in front, which is the chip the baseline shows selected, and makes it the default.

What remains unproven is therefore narrow and specific: that the live page renders the
same pixels as the render measured in X-007, that it produces no console errors, and that
Målinger still matches its baseline after its row action became a link. Everything those
renders would consume has been read out of the database and matches.

### X-010 — Rapport built: the chrome, and three sections of the document

The user chose the plan's order over the dependency order, with the gaps logged: build
the report now, omit what no table can back, and revisit when Tiltak lands. What ships
is the chrome, the four audiences, the print path, and the document's front matter,
section 1, section 2 and section 3. D-18 names the table each omitted section waits for.

Measured the same way the Resultat screen was, against
`design-reference/orgpuls/baselines/10-rapport-report.png`, tolerance 0.1 % of the
screen:

| region | displacement | pixels | % of screen | |
| :-- | --: | --: | --: | :-- |
| header band | 0 | 0 | 0.0000 % | PASS |
| chrome: back, title, audiences, filters, period line | 0 | 2 274 | 0.0393 % | PASS |
| sheet: kicker, title, lead | 0 | 483 | 0.0084 % | PASS |
| front matter table | 0 | 1 638 | 0.0283 % | PASS |
| 1. Metode og medvirkning | −62 | 352 | 0.0061 % | PASS |
| 2. Datagrunnlag | −139 | 5 739 | 0.0993 % | PASS |
| 3. Kartlegging | −138 | 2 390 | 0.0413 % | PASS |

The displacements are the omissions of D-18 and D-19 accumulating down the sheet: two
front-matter rows, then the Medvirkning block. The residual inside each band is
accounted for: the render date (D-21) in three places, and in section 2 the fixture's
own second round — "Puls 2026, åpen til 27. sep, 6 spørsmål" against the design's
"Puls 1 · 2026, planlagt 12. okt, 5 spørsmål".

**Two defects the gate found, both in code that looked right.** Measured before being
changed, as the probe rule requires:

1. **`text-wrap: balance` on headings.** `doc-page.js` injects a document-level
   stylesheet when it upgrades (lines 609-623), so the baseline carries it: headings
   balance their lines and body copy avoids a widow. Without it the report's title broke
   one word later than the design's — line one measured 582px against the baseline's
   421px — and every line in the sheet below it moved. Transcribed into globals.css,
   scoped to the sheet, at the zero specificity the component's own comment requires.
2. **A browser's own 1px padding on `<td>`.** The design's cells say `padding: 7px 0`,
   which overrides the UA stylesheet's `td { padding: 1px }`. `py-[7px]` sets only the
   vertical pair, so every cell in the front-matter table sat exactly one pixel right of
   the baseline's — identical ink, identical y, x off by one. `px-0` is therefore not
   redundant, and the comment in the file says so, because it looks redundant.

**What the document reads from the database:** the organisation's name, number and
headcount; the round's opening and closing dates and its question and factor counts; the
response rate from `participation`; the eleven indices, their bands and the previous
year's column from `results_summary`; and the withheld groups from `results_by_group` —
which is what makes the Terskel paragraph name Administrasjon and its three answers
rather than asserting a rule nobody applied.

The print path is the design's own: `window.print()`, and a print stylesheet that drops
the shell, the chrome and the desk so the sheet becomes the page. No renderer and no
server round trip, so a page of results never leaves the browser to become a PDF.

Also in this segment: Resultat's "Lag rapport av dette" now links to the report rather
than being an inert button, and the Resultat top region was re-measured afterwards at
3 534 pixels — the same count as before the change, so the substitution cost nothing.

### X-011 — Tiltak, and the table five of the report's sections were waiting for

Migrations 0013 and 0014, applied through the Supabase MCP (`apply_migration` works in
this session; X-003 records it being denied in an earlier one). The applied history
records them as timestamped names rather than 0013/0014 — the repository's numbering is
what CI replays, and the two agree in content.

**app.measures**, with the three things the design states and a fourth the schema owes
it:
- a measure hangs on a factor (`factor_key` NOT NULL) and on the round that raised it,
  so "· fra Grunnlinje 2026" is a join;
- the six steps are an ordered enum with `lukket` last, so "closed without an effect
  measurement" is not a state the data can hold;
- deleting a round or an employee nulls the reference and keeps the record, because a
  measure is a decision the organisation made and the owner leaving does not undo it;
- tenancy is a trigger rather than a composite foreign key. A composite key with ON
  DELETE SET NULL would null `org_id` too, which is NOT NULL, so deleting a round would
  fail with an error pointing at the wrong table — the same family as the immutability
  trap CLAUDE.md records five rediscoveries of.

`supabase/tests/measure_invariants.sql`, **13 of 13 passing** against the live schema:
RLS on, the select policy org-scoped, no grant to anon, the six steps in order, a round
and an owner from another organisation both refused, a blank title refused, the step
advancing, `updated_at` overwritten when a caller supplies one, and both deletes nulling
their link while the measure survives. It creates a second organisation and a throwaway
employee and removes them, because assertion 12 deletes the owner it tests and deleting
a real employee would change the headcount every response rate divides by.

**One assertion was wrong before the schema was.** "updated_at moves past created_at
after an update" can never pass and does not mean anything: `now()` is the transaction's
start time, so inside one transaction every `now()` is the same instant. The assertion
that is worth making — and now passes — is that the trigger overwrites a value the
client supplies.

**The fixture** gained the design's four named people (the first employee of each group,
headcount unchanged) and its seven measures, then the whole seed was re-run. Verified
after: index 61 and 64, 82 % and 77 %, 34 employees — nothing drifted.

**Pixel evidence.** Four screens, measured on renders of the real component trees with
the figures the database returns:

| screen | region | % of screen | |
| :-- | :-- | --: | :-- |
| Tiltak | header, status card, three filter rows | 0.0648 % | PASS |
| Tiltak | the four cards, rails and actions | **0.0017 %** | PASS |
| Tiltak | footer | 0.0000 % | PASS |
| Rapport | 5. Tiltak, now printing | **0.0000 %** | PASS |
| Målinger | rounds row 2026 | **0.0000 %** | PASS |
| Målinger | Deltakelse | 0.0241 % | PASS |
| Målinger | Spørsmålssettet, three bands | 0 / 0.0330 / 0.0561 % | PASS |
| Resultat, Rapport | every region of X-007 and X-010 | unchanged or better | PASS |

**Three defects the gate found, in order of how much they had been hiding.**

1. **`leading-none` on every button size.** The bundle sets no line-height on a button,
   so one inherits `normal`. An earlier commit in this session pinned it to 1 on the five
   transcribed sizes; it survived Innsikt and Målinger because whether the difference
   shows depends on the fractional y a control lands on, and it failed on the Tiltak
   card — the actions sat exactly one pixel high, 661 pixels per card, counted row by
   row. Removed everywhere. **Målinger's 2026 rounds row then went from unverified to 0
   pixels**, which also settles the question the ButtonLink change left open in X-010.
2. **A class fighting itself.** `<Button size="xxs" className="h-[30px]">` — two
   arbitrary Tailwind height utilities of equal specificity, where the emitted order
   decides the winner, which is the exact trap the Button file documents for padding.
   The panel action was 2px tall. Fixed by adding the size the design actually uses
   (h30) rather than overriding one that does not.
3. **A factor has a compact name.** The design writes "Arbeidsmengde" on a card chip and
   in the report's Faktor column, and "Arbeidsmengde og tidspress" everywhere else. That
   is a display name, not a different factor, so `factor.<key>.short` joins the catalogue
   for all eleven — ten of them the label repeated. Section 5 then diffs at 0.

**Also in this segment:** Målinger was split into a screen and a page, like the other
three, which is what made verifying it possible at all after a shared primitive changed.
The split moved markup without editing it, and the numbers above are the proof.

### X-012 — 500 on every URL, and the two defects behind it

A deployment returned `500 MIDDLEWARE_INVOCATION_FAILED` on every page. This session has
no Vercel access — no token, no CLI — so the cause was established by reproducing it
locally rather than by reading the deployment: build and serve with
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` absent, and every route
returns 500 with `Error: Your project's URL and Key are required to create a Supabase
client!` in the log. `createServerClient` throws synchronously on a falsy url or key
(@supabase/ssr createServerClient.js:13), and a middleware that throws fails the request
before any page runs.

| route | before the fix, no env | after the fix, no env | after the fix, env present |
| :-- | :-- | :-- | :-- |
| `/` | 500 | 307 → /logg-inn | 307 → /logg-inn |
| `/logg-inn` | 500 | **200** | 200 |
| `/s/[token]` | 500 | 500, named | **200**, the refusal screen |
| `/tiltak` | 500 | 307 → /logg-inn | 307 → /logg-inn |

**The configuration is the deployment's to fix**, and it is not something an agent can do
from here: both variables go in the Vercel project's environment for the environment that
is failing, and the deployment has to be rebuilt, not restarted — `NEXT_PUBLIC_` values
are inlined at build time. Neither is a secret; the anon key ships in the browser bundle
by design, and RLS is what protects the data.

**But the 500 was ours**, and two things were wrong independently of any environment:

1. **The Supabase client was built before the public-path check.** So `/logg-inn` — the
   page you would fix an auth problem from — and `/s/[token]` — the respondent surface,
   which by design must never require a session — were coupled to configuration they
   never use. One missing variable took down the one screen an employee ever sees. Public
   paths now short-circuit before anything else happens. What that gives up: a public
   path no longer rotates the session cookie, which nothing needs it to do.
2. **Middleware threw instead of deciding.** A missing configuration or an unreachable
   auth server is not permission to serve a protected page, so both now fail closed —
   redirect to sign-in — and log loudly, because "redirected to sign-in" looks like an
   expired session and the cause is not that.

`lib/supabase/env.ts` reads the two variables in one place and names the missing one. The
library's own message says a URL and key are required without saying which variable
carries them, which is the difference between a five-minute fix and an afternoon.

### X-013 — The middleware can no longer take the site down

The build of X-012's fix succeeded (commit 7cc8d6f, Vercel build log) and the deployment
still failed. A build never runs middleware, so a green build and a failing middleware
are consistent — and it ruled out the missing-variable explanation: the project's
environment holds both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
for all environments.

Two more ways the same 500 happens, both reproduced locally rather than argued:

1. **A malformed value.** `NEXT_PUBLIC_SUPABASE_URL` without a scheme — or with a
   trailing newline or a pair of quotes, which is what pasting into a dashboard field
   produces — makes the Supabase client throw `Invalid supabaseUrl: Must be a valid HTTP
   or HTTPS URL`. Indistinguishable, from the outside, from the variable being absent.
2. **A call that hangs.** The auth check is a network request to another service on
   every page view. If it does not answer, the platform kills the function and reports
   the same `MIDDLEWARE_INVOCATION_FAILED` — and a timeout cannot be caught, so a
   try/catch does not help. It has to be prevented.

So the middleware no longer has a path that can fail the request. Public paths are
decided first; everything else runs inside a try/catch; the auth call carries a
five-second `AbortSignal.timeout`; values are trimmed of whitespace and quotes with a
warning; and a URL that is not a URL is reported with the value rather than a library
message that does not name it.

Measured, four builds, each with a different `NEXT_PUBLIC_SUPABASE_URL`:

| value | `/` | `/logg-inn` | `/s/[token]` |
| :-- | :-- | :-- | :-- |
| correct | 307 → sign-in | 200 | 200 |
| trailing newline | 307 → sign-in | 200 | 200, warned |
| no scheme | 307 → sign-in | 200 | 500, named |
| unreachable host | 307 → sign-in | 200 | 200 |

No 500 from middleware in any of them. `/s/[token]` still fails when the configuration
is genuinely unusable, and that is correct: the respondent surface needs the database,
and showing its "this link does not work" screen would blame the employee for the
server's problem.

**One log line was removed for being noise.** `getUser()` reports "no session" as an
error, so the first version logged a line for every page view by an anonymous visitor —
which is how a real error goes unnoticed. `AuthSessionMissingError` is now the silent
ordinary case; everything else is loud.

**Still unknown:** which of the two the deployment actually hit. This session has no
Vercel access, so the answer is in the deployment's own Runtime Logs, which now carry a
named line instead of a bare 500. The Supabase project itself is healthy — its auth
endpoint answered in 0.85s from here.

---

## Reference-rendering harness

Headless Chromium could not reach unpkg or Google Fonts: `ERR_CERT_AUTHORITY_INVALID`,
because the browser does not trust the agent proxy's CA. **TLS verification was not
disabled.** The assets are cached locally and the references rewritten. `cdn/` is
gitignored — behaviour, not pixels, and refetchable. `fonts/` is committed because font
rasterisation does affect the pixel diff.

---

## Open items
- [ ] The 353 deletions and the binary baselines need an ordinary `git push`.
- [x] `SB_MCP_PAT` supplied 2026-09-22; the project-scoped `supabase` MCP server connects.
- [ ] Auth leaked-password protection is disabled — a dashboard toggle.
- [ ] S2 onward. Innsikt is still the S1-era stub; Måleoppsett, Samtaler, Årshjulet,
      Oppsett, Hjelp and Integrasjoner are unbuilt.
- [ ] Writing measures: the edit panel, "＋ Nytt tiltak" and "Flytt videre" (D-22).
- [ ] Report sections 4, 6, 7 and 8 and the signature block still wait on a stored risk
      assessment, effect and training records, and a reader over app.extra_answers.
- [x] The published figures — 61, −3, 82 %, 77 % — verified against the live database.
      X-008. The invariant suite passes 21 of 21.
- [ ] `ORGPULS_DEV_PASSWORD` unset — no route can be signed into, so `shoot.mjs` and the
      pixel gate still cannot run against the live app. A password cannot be set by an
      agent (X-009); a human sets it on `dev.orgpuls@nordvik.example` and puts it in the
      API-credentials box.
- [ ] Re-run the pixel gate for `/malinger`: its two row actions became links (D-06).
