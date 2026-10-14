# Search and AI-answer strategy for orgpuls.com (SEO + GEO), 2026-10-12

Tor's question (2026-10-12), over Sentral › SEO › Keywords for the last 7 days: «How can we improve? Make a
strategy that improves this … make sure we also include AI optimization, GEO and SEO.»

This is the working strategy: what the data says, what we do about it, in what order, and how we will know
it worked. The keyword → page map in § 4 is the ledger. Change the map and the pages together.

## 1. Where we are

**The numbers.** In the 7 days to 2026-10-09: 78 impressions, 1 click, no query in the top 3, 5 queries at
positions 4–20, 16 below position 20, and 0 % CTR on every query shown.

Over the 30 days that Search Console has data for, there are about 36 query/page pairs, and the largest
has 16 impressions. Sentral recorded the first visit from Google on 2026-10-12.

The site is about three weeks old in Google's index: the law and practice articles were published from
2026-09-25. Positions 40–80 on a domain this young mean Google has seen the pages but does not yet trust
the domain.

**What is already in place,** checked 2026-10-12:
- Server-rendered pages, the sitemap, robots.txt and a canonical URL per page.
- IndexNow for Bing, Yandex, Seznam and Naver, plus Bing Webmaster Tools (D-234).
- Search Console, imported daily into Sentral.
- JSON-LD:
  - Organization, WebSite and BreadcrumbList;
  - Article, with `citation` built from each article's source list;
  - FAQPage on landing pages;
  - SoftwareApplication with offers.
- `/llms.txt` lists every public page with its own title and description.
- Every article cites the Act, the regulation and Arbeidstilsynet verbatim (D-235).
- AI crawlers are allowed. A fetch of an article answered 200 for GPTBot, OAI-SearchBot, ClaudeBot,
  PerplexityBot, Google-Extended and bingbot.

The technical base is not the problem.

**What holds us back, in order of weight:**
1. **Authority.** A new domain with almost no links from other sites. This weighs most for the head terms
   («arbeidsmiljøkartlegging» 65, «verneombud psykososialt arbeidsmiljø» 60, «medarbeiderundersøkelse
   spørsmål» 44).
2. **Intent gaps.** Some queries have no page that answers them:
   - «medarbeiderundersøkelse lovpålagt»: 14 impressions over 30 days, the most of any query without a
     page of its own. It lands on the anonymity article at 41 and the questions article at 64.
   - «medarbeidertilfredshetsundersøkelse»: 7 impressions, positions 72–85.
   - «arbeidsmiljøkartlegging» and «kartlegging av arbeidsmiljø»: about 6 impressions, positions 38–79.
     Sentral itself says: «create a dedicated landing page».
3. **Two pages per intent (cannibalisation).**
   - Google alternates /lovkrav and the article «Krav til kartlegging» for «arbeidsmiljøkartlegging».
   - /smaa-bedrifter (63) competes with the anonymity article (16) for «anonym medarbeiderundersøkelse».
   - /verneombud and the article «Verneombudets rolle» cover the same question.
4. **The «which platform» questions land on a page that cannot answer them.**
   - «hvilken plattform tilbyr anonym medarbeiderfeedback?» ranks 6.5, and «beste plattform for anonyme
     pulsundersøkelser» ranks 9.
   - Both land on the anonymity article, which by rule never names the product (D-235).
   - These are conversational queries, the shape AI search (Google AI Mode, ChatGPT search) sends.
   - We are already in the candidate set. We are not giving the engine a page that says what Orgpuls is.

## 2. How AI answers pick their sources (GEO)

An AI answer is a search followed by a summary. The engine:
1. retrieves pages from a search index;
2. picks the passages that answer the question most directly;
3. names and links the source when it quotes it.

Each engine searches a different index:

| Engine | Index it searches |
|---|---|
| Google AI Overviews, AI Mode and Gemini | Google's |
| ChatGPT search and Microsoft Copilot | Bing's |
| Claude | Brave's |
| Perplexity | its own, plus others |

So GEO rests on SEO: a page no index ranks is never retrieved. Beyond ranking, the published GEO research
(Aggarwal et al., «GEO: Generative Engine Optimization», KDD 2024) and the engines' own guidance agree on
what gets a passage quoted:
- it answers the question in its first sentences, in the question's own words;
- it carries checkable facts (numbers, legal references, sources) rather than adjectives;
- the entity is unambiguous: who publishes it, what the product is, where the company is registered;
- **other sites name it.** For «which tool» questions especially, an engine recommends what several
  independent sources list. We can only earn that off-site.

