# Step 0 findings — industry modules and pages

Written before building, as `bransjesider-og-tilleggsmoduler.md` § 1 asks. It records where
things live today, the mapping chosen for modules, and where the hand-off's text had to be
adapted to this repository. Decisions are logged as D-111 onwards in `docs/DEVIATIONS.md`.

## 1. Where things live

**Schema.** Everything is in the `app` schema, not `public`. Client-callable functions are in
`public` as SECURITY DEFINER wrappers. Roles are checked with `app.is_org_member`,
`app.has_role(org, roles)` and, for platform admins, `app.is_platform_admin(roles)`, which
requires aal2. Audited admin writes call `app.admin_log(action, …)`.

| Hand-off concept | Here | Notes |
| --- | --- | --- |
| Core question set (11 × 3) | `app.factors`, `app.statements` (0002) | Data, not code. Wording is in i18n under `factor.<key>.*`, not in the rows. The key must match `^[a-z]+$`. |
| Questions outside the index | `app.extra_questions`, `app.extra_options` (0007, 0009) | `krenkende` and `vold` carry `org_only`, which is a policy flag: their answers are in `app.extra_answers`, which hangs off a response and so off a group. |
| Survey (måling) | `app.measurements` (grunnlinje or puls, per year) | |
| Survey instance | `app.rounds` (`planlagt` → `apen` → `lukket`) | Results are read for closed rounds only (0042). |
| Which factors a round asks | `app.round_factors` | A grunnlinje asks every factor. A puls asks the factors with an open measure (`wheel_tick`, `start_next_pulse`). |
| Pulses | `app.start_next_pulse_unchecked` (0038, wrapped in 0052), `app.wheel_tick` | |
| Respondents and invitations | `app.employees`, `app.invitations` (token stored as SHA-256), `app.outbox`, dispatcher edge function | E-mail, SMS and link. |
| Answers | `app.responses` (group and an hour, no link to anyone), `app.answers` (`factor_key`, `ordinal`, `value`), `app.extra_answers`, `app.response_comments` | RLS on, no policy, no grant. Append-only triggers allow the cascade. |
| One write path | `public.submit_response(token, answers, extra)` (latest in 0042) | Never returns the row id. |
| Groups and threshold | `app.groups`; `organizations.threshold`; `app.k_threshold(org) = greatest(threshold, app.k_min())`; `app.k_min()` returns 5 | |
| Differencing protection | `app.group_release` (round-level complementary suppression, 0034 and 0042); `app.cell_release` (per statement and group, counted by answers, 0042 and 0045) | Every results reader draws from these. |
| Actions (tiltak) | `app.measures` (`factor_key` FK to `app.factors`, owner, `due_date`, `step`, `playbook_key ~ '^[a-z]+\.[1-3]$'`) and `app.measure_groups` | Playbook suggestions are a TS registry (`lib/playbook/registry.ts`) with i18n. |
| Scoring | `app.to_index` (1..5 → 0..100), `app.risk_band`; `results_summary`, `results_by_group`, `results_items`, `results_workspace`, `results_digest` | A factor's index is `round(avg(to_index(value)))` over its answers. Bands are ≥65, 50–64 and <50. |
| Reports | `/rapport` (`components/rapport/*`, `lib/report/*`), printed to PDF by the browser | |

**Marketing.**
- `/bygg-og-anlegg` and `/helse-og-omsorg` are `LandingTemplate` pages whose words are messages (`seo.lp.*`, in `no` and `en`). The site registry is `lib/marketing/site.ts`.
- `/bruksomrader` is a page of its own.
- The sitemap is `app/sitemap.ts`; metadata comes from `lib/marketing/meta.ts#pageMeta`.
- JSON-LD comes from `lib/marketing/schema.ts`: `breadcrumbs`, `faqPage` and `graph`.
- The start form is `components/marketing/SignupStart.tsx`: GET `/registrer?orgnr=`, with a nine-digit check only.
- `en.orgpuls.com` is the same app. The host sets the locale (`lib/hosts.ts`), there is no locale routing, and the same routes render English from `messages/en.json`.

