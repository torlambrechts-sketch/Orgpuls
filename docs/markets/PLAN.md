# Markets — one system for Norway, Sweden, Germany and the English-speaking markets

The owner's brief, 9 October 2026: a German and a Swedish Orgpuls, and Empvibe (empvibe.com) for English-speaking
markets, «customised for each region / country but the same base», and «I dont want two seperate systems». The full
analysis, with the law, the market and sources per country, is the artifact *Orgpuls Expansion Plan*
(https://claude.ai/artifact/VtfYpGkBWeEBWs9wd1WAbP). This file is the working plan in the repository: the rules, the
phases and where each stands.

## The model

Three things that today are one, «Norway in Norwegian», are kept apart:

| Axis | What it decides | Where it lives |
|---|---|---|
| **Brand** | name, logo, design tokens, sender, support address, marketing site | `lib/hosts.ts` `SITES.brand` (only `orgpuls` today) |
| **Market** | law and report, anonymity floor, prices and VAT, company registry, documents, time zone | `app.markets` (0214), `organizations.market`, `lib/markets.ts` |
| **Language** | the texts a person reads | `lib/i18n/locales.ts`, the cookie, the profile, the site's language |

A host names a brand, a market and a default language. One codebase, one database in eu-central-1, one Sentral.

## Rules

1. **Norway does not move.** Every phase keeps the design figures (index 61, 64 the year before, «28 av 34 · 82 %»),
   the pixel gate and every SQL suite green for Norwegian customers.
2. **A market may raise anonymity, never lower it.** `app.k_floor()` stays 3 for everyone; a market's floor is
   between it and 10, is never lowered, and lifts the organisations under it when raised (0214).
3. **Market packs are data.** A new country is rows, modules, message files and documents, as a new factor is today:
   never a branch in a component.
4. **Language is not market.** An organisation in Norway may read English; a language may serve several markets.
5. **The host decides the market at sign-up, never a form field**, and only the platform moves an organisation later.

## Phases

| # | Phase | State |
|---|---|---|
| 1 | **Market foundation, Norway unchanged** | **started** — 1a built and live, hosted included (D-251) |
| 2 | Sweden | **started** — SE-A, SE-A2, SE-B1–B3 and SE-C: the app and the instrument in Swedish, Sweden as a market, the Swedish address and Sweden's law (D-252–D-257); the rest below |
| 3 | Germany | **started (X-115)** — the address is de.orgpuls.com; the law read (`docs/markets/de-legal.md`); the steps DE-A … DE-G below. Until DE-G, de.orgpuls.com keeps redirecting to the English site (D-258) |
| 4 | Empvibe, UK first | **decided (X-111)**: empvibe.com is the English site, brand Empvibe, market United Kingdom, floor 5, the 11 factors as core with HSE's Indicator Tool as a module; built first, then moved in one change. Steps below |
| ∥ | Leadership 360 app, its own Supabase project | independent; shares packages, not the database |

### Phase 1 — what is done and what is left

**1a (D-251, migration 0214):** `app.markets` with the floor, language and time zone; `organizations.market`;
the raise-only floor in the database and in `app.k_threshold`; only the platform changes a market;
`create_organisation(…, p_market)`; the `SITES` host registry; sign-up carries the host's market through the password,
Google and Microsoft paths; the locale rule reads the registry. `supabase/tests/markets_invariants.sql`,
`tests/unit/markets.test.ts`.

**Left in phase 1**, each added with its first reader so nothing is stored for no one:

- per-market organisation number rule and a unique index per market (Sweden's ten digits);
- prices, currency and VAT mode per market (reverse charge outside Norway) — built for the United Kingdom (D-274), Sweden's is SE-E;
- company lookup per market (Brønnøysund today; Bolagsverket, Handelsregister later);
- legal pack and report template per market; documents (DPA, terms, privacy) per market and language;
- phone country and SMS sender per market;
- sitemap, hreflang and robots per host;
- market and registry id on the events sent to Sentral.

## Decisions only the owner can make

Addresses (country domains or subdomains; Germany: de.orgpuls.com, X-115) · anonymity per market (Germany 5; Sweden 5 or 6) · new
German roles (Betriebsrat, external adviser — changes the three-role invariant; until decided the third role is labelled
«Betriebsrat», de-legal.md § 5) · the German instrument (assumed: QPS Nordic in German) · an EU legal representative
(assumed not needed for an EEA provider, de-legal.md § 10) · German prices (DE-E) · the leadership app's database (separate project recommended) · manager data from Entra · the brand split (Orgpuls
Nordic and German, Empvibe English-speaking, en.orgpuls.com kept) · the first English market (UK recommended).

### Phase 4 — Empvibe and the United Kingdom, step by step (X-111)

Until UK-G, empvibe.com showed a holding page of its own, in English and under the Empvibe name, with no sign-up and no
indexing (D-269, replacing D-258's redirect to en.orgpuls.com, since the Orgpuls name means nothing in English). Since
UK-G (D-275) empvibe.com is open, and en.orgpuls.com redirects to it.

| Step | What | State |
|---|---|---|
| UK-A | Brand layer: a brand per site (name, wordmark, page titles, share images, mail brand), Empvibe's texts laid over the English catalogue as a market's are; brand follows the organisation's market in mail | built (D-261): the name in every text, wordmark, title and notice mail; auth mail and share images at UK-G/UK-E |
| UK-B | Market `gb`: floor 5, English, Europe/London, Companies House number rule (limited companies and LLPs; other firms later), sign-up on empvibe.com | built (0222, D-264); no host signs up into it until UK-G |
| UK-C | UK legal pack: HSWA 1974 s.2, MHSWR 1999 regs 3 and 5, the Management Standards mapped onto the 11 factors, safety representatives (SRSC 1977, HSCER 1996) and a «no representative» case, UK GDPR and ICO; sources in `docs/markets/uk-legal.md` | built (D-265): 172 texts in English, the duties, provisions, coverage, gaps and factor references; legal review open |
| UK-D | HSE's Indicator Tool as a UK module (`module_markets` row `gb`), verbatim, attributed under the Open Government Licence | researched 2026-10-10 (below); decided X-112. D2 built (0223, D-266): reverse scoring and the module's own bands. D1/D3 built (0224, D-267): two scales, up to nine statements, the instrument's order and pages, no «not relevant», the text before item 1, the attribution stored. D4 built (0225, D-268): `modules/hse-indicator-tool`, HSE's English and Polish verbatim, machine drafts for uk/lt/sv/da, market `gb`, attribution and the module's own bands on the leader screens |
| UK-E | The UK public site on empvibe.com: its own pages, Empvibe's name, UK search terms, hreflang and sitemap per host | E1 built (D-270): behind `EMPVIBE_SITE=open` until UK-G, its own page list and English addresses, links, canonical, schema.org, sitemap, robots and llms.txt per host, its own menu, the company number by market. E2 built (D-271): every served page in British English for UK law, the law, safety representatives and small businesses rewritten whole. E3 built (D-272): English screens of a British firm (design fixture `--market gb`), Empvibe's own share cards, the review's corrections; privacy and terms not served until UK-F. E4 verified (D-272): 390/1280, axe, Norway's pages unchanged, production on the holding page. British dates and the organisation's own clock in the app (D-273), the pictures retaken |
| UK-F | Documents: a UK Article 28 agreement, privacy notice, B2B terms; GBP prices and reverse-charge invoicing | built (X-113, D-274): the UK's own DPA versioned per market (0226), `/privacy` and `/terms` served on Empvibe, £25/£55 with the reverse charge, a VAT number in place of EHF (0227), the market told to the platform where invoices are made (0228); found by the review, an invitation now says only whether its employee answered, never when (0229). Open for the lawyer: Art. 27, Art. 28(3) «domestic law», the ICO fee, invoice content |
| UK-G | The move: empvibe.com and www.empvibe.com as a site row, en.orgpuls.com redirected there, Supabase Auth redirect URLs, Brevo sender domain | built (D-275): Empvibe open without a flag, the holding page gone; en.orgpuls.com 308s to Empvibe's page or to www.orgpuls.com in English; Norway's site without its English twin; `/pricing` in pounds; mail, SMS, Teams and Slack link to Empvibe and go under its name, the SMS from «Empvibe»; the Auth mail from the site it was asked on; 0230; Auth allow list on hosted. Tor's: Brevo domain and DNS, a mailbox, Slack and Entra redirect URLs, Sentral's site, Search Console |
| UK-H | Empvibe's own articles: UK keyword plan, ten articles in British English for UK law, cards, sitemap, llms.txt, IndexNow | built (D-278): articles per site (Norway's, Empvibe's, none on Sweden's), /articles on Empvibe, ten articles fact-checked against their sources, their own cards and schema.org; the UK example firm renamed to Brackenmoor Civils Ltd (Northfield Civils Ltd is a real company). Tor's: Search Console and Sentral for www.empvibe.com; a UK reader of the articles |

**UK-D, what the Indicator Tool needs from the module format** (research 2026-10-10, from HSE's OGL PDF and Analysis Tool):
- **Wording.** 35 items in seven scales: demands 8, control 6, managers' support 5, peer support 4, relationships 4,
  role 5, change 3. The wording is taken from hse.gov.uk's PDF only, never from HSE's paid online tool, whose terms
  forbid derived services.
- **Two response scales.** Items 1–23 use a frequency scale (Never…Always) and items 24–35 an agreement scale. A
  module has one scale today, and the flow shows the core's agreement labels for every module statement.
- **Up to 8 statements per factor,** and codes past 5. Today a factor has 3, or 5 in a variant.
- **HSE's order, fixed.** Today statements are shuffled per respondent and grouped one page per factor.
- **No «Not relevant to me» answer:** HSE has five answers and a skip.
- **A module-level instruction text** before item 1.
- **Reverse scoring, applied.** 12 items are reverse-scored. The `reverse` flag is stored but no reader applies it:
  `module_results` scores the raw value. No module sets it today, so nothing is scored wrongly yet.
- **English as the source text.** The format requires bokmål.
- **Attribution and non-endorsement on the module:** «Contains public sector information published by the Health and
  Safety Executive and licensed under the Open Government Licence v3.0», and not produced, approved or endorsed by
  HSE. No HSE logo.
- **Tor's to decide:**
  - whether this module releases at 10 answers, as HSE's online tool does, instead of the round's k;
  - the bands on HSE's 1–5 scale (HSE: 4 and above good, 2 and below needs improvement);
  - pl, uk, lt and da machine drafts, which would be ours, not HSE's. HSE publishes an official Polish version.

### Phase 2 — Sweden, step by step

| Step | What | State |
|---|---|---|
| SE-A | Swedish as a platform language: the app's chrome in Swedish, English behind it; registry-owned survey texts unchanged | built (D-252) |
| SE-A2 | Factor names and statements in the leader's views in Swedish, from the registry's Swedish | built (D-253); module texts still English |
| SE-B | Market `se`: organisation number rule (ten digits, Luhn), sign-up per market, the Swedish address in `SITES`, Bolagsverket lookup, mail language per market | B1–B3 built (D-254, D-255): market, number rule, sign-up, `SE_HOST`, Oppsett, mail language; B4 Bolagsverket waits on an API agreement; Swedish in the survey waits on `locale_sv` |
| SE-C | Legal pack per market: report, help and in-app legal texts on AML, AFS 2023:1 and AFS 2023:2; skyddsombud; written risk assessment (§ 11) and action plan (§ 13) | built (D-257): `messages/market/se/{sv,en}.json`, `lib/legal/pack.ts`, mail by market (0219); sources in `docs/markets/se-legal.md`. Open: a Swedish lawyer's review of the pack |
| SE-D | Working time and recovery (AFS 2023:2 2:9) as a Swedish module; **modules carry their market**, so Norway's industry modules (whose legal basis is Norwegian) are offered only in Norway — required before launch (D-257) | built: modules by market (0220, D-260); «Arbetstid och återhämtning» published on hosted for Sweden only, in Swedish, Polish, Ukrainian, Lithuanian and Danish (0221, D-263) |
| SE-E | SEK prices, reverse charge, Swedish PUB-avtal and DPIA template | waits on prices |
| SE-F | The Swedish site: its own pages and articles, Swedish search terms. Until then se.orgpuls.com serves the sign-up and the product only, unindexed (D-256). Launch checklist: DNS `se` → Vercel, the Vercel domain, Supabase Auth's redirect URLs, deploy the edge functions (D-255, D-257; from main since D-259, once the `SUPABASE_ACCESS_TOKEN` secret is set). SE-D is done (D-260, D-263) | built (D-276): a site of its own on se.orgpuls.com, indexed; ten pages in Swedish for Swedish law at Swedish addresses (the law, skyddsombud, small businesses, security, the privacy policy with IMY), no prices, terms, industries, articles or demo; Swedish screens of a Swedish firm and Swedish share cards; mail links to se.orgpuls.com. Open: articles in Swedish; prices and terms (SE-E); a Swedish reader of the machine-drafted texts; Tor's Slack, Entra, Sentral and Search Console steps |

Decided: the address is se.orgpuls.com for now (X-109). Still open: the Swedish anonymity floor
(5 or 6; built at 5, which can only be raised), SEK prices, and whether a Swedish sole trader (whose organisation
number is their personnummer) may sign up (built: no, D-254).

### Phase 3 — Germany, step by step (X-115)

The order is Sweden's. Until DE-G, de.orgpuls.com answers as D-258 says: every address goes to the English site,
temporarily, nothing indexed.

| Step | What | State |
|---|---|---|
| DE-L | The law read: ArbSchG §§ 3–6, 12–17, 21; BetrVG §§ 1, 80, 87, 89, 94; ASiG §§ 1, 2, 5, 9, 11; SGB VII §§ 21, 22; AGG §§ 1, 3, 7, 12, 13; ArbZG §§ 3, 5; BDSG § 26 — verbatim, with how a product text cites each; the GDA and DGUV texts not reachable, listed as unverified | written 2026-10-29: `docs/markets/de-legal.md` |
| DE-A | German as a platform language: the app's chrome in German, English behind it (as D-252 for Swedish); the locale registry and the database's locale lists widened | done 2026-10-29: D-289, `messages/de.json` (3 278 strings, machine draft, `docs/translations/de.md`), 0235; hosted migration waits on the Supabase connector |
| DE-A2 | German as a survey language: the statements, factors, extras, respondent pages and invitation texts drafted in German into the translation registry (X-089), offered once approved; the published modules' German | — |
| DE-B | Market `de`: floor 5, language de, Europe/Berlin, the USt-IdNr. as the optional organisation number (format DE + nine digits, unique per market), sign-up on de.orgpuls.com, mail language; `SITES` row behind a flag until DE-G | done 2026-10-29 for the market, the number rule, the languages, the mail and SMS tables: D-289, 0236; the `SITES` row and sign-up on the host are DE-F; hosted migration waits on the connector |
| DE-C | Legal pack per market: report, help and in-app legal texts on §§ 3, 5 and 6 ArbSchG, the Betriebsrat's rights, the empty-role case, Sicherheitsbeauftragte and Arbeitsschutzausschuss; the eleven factors against the German duties; sources in de-legal.md. Open: a German lawyer's review | — |
| DE-D | A German module for what the eleven factors leave out (Arbeitsumgebung, Arbeitszeit), offered in Germany only, as Sweden's working-time module (D-263) | later, after DE-F |
| DE-E | EUR prices, reverse charge with the customer's USt-IdNr., German DPA and terms | waits on prices |
| DE-F | The German site on de.orgpuls.com: ten pages in German for German law at German addresses (the law, the Betriebsrat, small businesses, security, the privacy notice), no prices, terms, industries, articles or demo; German screens of a German firm and German share cards; hreflang de-DE, sitemap, robots, llms.txt per host | — |
| DE-G | Open it: the hosted migration, the flag off, Supabase Auth redirect URLs, the mail and SMS senders, Search Console (the sitemap), Sentral's site, IndexNow; a German reader of the texts | — |
