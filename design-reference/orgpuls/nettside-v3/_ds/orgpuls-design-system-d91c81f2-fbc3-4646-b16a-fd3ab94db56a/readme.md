# Orgpuls Design System

Orgpuls (orgpuls.com / orgpuls.no) measures the **psychosocial work environment** for Norwegian organisations. Its wedge is statutory: arbeidsmiljøloven § 4-3 and the regulation's chapter 1A name the factors an employer must survey, and the product surveys exactly those — eleven QPS Nordic factors, three statements each, answered 1–5 — producing the documentation Arbeidstilsynet asks for. Its central promise is anonymity by structure: no single answer can be traced to a person, and no group is shown under k = 5 answers.

**Who uses it:** daglig leder (often without HR), HR in 75–500-person companies, avdelingsleder (own team only), verneombud and tillitsvalgte (same numbers as management, at the same time). Employees meet it only as the respondent survey. An internal **Sentral** admin (CRM, CMS, campaigns) exists in the repo but is not a customer surface.

## Sources

- GitHub: https://github.com/torlambrechts-sketch/Orgpuls (branch `main`) — Next.js 15 / React 19 / Tailwind / Supabase. The design truth is `design-reference/orgpuls/*.dc.html` (prototype bundles) transcribed into `tailwind.config.ts`, `app/globals.css`, `app/fonts.css` and `components/**`. Every token here is transcribed from those files, never chosen.
- Live site: https://www.orgpuls.com (the user's note said "orgplus.com" — read as orgpuls.com).
- Copy: `messages/no.json` (source language, Bokmål) — a local copy sits in `research/no.json` for grepping.
- Explore the repo further for anything not covered here (Årshjul/YearRail, Historikk, Rapport, Oppsett tabs, Veiviser, Sentral admin): the components are small, heavily commented, and every value is literal.

## Products / surfaces

1. **The app** (`ui_kits/app`) — Innsikt (Full) / Oversikt (Enkel), Målinger, Resultater, Kommentarer, Tiltak, Oppsett. Two layouts (top nav 1180px column, or a 220/62px side rail at full width) and two views (Enkel / Full).
2. **The public site** (`ui_kits/site`) — Forside, Plattform, Bruksområder, Bransjer, Hvorfor Orgpuls, Pris, Logg inn, Kom i gang.
3. **The respondent survey** (`ui_kits/respond`) — phone-width flow: promises → a factor's three statements per page → thank-you.
4. Sentral admin — not recreated; only its icon set (`Icon`) and chart palette (`--op-viz1…5`) are carried.

## CONTENT FUNDAMENTALS

- **Language:** Norwegian Bokmål first; English, and pl/uk/lt/sv/da for the survey. Legal terms stay Norwegian (grunnlinje, puls, verneombud, Arbeidstilsynet, tiltak, kartlegging).
- **Voice:** plain, concrete, slightly dry; sentences short; one idea per sentence. The product explains *why* in a subordinate clause rather than a help page: «Fem er gulvet, og det er produktets — ikke deres.»
- **Address:** the organisation is **dere/deres** («Prøv det på deres egen virksomhet»), the individual reader is **du** («Du svarer uten å vite hvem som skrev»), the respondent is **du** and management is «ledelsen». Orgpuls says **vi** sparingly («vi henter resten fra Brønnøysundregistrene»).
- **Casing:** sentence case everywhere — headings, buttons, nav, pills. UPPERCASE only for the 11px eyebrows («ARBEIDSMILJØINDEKS», «NORDVIK ANLEGG · ARBEIDSMILJØET»).
- **Punctuation:** the middle dot «·» separates facts (`28 av 34 svarte · 82 %`); the em dash «—» explains («Dokumentert — åpne rapporten →»); «→» ends a link that goes somewhere; the typographic minus «−» and «±0» for deltas, never a hyphen; «…» for progress («Sender …»); Norwegian guillemets «…» for quotes and titles. Numbers use a space before % (`82 %`) and a non-breaking thin grouping (`923 456 789`).
- **Buttons:** verb first, 1–3 words: «Se hele resultatet», «Start neste puls nå», «Legg i plan», «Flytt videre», «Send». The "add" glyph is the full-width «＋» («＋ Ny måling»). Back actions are «← Målinger».
- **Headlines** are statements, not labels: «Dere er i rute», «Første måling ute før lunsj.», «Folk trives med mening og anerkjennelse. Det som trekker ned, er ytringsklima og arbeidsmengde.» (a sentence generated from the data). Only the Oversikt sentence and site h1 carry a full stop.
- **Empty states say what is true**, never a placeholder that looks like data: «Færre enn 5 svar — resultatet vises ikke», «Ingenting venter akkurat nå», «n<5». A withheld cell is a «—», and its legend explains why.
- **Trust lines** are repeated verbatim in the footer, Deltakelse card and respondent intro: «Svar lagres i EU, og ingen enkeltsvar kan spores tilbake til en person.»
- **No emoji anywhere.** Unicode glyphs (◉ ◷ ▤ ❝ ✓ ‹ › ×) serve as icons.
- **Site tone:** benefit + mechanism + proof in one breath; stats as `20 min · fra org.nr. til første utsending`. Price is stated plainly («Fra 265 kr i måneden. Alt inkludert.»).