What we do not do: no AI-only text, no hidden text, no instructions to AI crawlers inside pages, no invented
reviews, lists or figures (CLAUDE.md: never fabricate), and no bought placements in «best tools» lists.

## 3. Strategy: six moves

1. **One page per intent.** Every query cluster has exactly one target page (§ 4). The others link to it
   with the query's words as the anchor, and do not compete in title and H1.
2. **Win the striking distance first.** Positions 4–20 move fastest. The title and H1 should open with the
   query's words, and the description should promise what the page actually gives. CTR only matters once
   a page is on page one, so CTR work goes to these pages alone.
3. **Fill the intent gaps.** Each gap is a new page that answers the question in its lead:
   - «Er medarbeiderundersøkelse lovpålagt?» (informational, D-235 rules);
   - «Arbeidsmiljøkartlegging» (informational);
   - «Verktøy for medarbeiderundersøkelse» (a product page, which may sell).
4. **Be the source AI answers quote.**
   - The articles already lead with the answer and cite their sources. Keep that rule for every new
     article.
   - Product facts live on product pages, stated so they can be checked. The «which tool» queries get a
     product page that says what Orgpuls is in its first sentence, lists the criteria that matter, and
     answers the common questions with FAQPage data.
   - The Organization entity names the registered company: `sameAs` Brønnøysundregistrene and the
     org.nr. as identifier. Its LinkedIn page follows once Tor gives the URL.
   - Bing matters as much as Google here (ChatGPT and Copilot), so every deploy that changes public pages
     ends with `node scripts/seo/indexnow.mjs`.
5. **Earn authority off-site (Tor).** This is the biggest lever and only a person can pull it. See § 6.
6. **Measure weekly, decide monthly.** See § 7.

## 4. Keyword → page map

