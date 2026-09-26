# Industry pages and survey modules – implementation instructions

Audience: Claude Code (and the developer reviewing its PRs).
Scope: (A) industry-specific question modules that extend the main survey, starting with **Bygg og anlegg v1.0.0**, and (B) data-driven industry pages ("bransjesider") with a generated question-set page, starting with `/bygg-og-anlegg` and `/bygg-og-anlegg/sporsmal`.
Out of scope: engagement features from the gamification report, English locale, new industry modules beyond construction.

## Files in this hand-off

| Path | Online version | What it is |
| --- | --- | --- |
| `docs/implementation/bransjesider-og-tilleggsmoduler.md` | This page | This file |
| `modules/bygg-og-anlegg/v1.json` | [Module JSON](https://claude.ai/artifact/U57K6e2AAgkUYQrEsrTrGk) | The construction module: 8 factors × 3 statements, 2 count-only items, 2 segment questions, 24 action suggestions, sources. **Single source of truth** for both the survey and the website |
| `docs/reference/bygg-og-anlegg.html` | [Industry page](https://claude.ai/artifact/EVTZsJamzejrwDefvc7MAC) | Visual and copy reference for the industry page |
| `docs/reference/bygg-og-anlegg-sporsmal.html` | [Question-set page](https://claude.ai/artifact/WJrtoV7aRJ1cy2xEK7tZmT) | Visual and copy reference for the question-set page |

Related specs: [Platform admin specification](https://claude.ai/code/artifact/299692f9-4524-4966-8286-d79980fc2dbb) (roles, `is_platform_admin()`, content management, audit log) and [Competitor pricing comparison](https://claude.ai/code/artifact/ac6223a5-741f-4f83-a2a6-eba186909814).

The online versions are private claude.ai links; share them from claude.ai before sending them to anyone else. The repo files are the ones Claude Code should read.

The reference HTML files are specs, not code to copy. Use the site's existing layout, header, footer, tokens and components.

---

## 0. Ground rules

1. **Stack as-is:** Next.js (App Router), TypeScript, Tailwind, shadcn/ui, Supabase, Vercel, EU region. Do not add new frameworks.
2. **Data, not code.** Question content, factors, action suggestions, industry-page copy and sources live in data (JSON/TS content files and Supabase rows). Components render data; they never hard-code statements.
3. **One source per statement.** Every statement shown on the website must be read from `modules/*/v*.json` by its item code. A missing code fails the build.
4. **Anonymity invariants (must never regress):**
   - Nothing is shown for a group, segment or combination with fewer than `max(5, org_threshold)` responses. The threshold can be raised, never lowered.
   - Count-only items are reported for the whole organisation only. They are stored without group or segment keys, so group-level reporting is impossible by construction, not just by policy.
   - Existing differencing protection applies to module factors and to segment filters.
   - No per-respondent identifiers in module data. No timestamps finer than a day on count-only answers.
5. **RLS on every new table.** Registry tables are world-readable when published and writable only by platform admins or the service role (seed script).
6. **Published module versions are immutable.** Changing wording means publishing a new version.
7. **Copy may only claim shipped features.** Page blocks that describe optional features (factor toggles, segments, languages) are gated by feature flags and hidden until the feature exists.
8. **UI language is Norwegian bokmål.** Code, comments, table names and commit messages in English.

---

## 1. Step 0 – Discover before building

Do this first and write the findings to `docs/implementation/step0-findings.md` in the same PR as step 2.

1. List the Supabase schema (`public` and any survey schema). Identify where these live today:
   - the core question set (11 factors × 3 statements) – tables or hard-coded?
   - surveys (målinger), survey instances, pulses
   - respondents and invitations (email/SMS/QR)
   - answers and how they link to respondent, group and survey
   - groups (departments/teams), threshold settings, differencing protection
   - actions (tiltak) with owner, deadline and linked factor
   - scoring functions/views (0–100 index, risk bands 65/50)
   - report generation (AMU, Arbeidstilsynet)
2. Find the marketing routes: `/bygg-og-anlegg`, `/helse-og-omsorg`, `/bruksomrader`, sitemap, metadata helpers, the org-nr start form (GET `/registrer?orgnr=`), and how `en.orgpuls.com` is served.
3. Find the Brønnøysund integration and which field holds the business's industry code (`naeringskode1.kode`).
4. Decide the mapping:
   - **If the core question set is hard-coded,** first extract it into the registry tables below as module `core` v1 (same wording, same codes if any), and switch the survey runtime to read from the registry. Only then add construction.
   - **If a registry already exists,** extend it with the fields below instead of creating parallel tables.
5. Stop and ask if answers are stored in a way that makes group-free storage of count-only items impossible without a larger refactor.

---

## Part A – Survey modules

### A1. Concepts

| Concept | Meaning |
| --- | --- |
| Module | Versioned bundle of factors and items, e.g. `core@1.x`, `bygg-og-anlegg@1.0.0` |
| Factor | Three likert5 statements scored as one 0–100 index |
| Item | A statement or question. Kinds: `likert5` (belongs to a factor), `count` (org-level yes/no/don't know), `segment` (optional background question used as a filter) |
| Action suggestion | Workshop / routine / leadership practice per factor, with the item used to re-measure it |
| Survey module | A module enabled on one survey instance, with the enabled factor keys |

### A2. Module file format and validation

Create `src/lib/modules/schema.ts` with a zod schema matching `modules/bygg-og-anlegg/v1.json` and these refinements:

- `module_id` is kebab-case; `version` is semver.
- Each factor has exactly 3 items; item codes are unique within the module and match `^[A-Z]{2}-[A-Z]{2}-[1-3]$` for factor items and `^[A-Z]{2}-T-[0-9]+$` for count items.
- Each action suggestion's `remeasure_item` is one of the same factor's item codes.
- `anonymity.min_responses >= 5` and `can_lower === false`.
- Every `rationale_sources` key exists in `sources`.
- Scale labels have length 5 and `to_index` maps 1..5 to 0/25/50/75/100.

Add `pnpm modules:validate` that validates every file under `modules/**/v*.json` and runs in CI.

Recommended before publishing v1.0.0 (see open decisions): add a "Vil ikke svare" option to both segment questions.

### A3. Database

Adapt names to Step 0 findings. Timestamp the migration file as usual.

```sql
create type module_status as enum ('draft','published','retired');
create type module_item_kind as enum ('likert5','count','segment');
create type module_report_scope as enum ('group','organisation_only','segment_filter');

create table question_modules (
  id uuid primary key default gen_random_uuid(),
  key text not null,                         -- 'bygg-og-anlegg', 'core'
  version text not null,                     -- '1.0.0'
  name text not null,
  industry_key text,                         -- null for core
  status module_status not null default 'draft',
  estimated_minutes int not null,
  scale jsonb not null,
  scoring jsonb not null,
  anonymity jsonb not null,
  content_hash text not null,                -- sha256 of the canonical JSON
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (key, version)
);

create table module_factors (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references question_modules(id) on delete cascade,
  key text not null,
  name text not null,
  summary text not null,
  rationale text not null,
  rationale_sources text[] not null default '{}',
  legal_basis text[] not null default '{}',
  sort int not null,
  unique (module_id, key)
);

create table module_items (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references question_modules(id) on delete cascade,
  factor_id uuid references module_factors(id) on delete cascade,
  code text not null,
  kind module_item_kind not null,
  text jsonb not null,                       -- {"nb": "..."}; more locales later
  options jsonb,                             -- for count/segment
  reverse boolean not null default false,
  pulse_eligible boolean not null default false,
  report_scope module_report_scope not null,
  sort int not null,
  unique (module_id, code),
  check ((kind = 'likert5') = (factor_id is not null)),
  check (kind <> 'count' or report_scope = 'organisation_only')
);

create table module_action_suggestions (
  id uuid primary key default gen_random_uuid(),
  factor_id uuid not null references module_factors(id) on delete cascade,
  type text not null check (type in ('workshop','rutine','lederpraksis')),
  title text not null,
  description text not null,
  remeasure_item_id uuid not null references module_items(id),
  sort int not null
);

create table module_sources (
  module_id uuid not null references question_modules(id) on delete cascade,
  key text not null,
  title text not null,
  url text not null,
  primary key (module_id, key)
);

-- Which modules a survey uses, and which factors are switched on
create table survey_modules (
  survey_id uuid not null references surveys(id) on delete cascade,   -- adapt to real table
  module_id uuid not null references question_modules(id),
  enabled_factor_keys text[] not null,
  include_count_items boolean not null default true,
  include_segments boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (survey_id, module_id)
);

-- Count-only answers: deliberately no respondent, group, segment or fine timestamp
create table org_count_answers (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete cascade,
  item_id uuid not null references module_items(id),
  answer text not null check (answer in ('ja','nei','vet_ikke')),
  answered_on date not null default current_date
);
```

Segment answers are stored with the respondent's other answers (they are filters), using whatever structure Step 0 found for core answers.

**Immutability trigger** on `module_factors`, `module_items`, `module_action_suggestions` and `module_sources`: raise `published module is immutable; create a new version` on insert/update/delete when the parent module's status is `published` or `retired`. On `question_modules`, allow only `status` `published → retired` once published.

**RLS**

- `question_modules`: select for `anon` and `authenticated` where `status in ('published','retired')`; insert/update only for platform admins (`is_platform_admin()` from the admin spec) or service role.
- Child registry tables: select via `exists` on a published parent; same write rule.
- `survey_modules`: same org-scoped policies as `surveys`.
- `org_count_answers`: no select for any client role. Insert only through the respondent RPC. Reads only through the reporting function in A7.

### A4. Seeding and publishing

`scripts/modules/seed.ts` (run with `pnpm modules:seed <path>`):

1. Validate with the zod schema.
2. Compute `content_hash` over canonical JSON (sorted keys).
3. If `(key, version)` exists and is published with a different hash, fail. If it has the same hash, no-op.
4. Upsert as `draft` in one transaction: module → sources → factors → items → action suggestions. Map JSON fields:
   - Factor items: `kind='likert5'`, `report_scope='group'`, `pulse_eligible` from JSON, `text={"nb": text}`.
   - `count_items`: `kind='count'`, `report_scope='organisation_only'`, `factor_id=null`.
   - `segments`: `kind='segment'`, `report_scope='segment_filter'`, code `BA-S-<id>`.
5. `pnpm modules:publish bygg-og-anlegg 1.0.0` sets `status='published'`, `published_at=now()`.

Run seed in CI against a Supabase branch. Run publish manually in production after sign-off on the open decisions.

### A5. Enabling a module on a survey

In the survey creation flow (where the date and recipients are chosen):

- Add a step or section **"Bransjemodul"** listing published modules.
- **Suggest automatically** when the org's industry code from Brønnøysund starts with a prefix in the industry registry. For construction: `41`, `42`, `43`. For health and care: `86`, `87`, `88`. Store the prefixes in the industry content file (B2), not in code.
- Show: module name, "24 påstander, ca. 3 minutter ekstra", a link to the public question page, and a toggle to include count-only items.
- **Factor toggles** (behind flag `module_factor_toggles`): one checkbox per factor, all on by default. At least one factor must stay on.
- **Segments** (behind flag `module_segments`): off by default.
- Persist to `survey_modules`. A published survey's module selection is locked. Changes apply to the next survey.
- Pulses do not include a module by default. They include module items only through the action re-measurement rule in A9.

Copy, bokmål:

- Section title: "Bransjemodul"
- Suggestion: "Virksomheten er registrert i bygg og anlegg. Vil dere ta med bygg-modulen?"
- Helper: "Kommer i tillegg til hovedundersøkelsen. Svarene vises med samme terskel på fem."

### A6. Respondent flow

- **Order:** core items (existing randomisation) → module likert items (randomised within the module block) → count-only items → segment questions (only if enabled; last, optional).
- **Time estimate** in the invitation and intro screen: core estimate + `estimated_minutes`, e.g. "ca. 7 minutter".
- **Progress bar** covers all blocks.
- **Count-only items:** heading "To korte spørsmål som bare telles for hele virksomheten". Radio buttons with the options from JSON.
- **Segment questions:** heading "Frivillig: brukes bare til å sammenligne grupper med minst fem svar".
- **Submission:** extend the existing submit RPC. Write likert and segment answers as core answers. Write count-only answers to `org_count_answers` **without** any respondent, group or segment reference. Use the same transaction; generate ids with `gen_random_uuid()`.
- SMS, QR and link flows need no changes beyond the time estimate.

### A7. Scoring and reporting

Extend the existing scoring functions; do not fork them.

- **Factor index:** unchanged. Each item 1–5 → 0/25/50/75/100; the factor is the mean of its three items. Risk bands: ≥65 low, 50–64 medium, <50 high.
- **Factor scores per group:** module factors appear alongside core factors, subject to the same threshold and differencing rules. Factors not enabled for the survey are omitted, not zero.
- **Count-only items:** `get_count_item_totals(p_survey_id uuid)` returns, per item: `n_total`, `n_ja`, `n_nei`, `n_vet_ikke`. It returns nothing for an item if `n_total < max(5, org_threshold)`. The function has **no group or segment parameter**. Security definer; callable only by roles that can see the survey's organisation-level results.
- **Segment filters:** a filter is offered only when the segment value has `n ≥ threshold` at organisation level. When combined with a group, require:
  - n for (group ∩ segment) ≥ threshold, **and**
  - n for (group ∖ segment) ≥ threshold, so the complement can't be derived.
- **Comments:** unchanged. Module factors can collect comments if core factors do, with the same five-writer rule.

### A8. Results UI

- Module factors appear in the factor list with a small label showing the module name ("Bygg og anlegg"). Same colours and bands as core factors.
- On the factor detail view, show the module's `summary`, `rationale` with source links, and `legal_basis`.
- New card **"Telles for hele virksomheten"**: one row per count item with a horizontal stacked bar and the counts. If suppressed: "Vises når minst fem har svart."
- Segment filter chips (flag `module_segments`) appear only when allowed by A7. Disabled chips show the tooltip "For få svar til å vises".
- The positive-first summary ("Det folk er mest fornøyd med") includes module factors.

### A9. Actions and pulse

- For a module factor, the action picker shows the three `module_action_suggestions` in the order workshop, rutine, lederpraksis, with title, description and "Måles på nytt med: <statement text>".
- Creating an action stores the factor reference and the `remeasure_item_id`.
- **Pulse:** when a pulse is created, include the re-measure item of every open action (core or module). A module factor drops out of pulses when it has no open actions. This matches the existing rule for core factors.
- Action lifecycle, owners, deadlines and the "lukket over X" rule are unchanged.

### A10. Reports

- **AMU and Arbeidstilsynet reports:** add a section per enabled module listing factor, index, risk band, `legal_basis` and linked actions.
- Count-only items appear only as organisation-level counts, with the suppression note when applicable.
- The PDF footer notes the module name and version, e.g. "Bygg og anlegg v1.0.0".

### A11. Platform admin

In Content management (see the platform admin spec):

- List modules with key, version, status, published date and the number of surveys using each.
- Draft editing is done via JSON file + seed script in v1. No in-app editor yet.
- Publish and retire actions: super-admin only, audited, require a reason.
- Analytics: module adoption (share of surveys with a module, by industry code).

### A12. Tests and acceptance criteria

**Unit (vitest)**
- Zod validation passes for `bygg-og-anlegg/v1.json` and fails for: a factor with 2 items, a duplicate code, a bad `remeasure_item`, and `min_responses: 4`.
- Scoring: `[5,4,3] → 75`, `[1,1,2] → 8.33` (rounded as core), bands at 64/65 and 49/50.
- Segment combination rule rejects when the complement is below the threshold.

**Database (pgTAP or SQL tests on a branch)**
- Updating a published module item raises an error.
- `org_count_answers` is not selectable by `authenticated`.
- `get_count_item_totals` returns nothing below the threshold and has no group parameter.
- RLS: an org admin can't read another org's `survey_modules`.

**E2E (Playwright)**
- Create a survey for a test org with industry code `43.210`. The construction module is suggested, enable it, and send.
- Answer as 7 respondents via link (mobile viewport 390px). Verify the time estimate, block order and progress bar.
- Results show 8 module factors; count items show totals; a group with 3 respondents shows "–" for all factors.
- Create an action from a module factor. The next pulse contains exactly the re-measure item(s).

**Done when**
- All tests pass in CI.
- `bygg-og-anlegg@1.0.0` is published in production.
- A real test survey with the module is completed end to end, with a PDF report checked by a human.

---

## Part B – Industry pages

### B1. Routes

| URL | Source |
| --- | --- |
| `/bygg-og-anlegg` | Industry page, content `bygg-og-anlegg.ts` + module JSON |
| `/bygg-og-anlegg/sporsmal` | Question-set page generated from module JSON |
| `/helse-og-omsorg` | Same template, existing copy migrated, no module (question page not generated) |

Implementation:

- `app/(marketing)/[bransje]/page.tsx` and `app/(marketing)/[bransje]/sporsmal/page.tsx` with `generateStaticParams()` from the industry registry and `export const dynamicParams = false`. Static top-level routes keep priority over the dynamic segment in the App Router.
- Remove the old static `bygg-og-anlegg` and `helse-og-omsorg` route folders in the same PR, so URLs don't change.
- `sporsmal` returns `notFound()` for industries without `moduleKey`.
- Fully static (SSG). No client data fetching.

### B2. Content model

`src/content/industries/types.ts`:

```ts
export type CiteKey = string; // must exist in module JSON `sources` or page `extraSources`

export type MeasuredBy =
  | { kind: 'module'; itemCode: string }                   // statement pulled from module JSON
  | { kind: 'core'; factorName: string; statement: string }; // must match core question set

export type IndustryPage = {
  slug: 'bygg-og-anlegg' | 'helse-og-omsorg';
  navLabel: string;                    // "Bygg og anlegg"
  naceCodePrefixes: string[];          // ["41","42","43"]
  module?: { key: string; version: string };
  seo: { title: string; description: string };
  hero: {
    pill: string;
    h1: string;                        // use \u00AD soft hyphen in long compounds
    lead: string;
    thresholdNote: string;
    preview?: ResultPreview;           // example board, fictional company
  };
  challengesIntro?: { title: string; text: string };
  challenges: {
    title: string;
    body: string;                      // plain text with {{cite:key}} tokens
    measuredBy: MeasuredBy;
    helpline?: boolean;
    featureFlag?: string;              // hide unless flag on
  }[];
  moduleOverview?: { intro: string };  // facts and factor list are derived from JSON
  loopExample?: { factorKey: string; actionType: 'workshop' | 'rutine' | 'lederpraksis'; groupLabel: string };
  law: { ref: string; text: string; reviewed: boolean }[];
  faq: { q: string; a: string; featureFlag?: string }[];
  related: IndustryPage['slug'][];
  extraSources?: { key: string; title: string; url: string }[];
};

export type ResultPreview = {
  company: string;                     // "Nordvik Anlegg AS" – always fictional
  caption: string;
  columns: string[];                   // "Prosjekt Nord · 14"
  rows: { factorKey: string; values: (number | null)[] }[];
  footnote: string;
};
```

Create:

- `src/content/industries/bygg-og-anlegg.ts`: port all copy from `docs/reference/bygg-og-anlegg.html`. Challenge statements come from `measuredBy.itemCode`; the "Tonen på riggen" challenge uses `kind: 'core'` with factor "Integritet og verdighet".
- `src/content/industries/helse-og-omsorg.ts`: port the live page copy unchanged.
- `src/content/industries/index.ts`: registry array plus `getIndustry(slug)`.
- Build-time validation (zod plus a custom check) must fail the build if:
  - an `itemCode` is missing from the module JSON,
  - a `{{cite:key}}` has no source,
  - a `law` entry has `reviewed: false` while `NODE_ENV === 'production'` and `VERCEL_ENV === 'production'`.

### B3. Components

Put these in `src/components/industry/`. Use existing tokens (`bg-bg`, `bg-sf`, `text-ink`, `text-body`, `text-mut`, `border-line`, `bg-ac`, `bg-sbg`, `bg-link`, `bg-mint`, `bg-peach`, `rounded-ctl`, `rounded-card`, `rounded-pill`, `font-display`) and the existing Header, Footer, Breadcrumbs, org-nr start form and FAQ/Accordion.

| Component | Notes |
| --- | --- |
| `IndustryHero` | Two columns ≥980px, one column below. Reuses the existing start form. Threshold note under the form |
| `ResultPreviewBoard` | Table in a horizontally scrollable wrapper on mobile. Cell colour by band: `bg-mint` ≥65, `bg-sbg` 50–64, `bg-peach` <50, "–" for null. Legend and footnote. `role="figure"` with aria-label |
| `ChallengeList` / `ChallengeRow` | Heavy top rule, rows split by `border-line`. Left: h3, cited body, tag (`bg-ac` for module factor, muted for core). Right: cream "Påstand i …" box with the statement and a link to `/{slug}/sporsmal#{factorKey}` |
| `CitedText` | Parses `{{cite:key}}` into `<sup><a href="#k-key">n</a></sup>`. Multiple adjacent cites render as "1,2". Numbering is per page in order of first appearance |
| `HelplineNote` | Fixed text: "Trenger du noen å snakke med nå? Mental Helse Hjelpetelefonen er åpen hele døgnet på 116 123." with `tel:116123` |
| `ModuleOverview` | Four facts derived from JSON: factors count, items count, `estimated_minutes`, `min_responses`. Factor list links to the question page anchors. "Dekkes allerede" sentence from `relation_to_core.covered_by_core_factors` |
| `ActionLoop` | Numbered 4-step list (a real sequence): Mål → Se per prosjekt → Velg tiltak → Mål igjen. Example card built from `loopExample` + JSON |
| `LawList` | Two-column definition list, one column on mobile |
| `SourceList` | Ordered list with `id="k-{key}"`, external links `rel="noopener"` |
| `IndustryCta` | Dark block reusing the start form |

**Question page** (`/[bransje]/sporsmal`), all derived from JSON:

- Breadcrumb, pill "Bygg-modulen · versjon {version}", h1, lead.
- Scale legend: 5 labels with index values.
- TOC chips linking to factor anchors, "Ja/nei-spørsmål" and "Rapportering".
- One `FactorSection` per factor, anchored at `id={factor.id}`:
  - rationale with cites,
  - items with codes,
  - legal basis,
  - three action cards, each with type, title, description and "Måles på nytt med {code}".
- Count-only items, segment questions, reporting rules, CTA and sources.
- The reporting rule about factor toggles is shown only when the `module_factor_toggles` flag is on.

### B4. Start form

- Reuse the existing form (GET `/registrer`, field `orgnr`) on both pages. Same tab, no `window.open`.
- Add client-side validation to the shared component only if it isn't already there:
  - 9 digits after stripping spaces,
  - mod-11 check digit (weights 3,2,7,6,5,4,3,2; remainder 0 → 0; result 10 → invalid),
  - inline message "Organisasjonsnummeret har 9 siffer." or "Sjekk nummeret – det ser ikke ut som et gyldig organisasjonsnummer."
- Optional, behind flag `signup_industry_hint`: add a hidden field `bransje={slug}` so `/registrer` can preselect the module. Only ship if `/registrer` reads it.

### B5. SEO and linking

- `generateMetadata`: title and description from content; canonical `https://www.orgpuls.com/{slug}` and `/{slug}/sporsmal`; Open Graph using the existing OG image pattern.
- JSON-LD: `BreadcrumbList` on both pages; `FAQPage` on the industry page from `faq` (visible items only).
- Sitemap: add `/{slug}/sporsmal` for industries with a module.
- Internal links:
  - `/bruksomrader` → industry pages,
  - `/artikler/medarbeiderundersokelse-sporsmal` → `/bygg-og-anlegg/sporsmal`,
  - industry pages → each other via `related`.
- No change to `en.orgpuls.com` in this scope; don't emit an `hreflang` to a page that doesn't exist.

### B6. Legal and copy review

Before production:

- Every `law` item and every `legal_basis` string in the module JSON must be checked against Lovdata and Arbeidstilsynet, then set `reviewed: true`. Pay particular attention to:
  - aml §§ 2-2, 2-3, 3-2, 4-1, 4-3, 10-2 and 10-8,
  - the language requirement for work teams on construction sites,
  - byggherreforskriften references.
- Statistics on the page must match the linked sources. Keep the cites.
- The example company "Nordvik Anlegg AS" must stay labelled as fictional.

### B7. QA and acceptance criteria

- Lighthouse (mobile) ≥ 95 for accessibility, best practices and SEO on both pages.
- axe: no serious or critical issues. Visible keyboard focus. Headings in order (one h1).
- No horizontal page scroll at 360px, 390px and 768px. Only the preview table scrolls inside its wrapper.
- `prefers-reduced-motion` respected.
- Every statement on both pages matches the JSON exactly (snapshot test comparing rendered text to the JSON).
- All anchors resolve: challenge "Se alle tre påstander" links land on the right factor section.
- `/helse-og-omsorg` renders with the same copy as before (visual diff reviewed by a human).
- `/helse-og-omsorg/sporsmal` returns 404; unknown slugs return 404.

---

## 2. PR plan

| PR | Content | Depends on |
| --- | --- | --- |
| 1 | Step 0 findings; module zod schema; `modules:validate`; migration; RLS; immutability trigger; seed/publish scripts; `core` extraction if needed | – |
| 2 | Survey creation: module suggestion and selection; `survey_modules`; flags scaffolding | 1 |
| 3 | Respondent flow: blocks, time estimate, count-only write path, segments behind flag | 2 |
| 4 | Scoring, reporting function, results UI, count card, segment filters behind flag | 3 |
| 5 | Actions from module factors; pulse inclusion; AMU/Arbeidstilsynet report sections | 4 |
| 6 | Industry page template, content model, components, `/bygg-og-anlegg` and `/sporsmal` | 1 (reads JSON only) |
| 7 | Migrate `/helse-og-omsorg`; sitemap, JSON-LD, internal links; legal review sign-off; publish module in production | 5, 6 |

PR 6 can run in parallel with PRs 2–5. Keep module-dependent page copy behind flags until PR 5 is live, so the page never promises what the product can't do.

---

## 3. Open decisions (ask Tor; don't decide in code)

| # | Decision | Default until decided |
| --- | --- | --- |
| 1 | Is the construction module included in both plans (Liten and Vanlig) or an add-on? | Included; no pricing copy changes |
| 2 | Ship factor toggles in v1? | Built behind `module_factor_toggles`, off |
| 3 | Ship segment questions in v1, and add "Vil ikke svare" to both? | Behind `module_segments`, off; add the option before enabling |
| 4 | Respondent languages beyond bokmål (e.g. English, Polish, Lithuanian) for construction crews | `text` is a locale map; only `nb` filled |
| 5 | Wording of the two count-only items after legal/HR review | As in v1.0.0 JSON |
| 6 | Should `/registrer` preselect the module from `?bransje=`? | Off (`signup_industry_hint`) |
| 7 | Health-and-care module (questions exist on the live page as core items; no separate module yet) | Page migrated without a module |