## VISUAL FOUNDATIONS

- **Mood:** warm paper. Cream canvas `#FCF6E9`, lighter card surface `#FFFDF6`, near-black warm ink `#191510`. Everything is hairline-bordered (`#E8DFC9`), flat, no shadows; the single accent is a saffron yellow `#F5C64A` reserved for the one primary action per screen and the current state (year-rail dot, side-rail tile).
- **Type:** Playfair Display (500–700) for headlines, figures, the wordmark and the respondent's statements; DM Sans (400–700) for everything else. Root size 14px. Half-pixel sizes are deliberate (11.5, 12.5, 13.5, 14.5). No line-height set on controls (inherits `normal`); prose 1.5–1.7; headings 1.04–1.15; the index figure 62px at 0.85. Eyebrows 11px uppercase, tracking .11em (app) / .12em (site); table heads 10.5px .09em. `text-wrap: balance` on headings, `pretty` on paragraphs. Tabular numerals on scores.
- **Colour roles:** mint/green = positive, done, link (`#CFE7E4` fill, `#20431C` ink, `#2F5D2A` link/ring, `#5C9A55` bar); yellow family = selected, attention, middle band (`#FBEBBE` soft, `#F5DC96` band, `#E0A21F` bar, `#5C4600` ink); peach/rust = risk (`#F0B9A0`, `#E38258`, `#D4633A` bar, `#A33A16` text, `#6B240C` ink). A puls has its own cool tints (`#E4EEEC`, `#9DB8B3`, `#A8D5D2`) against the grunnlinje's warm sand (`#F2EAD6`, `#D9CFB8`). Heat map: five steps `#E38258 → #EC9B77 → #F5DC96 → #CFE7E4 → #B5DAD4`.
- **Radius is a scale, not a value** (see `tokens/radius.css`): 6 focus · 9 bar/mark · 10 nav & 38–40px fields · 11 md button · 12 CTA · 13 tile · 14 respondent option · 15 row · 16 note & measure card · 18 panel/menu · 20 card · 22 modal/ink band · 24 start band · 999 pills.
- **Spacing:** instance values, not a grid (13, 15, 17, 22, 26 …). Card padding 26; panel 22/24; note 16/18; row 15/18. Page column 1180 (app), 880 for Oversikt, 1120 (site); 28/26px gutters, 16 on phones. Lists gap 8–10, card grids gap 13, panel grids gap 18.
- **Borders:** 1px `#E8DFC9` hairline on surfaces; 1px ink hairline marks a primary/selected control; 1.5px ink on the logo mark and sign-in fields; 2px ink on check marks, radio rings and the recommended plan; 1px dashed `#C4BCA8` for empty states and the optional comment box.
- **Shadows:** only on floating layers — menus `0 18px 40px −24px rgba(25,21,16,.45)`, product-shot frames `0 18px 40px −28px rgba(25,21,16,.35)`, modal `0 34px 80px rgba(25,21,16,.3)`. No inner shadows. No blur/glass. Scrim is 42% ink.
- **Backgrounds & imagery:** flat cream; no gradients, patterns or textures; no stock photography. Imagery is the product itself (screenshots in a hairline browser frame or a 7px ink phone bezel) and the illustrated Tuva faces. OG cards are the only large graphics.
- **Motion:** one entry animation on every screen root (`ht-in`: opacity 0→1, 6px rise, .25s ease), honoured by `prefers-reduced-motion`. Side rail width 180ms ease-in-out; switch knob 150ms. No bounces, no springs, no hover transitions.
- **Hover:** links turn `#1E3D1A` and underline; buttons and cards have **no hover change** (the bundle defines none). Press: none. Focus-visible: 3px ink outline, 2px offset, radius 6 — specified and implemented everywhere.
- **Selected states** are border + fill + weight: ink border, soft-yellow fill, weight 700 (chips, radio cards, nav); or ink fill with cream text (filter pills, Enkel/Full). Weight change is part of the state.
- **Cards:** r20 hairline card on `#FFFDF6`; tinted variants (soft yellow, mint) on the site; the single ink card is the price band. Tone stripe (7px pill) on worklist rows; a 44px ink square with Playfair initials on role cards.
- **Layout rules:** sticky header (56px, hairline below); nav entries tinted when current *or* on a child screen, bold only when current; the Hjelp/Grunnlag/Tuva panel opens as a soft-yellow band under the header; Oppsett lives in the account menu, not the nav. Everything is flex/grid with `gap`.
- **Data display:** the number always accompanies the bar; deltas are signed and coloured (≤ −3 rust, ≥ +3 green, else faint); k-anonymity is shown as `n<5` or `—` with a legend, never a blank.