**Brønnøysund.** `lib/brreg/lookup.ts` reads `naeringskode1.kode` into `naceCode`, stored as `app.organizations.registry_nace_code`. The mod-11 check digit is already there (`hasValidCheckDigit`).

## 2. The mapping chosen

The core set is already a registry (`app.factors` and `app.statements`), so § 1.4 says to
extend it rather than build parallel tables. We checked that option against every reader and
did **not** take it. Adding module factors as rows of `app.factors` would put them into:
- the organisation index (`results_summary` averages every factor with answers);
- the heatmap, the item list, importance and comment themes;
- grunnlinje round creation (`wheel_tick` and `plan_first_round` insert every `app.factors` row);
- Måleoppsett's factor list, the Veiviser's question count, the report's "11 factors" paragraph, and the playbook test.

About twenty readers, most behind the pixel gate, would each need a filter, and the index the
design prints (61) would move the first time a customer answered a module. The index is
comparable from year to year and with the benchmark only if it stays the eleven QPS factors.

So a module lives beside the core instrument. It shares the same response row and the same
release rules, and changes none of the readers of `app.factors`:

| Spec (A3) | Here (0067) |
| --- | --- |
| `question_modules`, `module_factors`, `module_items`, `module_action_suggestions`, `module_sources` | Same names, in `app`. Draft → published → retired. Published content is immutable. |
| `survey_modules(survey_id, …, enabled_factor_keys)` | `app.round_modules(round_id, module_id, item_ids, include_count_items, include_segments)`. A survey is a round. The row names the exact statements asked, as `round_factors` does, so a puls can ask only re-measure statements. It is fixed once the round opens. |
| Likert answers "stored as core answers" | `app.module_answers(response_id, item_id, value)`, hanging off `app.responses` exactly as `app.answers` does. Same RLS (no policy, no grant). |
| Segment answers | `app.module_segment_answers(response_id, item_id, option_ordinal)`, as above. |
| `org_count_answers` | `app.org_count_answers(id, round_id, item_id, answer, answered_on date)`. There is no response, group, segment or timestamp, so a per-group report is impossible by construction. This is stricter than the core `org_only` questions, which are policy. |

**The stop condition in § 1.5 does not apply.** Storing count-only answers without a group
needs a new table and a second insert in the same transaction as `submit_response`. It is not
a refactor of how answers are stored.

**Release.** A module factor's cells are decided by the same rule as a core factor's:
- `app.group_release` for the round (shared, since the response rows are the same);
- per statement and group, k counted over the people who answered it;
- complementary suppression;
- a factor released only where all three statements are.

That arrives with the results work (PR 4), with a test showing that module cells release
exactly as core cells do for the same answers.

**One more rule than the hand-off states.** `get_count_item_totals` answers for closed rounds
only, like every other results reader since 0042. If it answered for an open round, two reads
a minute apart would difference one person's yes or no.

## 3. Adaptations of the hand-off to this repository

| Hand-off | Here | Why |
| --- | --- | --- |
| pnpm, shadcn/ui, `src/` | npm; the site's own components; `lib/`, `components/`, `app/` at the root | The fixed stack (CLAUDE.md). |
| SQL in `public` | Tables in `app`; client functions in `public` | Project convention. |
| `is_platform_admin()` | `app.is_platform_admin(array[...]::app.platform_role[])` | Roles and aal2. |
| `pnpm modules:seed` writes to the database | `npm run -s modules:seed > seed.sql`, then `psql`. The SQL calls `app.module_seed(json, hash)`. | The same pattern as the design fixture. The mapping from file to rows is versioned in the migration. |
| Publish in production after sign-off | `npm run -s modules:publish <key> <version>`, or the admin's audited Publish button | Not run until Tor signs off the open decisions. |
| UI copy only in bokmål | Module wording (statements, factors, suggestions) is bokmål in the registry, as the spec's locale map says. Product UI around it (headings, buttons) goes through next-intl in `no` and `en`, because CLAUDE.md requires every UI string in both. | Where they conflict, CLAUDE.md wins. |
