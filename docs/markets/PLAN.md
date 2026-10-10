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
| 3 | Germany | waiting on the instrument and roles decisions |
| 4 | Empvibe, UK first | brand layer after phase 1; UK research done (artifact, «United Kingdom: what it takes») |
| ∥ | Leadership 360 app, its own Supabase project | independent; shares packages, not the database |

### Phase 1 — what is done and what is left

**1a (D-251, migration 0214):** `app.markets` with the floor, language and time zone; `organizations.market`;
the raise-only floor in the database and in `app.k_threshold`; only the platform changes a market;
`create_organisation(…, p_market)`; the `SITES` host registry; sign-up carries the host's market through the password,
Google and Microsoft paths; the locale rule reads the registry. `supabase/tests/markets_invariants.sql`,
`tests/unit/markets.test.ts`.

**Left in phase 1**, each added with its first reader so nothing is stored for no one:

- per-market organisation number rule and a unique index per market (Sweden's ten digits);
- prices, currency and VAT mode per market (reverse charge outside Norway);
- company lookup per market (Brønnøysund today; Bolagsverket, Handelsregister later);
- legal pack and report template per market; documents (DPA, terms, privacy) per market and language;
- phone country and SMS sender per market;
- sitemap, hreflang and robots per host;
- market and registry id on the events sent to Sentral.

## Decisions only the owner can make

Addresses (country domains or subdomains) · anonymity per market (Germany 5; Sweden 5 or 6) · new German roles
(Betriebsrat, external adviser — changes the three-role invariant) · the German instrument · an EU legal representative
· the leadership app's database (separate project recommended) · manager data from Entra · the brand split (Orgpuls
Nordic and German, Empvibe English-speaking, en.orgpuls.com kept) · the first English market (UK recommended).

### Phase 2 — Sweden, step by step

| Step | What | State |
|---|---|---|
| SE-A | Swedish as a platform language: the app's chrome in Swedish, English behind it; registry-owned survey texts unchanged | built (D-252) |
| SE-A2 | Factor names and statements in the leader's views in Swedish, from the registry's Swedish | built (D-253); module texts still English |
| SE-B | Market `se`: organisation number rule (ten digits, Luhn), sign-up per market, the Swedish address in `SITES`, Bolagsverket lookup, mail language per market | B1–B3 built (D-254, D-255): market, number rule, sign-up, `SE_HOST`, Oppsett, mail language; B4 Bolagsverket waits on an API agreement; Swedish in the survey waits on `locale_sv` |
| SE-C | Legal pack per market: report, help and in-app legal texts on AML, AFS 2023:1 and AFS 2023:2; skyddsombud; written risk assessment (§ 11) and action plan (§ 13) | built (D-257): `messages/market/se/{sv,en}.json`, `lib/legal/pack.ts`, mail by market (0219); sources in `docs/markets/se-legal.md`. Open: a Swedish lawyer's review of the pack |
| SE-D | Working time and recovery (AFS 2023:2 2:9) as a Swedish module; **modules carry their market**, so Norway's industry modules (whose legal basis is Norwegian) are offered only in Norway — required before launch (D-257) | |
| SE-E | SEK prices, reverse charge, Swedish PUB-avtal and DPIA template | waits on prices |
| SE-F | The Swedish site: its own pages and articles, Swedish search terms. Until then se.orgpuls.com serves the sign-up and the product only, unindexed (D-256). Launch checklist: DNS `se` → Vercel, the Vercel domain, Supabase Auth's redirect URLs, deploy the edge functions (D-255, D-257), and SE-D's modules by market | address decided: se.orgpuls.com (X-109) |

Decided: the address is se.orgpuls.com for now (X-109). Still open: the Swedish anonymity floor
(5 or 6; built at 5, which can only be raised), SEK prices, and whether a Swedish sole trader (whose organisation
number is their personnummer) may sign up (built: no, D-254).