## ICONOGRAPHY

- **No icon font, no SVG sprite in the product UI.** The app nav uses Unicode glyphs as icons: ◉ Innsikt · ◷ Målinger · ▤ Resultater · ❝ Kommentarer · ✓ Tiltak, drawn in a 26px tile (yellow when current, sand at rest). Other glyphs: ✓ ticks, ‹ › rail collapse, × close, ＋ add, ← → directions, − + disclosure.
- **The brand mark** is the one bespoke SVG: a pulse polyline with a trailing dot in a rounded square (`assets/logo/orgpuls-mark.svg`; the `Logo` component carries the exact path). Never redraw it.
- **Line icons** exist only in the Sentral admin menu: 32 glyphs on a 24 grid, 1.8 stroke, currentColor (`components/core/Icon.jsx`, copied from `components/admin/icons.tsx`). Two inline SVGs in the shell: the layout toggle (rect + divider) and the mobile menu/close/chevron.
- **Tuva, the assistant,** is a set of illustrated faces (`assets/tuva/av*.png`) shown at 20/26/38/64px with radius 7/8/11/18. The organisation picks one.
- **Emoji:** never.
- **Imagery assets:** `assets/product/*.webp` (nine real screens: oversikt, resultater, varmekart, tiltak, kommentarer, samtaler, rapport, arshjul, sporsmal), `assets/og/*.png` (share cards), `assets/logo/` (svg mark, apple-icon, mail mark).

## Components (`components/`)

All inline-styled React functions reading the CSS custom properties; each has a `.d.ts` and a `.prompt.md`. Namespace on the window: `OrgpulsDesignSystem_d91c81`.