| Cluster (queries seen in Search Console) | Target page | Status 2026-10-12 |
|---|---|---|
| anonym medarbeiderundersøkelse, medarbeiderundersøkelse anonymitet | /artikler/anonym-medarbeiderundersokelse | pos 13–16; title and H1 now open with the query (D-281) |
| hvilken plattform tilbyr anonym medarbeiderfeedback?, beste plattform for anonyme pulsundersøkelser, pulsundersøkelse verktøy, verktøy/system for medarbeiderundersøkelse | **/verktoy-for-medarbeiderundersokelse** (new product page) | pos 6.5–9 on the article; new page (D-281) |
| medarbeiderundersøkelse lovpålagt, hvorfor medarbeiderundersøkelse | **/artikler/er-medarbeiderundersokelse-lovpalagt** (new) | pos 41–64, no page; new (D-281) |
| arbeidsmiljøkartlegging, kartlegging av arbeidsmiljø | **/artikler/arbeidsmiljokartlegging** (new) | pos 38–79; new (D-281). Replaces D-227's «out of titles», which rested on no data |
| kartlegging av psykososialt arbeidsmiljø, psykososialt arbeidsmiljø undersøkelse | /lovkrav | keep |
| krav til kartlegging (av psykososialt arbeidsmiljø) | /artikler/krav-til-kartlegging-av-psykososialt-arbeidsmiljo | keep |
| risikovurdering psykososialt arbeidsmiljø | /artikler/risikovurdering-av-psykososialt-arbeidsmiljo | pos 80 on the wrong pages. Ten pages already link it with these words, and it is a week old: wait for authority, check again in phase 2 |
| verneombud psykososialt arbeidsmiljø, vernerunde psykososialt arbeidsmiljø | /artikler/verneombudets-rolle-i-kartleggingen | pos 60; title and H1 carry the query (D-281) |
| verneombud rettigheter og plikter, valg av verneombud | /verneombud | title says «rettigheter og plikter» (D-281) |
| medarbeiderundersøkelse spørsmål, medarbeiderundersøkelse mal | /artikler/medarbeiderundersokelse-sporsmal (+ /maler/qpsnordic-sporreskjema) | pos 44–53; the template's title now says «gratis mal for medarbeiderundersøkelse» and its page holds the 37 items and answers the questions around them (D-283); the article in phase 2 |
| medarbeidertilfredshetsundersøkelse, medarbeidertilfredshet, MTU | /artikler/trivselsundersokelse | pos 72–85; the term added to its description and lead (D-281) |
| medarbeiderundersøkelse (head term) | /artikler/medarbeiderundersokelse | keep (D-249, D-250) |
| medarbeiderundersøkelse små bedrifter | /smaa-bedrifter | keep |
| språkkrav byggherreforskriften, vernerunde byggeplass, psi byggeplass | /bygg-og-anlegg, /bygg-og-anlegg/sporsmal | pos 11–82; phase 2 |
| hvordan øker man svarprosenten i pulsundersøkelser? | /artikler/pulsundersokelse | pos 2; the section now asks it and answers first (D-282) |
| minimum antall svar for anonym rapportering i medarbeiderundersøkelse | /artikler/anonym-medarbeiderundersokelse | pos 6; «hvor mange svar må til?» answers first (D-282) |
| hva er den beste plattformen for pulsundersøkelser? | /plattform (Google's choice) | pos 6; its description names pulsundersøkelser (D-282). /verktoy-for-medarbeiderundersokelse stays the page for «verktøy/plattform for anonym …»; watch which Google keeps |
| hva betyr motstridende | /artikler/motstridende-krav | pos 11; «Hva betyr motstridende krav?» opens it (D-282) |
| personaloppfølging | none: not our intent | ignore |

## 5. Plan

### Phase 1: on the site, shipped 2026-10-12 (D-281)

1. **Retarget existing pages** to the queries Google already shows them for, in Norwegian and English:
   - the anonymity article;
   - the safety representative's article and /verneombud, split into «psykososialt arbeidsmiljø» and
     «rettigheter og plikter»;
   - the trivsel article, which gains «medarbeidertilfredshetsundersøkelse».
2. **Two new articles** under D-235's rules: «Er medarbeiderundersøkelse lovpålagt?» and
   «Arbeidsmiljøkartlegging». Every legal sentence is quoted from Lovdata or Arbeidstilsynet, and each
   article is linked from the articles next to it.
3. **One new product page**, «Verktøy for medarbeiderundersøkelse». It sets out the criteria a buyer
   should check, how Orgpuls meets each, and an FAQ with FAQPage data. Every claim on it is one the site
   already makes and the product enforces: k 5 by default, floor 3, no linkage column, data in the EU.
4. **The entity.** The Organization data gains `sameAs` Brønnøysundregistrene and the org.nr. as its
   identifier.
5. **Ship:** gates, push, IndexNow, and a live check of the pages, sitemap and llms.txt.

### Phase 1b: the content audit, shipped 2026-10-14 (D-282)

`npm run seo:audit` measures every public page the way a search engine and an AI answer read it, and
`docs/marketing/content-audit-2026-10-14.md` is its first report. What the 28-day data showed: the queries that reach
positions 2–11 are questions, and the pages rank where a section answers the question asked. So the sections now ask:
in 24 articles the headings put the question they answer, the pulse and anonymity articles answer the two observed
questions in their first sentence, eight factor articles cite a third source, five titles fit a result page, two H1s
ask, and the «which tool» page is linked from the five industry pages and /sikkerhet. The rules are held by tests.

### Phase 1c: the QPSNordic template page, shipped 2026-10-14 (D-283)

The first page Google sent a visitor to was the QPSNordic 34+ template, at 299 words. It now says what the instrument
is (129 questions, 26 scales, the four institutes, the Nordic Council of Ministers), what the short version is, shows
the 37 items themselves under their answer scales – drawn from the file the Word and Excel are built from, so page and
files cannot disagree – and answers, section by section, how to score, what the manual requires, whether it may be
used freely, and how far it covers chapter 1A. Six FAQ items carry FAQPage data; the sources are linked. The title
serves «medarbeiderundersøkelse mal» besides the instrument's name. Every fact is from STAMI's publication page, the
SND catalogue entry or the manual Tor holds (X-107); nothing is from memory.

### Phase 2: next 2–6 weeks

0. **Run the audit weekly** with the Search Console export (`--sc`), and act on its flags before adding pages.
1. **Sentral measurement** (needs push access to `torlambrechts-sketch/Owntheagenda_Admin`):
   - a tracked keyword list with the § 4 map's target pages, showing position over time per target;
   - an «AI» row in Channels: chatgpt.com, perplexity.ai, gemini.google.com, copilot.microsoft.com,
     claude.ai, and `utm_source=chatgpt.com`;
   - the funnel's step-4 label, already open.
2. **The questions article** («medarbeiderundersøkelse spørsmål», 44):
   - more example statements per factor, as a list;
   - a clearer link to the free questionnaire template;
   - a short answer to «hvor mange spørsmål».
3. **Bygg:** «språkkrav byggherreforskriften» is already at 11 on the question page. Give it its own
   section and anchor.
4. **The monthly AI prompt panel** (§ 7), first run when phase 1 has been indexed (about 2 weeks).
5. **Read the data again.** At about 300 impressions a week, decide per page: rewrite, merge or leave.
   Two candidates to merge if they keep competing: /lovkrav with «Krav til kartlegging», and /verneombud
   with «Verneombudets rolle».

### Phase 3: 1–6 months

1. **Authority work** (§ 6), steadily: one or two good links a month beats a burst.
2. **Original data.** The one asset no competitor can copy is Orgpuls's own aggregate: national figures
   per factor across organisations.
   - This is a product decision for Tor.
   - It must keep k-anonymity across organisations, not just within one.
   - It needs enough organisations to say anything.
   - Not before there is real data. Never a made-up benchmark.
3. **A page per factor × industry,** only where Search Console shows demand. Never generated in bulk.
4. **The same playbook for Empvibe (UK) and se.orgpuls.com,** once each has 4–6 weeks of Search Console
   data.

## 6. Tor's list: off-site authority and entity

The site cannot do these itself. In rough order of value per hour:

1. **Vendor profiles that AI engines read for «best tool» answers:** Capterra, GetApp and Software Advice
   (one Gartner listing covers all three), G2, and the Norwegian startup and SaaS directories. Use the
   same name, description and URL everywhere.
2. **The LinkedIn company page.** Send me the URL and it goes into `sameAs`. Post each new article with a
   one-line takeaway.
3. **Partners who link:**
   - bedriftshelsetjenester and HMS consultants;
   - accounting firms that advise small businesses.
   An «anbefalt verktøy» page or a co-written article is a real link from a relevant site.
4. **Expert commentary on the 2026 rules** (forskriften kapittel 1A) to HR and HMS media and newsletters:
   - HR Norge, Ledernett and the trade unions' member magazines;
   - regional business papers.
   It is a timely topic, and we have the most complete public write-up of it.
5. **The free templates** (/maler) as the reason to link. Offer them to HMS forums, LinkedIn groups and
   newsletters.
6. **Reviews from customers on G2/Capterra, once there are customers.** Never written by us.

## 7. Measurement

**Weekly, in Sentral (SEO › Keywords and Channels):**
- impressions, clicks and average position for each § 4 target query, and its ranking page (does it match
  the map?);
- the number of target queries in the top 10;
- visits by channel, including AI referrals.

**Monthly AI prompt panel.** Ask each of ChatGPT (search on), Perplexity, Google (AI Mode or AI Overview)
and Copilot these questions in Norwegian, in a logged-out or private session. Record per answer: Orgpuls
named (y/n), orgpuls.com cited (y/n, which URL), and which competitors are named.
1. Hvilken plattform tilbyr anonym medarbeiderundersøkelse i Norge?
2. Hva er det beste verktøyet for anonyme pulsundersøkelser?
3. Er medarbeiderundersøkelse lovpålagt?
4. Hvordan gjør man en arbeidsmiljøkartlegging?
5. Hva krever forskriften om psykososialt arbeidsmiljø fra 2026?
6. Hvilke spørsmål bør være med i en medarbeiderundersøkelse?
7. Hva er verneombudets rolle i kartleggingen av det psykososiale arbeidsmiljøet?
8. Hvordan sikrer man anonymitet i en medarbeiderundersøkelse i en liten bedrift?
9. Hvor ofte bør arbeidsmiljøet kartlegges?
10. Finnes det et gratis verktøy for arbeidsmiljøundersøkelse?
11. Hvordan gjør man en risikovurdering av det psykososiale arbeidsmiljøet?
12. Hva er forskjellen på medarbeiderundersøkelse og trivselsundersøkelse?

Keep the answers in `docs/marketing/ai-panel/<YYYY-MM>.md`. One run is anecdote; the trend over months is
the signal.

**Goals, not forecasts,** for 2026-12-31:
- every § 4 cluster ranks on its target page;
- at least 5 target queries in the top 10;
- clicks every week;
- Orgpuls named in at least 2 of the 12 panel questions by at least one engine.

A young domain moves in months. Judge phase 1 no earlier than 4–6 weeks after it is indexed.

## 8. Rules this strategy keeps

- Articles inform and do not sell (D-235). Lovkrav and Verneombud are informational (D-236). Product claims
  live on product pages.
- Every factual claim has a source or is something the product enforces. No invented numbers, customers,
  reviews or rankings.
- No respondent data is ever used in marketing. Any aggregate (phase 3) is k-anonymous across organisations
  and is Tor's decision.
- Every new page ships in Norwegian and English with its share card, and in the sitemap, llms.txt and
  IndexNow.