- **core/** — `Button` (8 sizes × 6 tones), `Pill` (filter/tab), `Chip` (radio/checkbox chip), `Segmented` (Enkel/Full + panel tabs), `Switch`, `AccountChip`, `Logo`, `Icon` (+ `ICON_PATHS`), `Tick`, `Eyebrow`, `CountBadge`
- **surfaces/** — `Card`, `Section`, `NoteCard`, `Row`, `Modal`
- **forms/** — `Field`, `Input` (+ `FIELD_SIZE`, `fieldStyle`), `Select`, `Textarea`, `Mark`, `RadioCard`, `CheckRow`, `CheckCard`, `ChoiceOption`
- **data/** — `RiskBadge` (+ `BAND_LABEL`, `BAND_BAR`), `MaskedCell`, `StackedBar`, `HeatTile` (+ `heatTone` / `HeatTone`), `TypePill`, `StatusPill`, `Meter` (+ `rateColour` / `RateColour`)

**Intentional additions** (not a named component in the source, but a repeated literal there): `Input`/`Select`/`Textarea`/`Field` consolidate the five field sizes the bundle repeats inline; `Segmented` names the Enkel/Full track; `AccountChip`, `CountBadge`, `StatusPill`, `HeatTile`, `Meter` name pills/bars that recur across screens; `Button tone="danger"` is the one-off «Slett tiltaket». A disabled button is drawn at 55% opacity here — the source only changes the cursor.

**Not built (exists in source, screen-specific):** YearRail/Årshjul, Board (Tavle), ReportRegister/Rapport sheet, Veiviser wizard, SetupForm, LogoCard, the Sentral admin shell.

## UI kits (`ui_kits/`)

- `app/` — `index.html` + `data.js` (the demo fixture: Nordvik Anlegg, 34 ansatte, index 61, −3, 28 av 34 · 82 %) + `Shell.jsx` (header, help panel, side rail, footer) + `Home.jsx` (Innsikt, Oversikt) + `Measure.jsx` (Målinger, Resultater) + `Work.jsx` (Kommentarer, Tiltak) + `main.jsx`. Click-through: nav, Enkel/Full, top/side layout, Hjelp panel tabs, account menu, heat-map cell selection, «Legg i plan», reply to comments, advance a measure, open the handlingsplan.
- `site/` — `SiteShell.jsx` (header with Bransjer disclosure, StartBand with org-number validation, footer, Crumbs, Plans) + `Pages.jsx` (Forside, Pris with FAQ, Logg inn / Glemt passord, Bransjer; other pages as a labelled placeholder) + `main.jsx`.
- `respond/` — `Respond.jsx`: the survey as the employee sees it (intro promises, «Siden sist», progress, a factor's three statements, «Ikke relevant for meg», optional comment, skip/back, thank-you). Draft is kept in localStorage like the real flow.

## Index of this folder

- `styles.css` — the single import entry (fonts, colors, typography, radius, spacing, effects, base).
- `tokens/` — `fonts.css` (@font-face, self-hosted woff2), `colors.css`, `typography.css`, `radius.css`, `spacing.css`, `effects.css`, `base.css`.
- `assets/` — `fonts/`, `logo/`, `tuva/`, `product/`, `og/`.
- `guidelines/` — foundation cards: `colors/` (6), `type/` (4), `spacing/` (4), `brand/` (5).
- `components/` — `core/`, `surfaces/`, `forms/`, `data/` — each with a `*.card.html`.
- `ui_kits/` — `app/`, `site/`, `respond/`.
- `research/` — `no.json` (full Norwegian message catalogue), `landingsside-gjennomgang.md`, and three `.ts.txt` reference files from the repo.
- `thumbnail.html`, `SKILL.md`, `github.md`, `readme.md`.

## Caveats

- Values are transcribed from the Tailwind/React source, not pixel-diffed against the repo's baselines; the repo's own gate is 0.1% of the screen, this is a faithful recreation, not that.
- Comment tone pill colours (negativ/blandet/positiv) were not in the files read (`lib/conversations/rules.ts`); the risk-band fills are used.
- Sentral admin, Årshjul, Rapport, Oppsett tabs and the Tavle are not recreated — their tabs show a labelled placeholder pointing at the source file.
