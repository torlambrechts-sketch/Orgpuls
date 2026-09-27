# Danish (da): the machine draft

348 texts, all translated and independently reviewed; origin *machine*, status *draft* in admin ›
Translations (X-071). Unit numbers (u001…) are the working sheet's, not the product's keys: the
admin export shows each text by its key, bokmål and note.

## Open questions for the human translator

Most important first. The translator and the reviewer each raised these; the reviewer settled the
rest.

1. **«Indflydelse og kontrol»:** «kontrol» can read as being monitored. The alternatives are «Medindflydelse og kontrol» and COPSOQ's «Indflydelse på eget arbejde».
2. **«Ytringsklima»** against the plain «Frihed til at sige fra».
3. **Round name «basismålingen {year}»** against «hovedmålingen».
4. **Shift options** «Toholdsskift / Treholdsskift» (the reviewer's change) against «Dag- og aftenvagter» / «Skiftende vagter med nat».
5. **The pre-written e-mail opens «Til {name}»**, the one form that works with both a name and the fallback «lederen». It is stiffer than «Hej …».
6. **Terms for Danes working in Norway:** «brugere» / borgere / patienter, «vagtplan» / turnus, «hold» / sjak.

## The translator's glossary and decisions

### Danish (da) glossary — Orgpuls employee survey

Decided before translating and followed throughout. Norms: Dansk Sprognævn (Retskrivningsordbogen),
klarsprog, Microsoft's Danish style guide for interface conventions. Terminology follows
Arbejdstilsynet and NFA (COPSOQ / Dansk Psykosocialt Spørgeskema) where they have a term.

### Conventions

| Topic | Decision | Why |
|---|---|---|
| Register | **du / dig / din**, lower case | Danish workplace norm; matches the Norwegian source. |
| Comma | **No start comma** (no comma before a subordinate clause); comma after a fronted or embedded subordinate clause, between main clauses joined by og/men, and before loosely attached additions (", også når …", ", heller ikke når …") | Dansk Sprognævn's recommended system, used consistently. |
| Quotation marks | **»…«** | Established Danish typographic quotes. Used around `{factor}` mid-sentence (e-mail subject and body). |
| Dash | spaced en dash **" – "** | Danish norm; replaces the source's em dash. |
| Ellipsis | single character **…**, with a space before it as in the source ("Skriv her …") | Danish marks an unfinished utterance with a space before the dots. |
| Colon | lower case after a colon | Dansk Sprognævn's normal rule; capital is optional only. |
| Imperatives (buttons) | Kopiér, Næste, Spring over, Indsend, Send, Svar nu | Microsoft Danish style (accent on imperatives of -ere verbs: *Kopiér*). |
| SMS | GSM-7 only: no en dash, curly quotes, ’ or … | Any of those switches the whole SMS to UCS-2 (70 characters). æ ø å é are GSM-7. |
| "nok" = enough | **postposed** ("tid nok", "folk nok") or **"tilstrækkelig"**, never "nok" before the noun or verb | Danish "nok" before a noun/after a verb also means "probably": "Jeg har nok tid" = "I probably have time". |
| Gender | no gendered forms needed; plural predicative adjectives agree with "vi" ("vi er bekymrede") | Danish first/second person has no gender marking. |

### Terms

| Norwegian | Danish | Why |
|---|---|---|
| leder (the respondent's line manager), in statements | **min nærmeste leder** | The standard Danish survey term (COPSOQ, APV) for the immediate superior; removes ambiguity in a measured item. |
| lederen din (in page texts) | **din leder** | Short and natural in the promises and the done page. |
| Lederen (fallback for an unknown manager name, `contact.someone`) | **lederen** (lower case) | The only form that works mid-sentence, in the heading (rebuilt so `{name}` is not first) and in the e-mail's first line (rebuilt as "Til {name}"). |
| ledelsen | **ledelsen** | Same word. |
| kollega / kollegaer | **kollega / kolleger** | "kolleger" is the standard plural (COPSOQ: "Social støtte fra kolleger"). |
| arbeidsmiljø | **arbejdsmiljø** | Same concept (arbejdsmiljøloven). |
| kartlegge arbeidsmiljøet | **kortlægge arbejdsmiljøet** | APV vocabulary ("kortlægning"). |
| undersøkelse / medarbeiderundersøkelse | **undersøgelse / medarbejderundersøgelse** | Standard. |
| runde: grunnlinjen {year} | **basismålingen {year}** | "Grundlinje" is not used of surveys in Danish; "måling" is the everyday word for workplace surveys (trivselsmåling, pulsmåling). Alternative: "hovedmålingen". |
| runde: pulsen {year} / puls {n} · {year} | **pulsmålingen {year} / pulsmåling {n} · {year}** | "Pulsmåling" is established Danish for a short follow-up survey. |
| runde: oppfølgingen {year} | **opfølgningsmålingen {year}** | Transparent; "opfølgningen" alone is too vague as a survey name. |
| i {org} (round at an organisation) | **hos {org}** | "hos" works for companies and municipalities alike ("hos Lumio AS", "hos Bergen kommune"). |
| anonym / anonymt | **anonym / anonymt** | Same. |
| svar / svare | **svar / svare (på)** | Same; "besvare" avoided as more formal. |
| kommentar | **kommentar** | Same. |
| samtale (anonymous thread between employee and management) | **samtale** | Same; neutral. |
| lenke | **link** (neuter: *linket*, *det*) | Danish standard (RO, Microsoft). |
| e-post | **e-mail** (common gender: *e-mailen*, *den*) | Danish standard. |
| virksomhet (the organisation) | **virksomhed** | Also the generic legal term in the Danish Working Environment Act, used for public workplaces too. |
| gruppe | **gruppe** | Same. |
| påstand (a Likert statement) | **udsagn** | Danish survey term; "påstand" means "claim" (not used in the texts). |
| svar (plural, after a number) | **svar** | Invariable plural, so "{threshold} svar" works for any number. |
| Vold og trusler | **Vold og trusler** | Same (Arbejdstilsynet: "vold og trusler om vold"). |
| krenkende atferd | **krænkende handlinger** | Arbejdstilsynet's statutory term (includes mobning and seksuel chikane). |
| trakassering | **chikane** | Danish term ("seksuel chikane"). |
| mobbing | **mobning** | Danish form. |
| turnus | **vagtplan** | Everyday Danish for the shift rota; Danish "turnus" mostly means rotation/internship. |
| todelt / tredelt turnus | **to-skift / tre-skift** | Standard Danish shift vocabulary. |
| vakt / ekstravakt / vaktbytte | **vagt / ekstravagt / vagtbytte** | Danish forms. |
| nestenulykke | **nærved-ulykke** | Arbejdstilsynet / BAR Bygge & Anlæg usage (also written "nærvedulykke"). |
| uønsket hendelse | **uønsket hændelse** | Danish industry/construction term. |
| brukere og pårørende | **brugere og pårørende** | Generic term covering patients, residents and clients; also matches the Norwegian "brukere" these employees hear at work. Municipal Danish care would say "borgere". |
| forflytning | **forflytning** | Danish health-care term (same word). |
| forsvarlig (omsorg, bemanning) | **forsvarlig** | Danish "fagligt forsvarlig". |
| rapport (handover) | **rapport** | Danish nursing word for the handover report. |
| barn / elever | **børn / elever** | Kindergarten and school wordings kept apart as in the source. |
| pedagog | **pædagog** (and "lærere" named explicitly where the school is meant) | Danish "pædagog" in a school means non-teaching staff. |
| fagarbeider, assistent, miljøpersonale | **pædagogisk assistent, medhjælper, støttepersonale** | Danish job categories (PAU-uddannet assistent ≈ fagarbeider; pædagog-/lærermedhjælper ≈ assistent; støttepersonale ≈ miljøpersonale). |
| personalet | **personalegruppen** | Danish daycare/school usage. |
| særskilte behov | **særlige behov** | Standard Danish. |
| spesialpedagogisk | **specialpædagogisk** | Danish form. |
| laget (work team) | **holdet** | Neutral across sectors; construction's "sjakket" noted as an alternative. |
| nye (new staff) | **nyansatte** | Danish needs a noun; "Nye" alone is elliptic. |
| underentreprenører og andre fag | **underentreprenører og andre fag** | "fag" = trade, as used on Danish building sites. |
| stillingsstørrelse | **antal timer** / **Hvor stor er din stilling?** | No Danish noun "stillingsstørrelse"; hours are the everyday measure. |
| heltid / deltid | **fuld tid / deltid** | RO spelling. |
| kritikkverdige forhold | **kritisable forhold** | Danish term. |
| faglig skjønn | **fagligt skøn** | Danish term. |
| står i forhold til nytten | **står mål med nytten** | Danish idiom. |
| unntaket og ikke normalen | **undtagelsen og ikke reglen** | Danish idiom. |
| til å leve med / til å håndtere | **til at leve med / til at håndtere** | Same idiom in Danish. |
| over tid | **i længden** | Native Danish for "in the long run". |

### Answer scales and fixed options

| Norwegian | Danish | Why |
|---|---|---|
| Helt uenig / Litt uenig / Verken eller / Litt enig / Helt enig | **Helt uenig / Delvis uenig / Hverken enig eller uenig / Delvis enig / Helt enig** | The standard Danish agreement scale; symmetric, neutral midpoint. Rejected: literal "Lidt uenig / Lidt enig" (unusual in Danish surveys) and elliptic "Hverken eller". |
| Svært usannsynlig / Lite sannsynlig / Kanskje / Sannsynlig / Svært sannsynlig | **Meget usandsynligt / Usandsynligt / Måske / Sandsynligt / Meget sandsynligt** | Neuter to agree with "Hvor sandsynligt er det …"; "svært" is a false friend (Danish = difficult). |
| Ja / Nei / Vet ikke / Vil ikke svare | **Ja / Nej / Ved ikke / Vil ikke svare** | One wording everywhere. |
| Ikke relevant for meg (sixth button below the scale: "does not apply to my job") | **Ikke relevant for mig** | Standard Danish survey wording; distinct from the midpoint and from "Spring over". Alternative: "Gælder ikke for mig". |

### Factor names (core)

| Norwegian | Danish |
|---|---|
| Ytringsklima | **Ytringsklima** (established Danish; alternative "Frihed til at sige fra") |
| Arbeidsmengde og tidspress | **Arbejdsmængde og tidspres** |
| Motstridende krav | **Modstridende krav** |
| Kontakt og kommunikasjon | **Kontakt og kommunikation** |
| Emosjonelle krav | **Følelsesmæssige krav** (COPSOQ) |
| Støtte fra leder | **Støtte fra nærmeste leder** (COPSOQ: "Social støtte fra nærmeste leder") |
| Medvirkning og kontroll | **Indflydelse og kontrol** (control over one's own work, as in "krav-kontrol-modellen") |
| Integritet og verdighet | **Integritet og værdighed** |
| Rolleklarhet | **Rolleklarhed** (COPSOQ) |
| Støtte fra kollegaer | **Støtte fra kolleger** |
| Anerkjennelse og mening | **Anerkendelse og mening** (COPSOQ: "Anerkendelse", "Mening i arbejdet") |

"Orgpuls" is never translated.

## The reviewer's log

### Danish (da) review log: TRAPD step "R"

The independent reviewer read all 290 units against the bokmål, with the English as a reference. The reviewer
also read the code that renders the texts: `RespondFlow.tsx`, `RespondentThread.tsx`, `ThreadLinks.tsx`,
`lib/respond/questions.ts` and `supabase/functions/_shared/mail.ts`. Every placeholder host sentence was
filled with every value the code can insert:
- all four round names, in all eight mail sentences that take `{round}`, including the capitalised start
  of `sistePaminnelse.lead`;
- `{org}` as "Lumio AS" and as "Bergen kommune";
- `{date}` as "12. oktober";
- `{factor}` in `thread.about` (upper case) and in `contact.subject` / `contact.mailBody`;
- `{name}` in `contact.title`, `body`, `cta` and `mailBody`, both as "Anne Hansen" and as the fallback
  "lederen".

Every combination reads correctly.

The draft is strong. Its comma system is consistent: no comma at the start of a subordinate clause, a
comma after one that comes first or is inserted. The glossary is followed across modules and across the
barnehage and skole wordings. Postposed "nok" and "tilstrækkelig" are used throughout, so no statement
can read as "probably". Polarity and quantifiers are kept. The texts use no gendered forms, and all four
SMS texts are GSM-7 and fit in one part.

Changes are in `targets-z-review.json`, which overrides the translator's files. Check after merging:
**0 errors**. The three WARNs are deliberate:
- u248: the trailing blank lines are the source's.
- u250: the fallback is lower case on purpose.
- u252: the heading was rebuilt so that `{name}` is not first.

### Changes

| Unit | Before → After | Reason | Category |
|---|---|---|---|
| u060 (BS-VT-1, kindergarten) | "… når et barn bliver **voldelig** eller truende" → "… når et barn bliver **voldeligt** eller truende" | A predicative adjective agrees with a neuter subject in written Danish ("barnet er voldeligt"). u059, the combined wording, keeps "voldelig", which agrees with the nearer "en elev". u061 ("en elev") is correct as it stands. | grammar |
| u193 (HO-S-vaktordning o2) | "To-skift (dag og aften)" → "Toholdsskift (dag og aften)" | "toholdsskift" is the established Danish term, used in collective agreements and job ads. The hyphenated "To-skift" is not standard spelling: a spelled-out numeral is not joined to its noun with a hyphen. Judgement call, noted on the unit. | naturalness (terminology) |
| u194 (HO-S-vaktordning o3) | "Tre-skift (med nat)" → "Treholdsskift (med nat)" | Same reason as u193. | naturalness (terminology) |
| u161 (factor "Turnus og hvile") | Text unchanged ("Vagtplan og hvile"). The note now says "toholdsskift" and "treholdsskift" instead of "to-skift" and "tre-skift". | Keeps the note true after u193 and u194. | other (note only) |
| u272 (`mail:automatic`) | "… på vegne af {org}. Svar på den når ikke frem." → "… på vegne af {org}. Den kan ikke besvares." | "Den kan ikke besvares" is the standard Danish no-reply line. The literal version first reads as the imperative "Svar på den" (reply to it). It also reuses "svar", the word these same mails use for survey answers ("Dit svar er anonymt", "Svar nu"). The meaning is unchanged: do not reply. Judgement call, noted on the unit. | naturalness |

**Glossary deviations**
- The glossary's "todelt / tredelt turnus → to-skift / tre-skift" is replaced by **toholdsskift /
  treholdsskift**.
- The glossary avoids "besvare" as too formal for answering the survey. The footer uses "besvares" on
  purpose: it is the fixed no-reply formula, and the different verb separates replying to the e-mail from
  answering the survey. The survey texts still use "svare (på)" throughout.

### The translator's open questions: settled (kept as drafted)

- **u001** "sige fra over for kritisable forhold": the Danish idiom, used in exactly this whistleblowing
  sense. "gøre opmærksom på" would weaken it to "point out".
- **u003** "ikke på gangen bagefter": "snak på gangen/gangene" is established Danish for talk behind
  people's backs.
- **u062** "handlerum": standard vocabulary for the pedagogical staff who answer this module.
- **u092** "pædagoger, lærere og andre ansatte": the one unit serves all three wordings. In a Danish school,
  "pædagoger" alone would exclude the teachers, so naming "lærere" is necessary. In the kindergarten
  wording the extra word does no harm.
- **u111** "medhjælper": covers both pædagogmedhjælper and lærermedhjælper in the combined module.
- **u118 and module** "holdet", not "sjakket": consistent with core u030 ("en del af holdet"), used on
  building sites too, and understood across trades. "Sjak" belongs to particular trades and piecework
  teams.
- **u163** "brugere": the readers work in Norway and hear "brukere" every day. "borgere" and "patienter"
  are narrower.
- **Unit-specific wording:**
  - u174: "ansat til det antal timer"
  - u196: "Anbefaling"
  - u197: "Åbent spørgsmål"
  - u198: "Krænkende handlinger", Arbejdstilsynet's statutory term
  - u203: "Støtte fra nærmeste leder"
  - u217: "Helhedsindtryk"
  - u242: "Indsend"
  - u279: "hos {org}"
  - u290: "Ikke relevant for mig"
- **Scale u234–u238**: Helt uenig / Delvis uenig / Hverken enig eller uenig / Delvis enig / Helt enig. This
  is the standard Danish agreement scale, symmetric with a true midpoint.
- **Contact flow u248, u250, u252**: "lederen" as the fallback, "Til {name}" as the e-mail's first line, and
  the heading rebuilt as "Du er inviteret til at tale direkte med {name}". The placeholder forces these
  choices and both values read correctly:
  - "Hej lederen," and "Kære lederen" do not work.
  - "din leder" fails in the e-mail, which the respondent writes to the manager.
  - A heading that starts with `{name}` would begin with a lower-case letter.

Also checked and kept, with no note needed:
- **"meldt" / "melder"** for the Norwegian "meldt" / "melder" (u103–u105, u127, u149, u167, u189):
  consistent, and natural for Danes who work with "melde avvik". "indberettet" and "registreret" are
  possible alternatives.
- **u113** "Hvor stor er din stilling?"
- **u044** "Vil ikke svare"
- **u014 and others** "svær/svære" in the sense "difficult".

### Left for the human translator (most important first)

1. **u204 "Indflydelse og kontrol"** (factor label; also in "Om {factor}" and in the e-mail subject). In
   everyday Danish, "kontrol" at work can read as monitoring. The alternatives are "Medindflydelse og
   kontrol" and COPSOQ's "Indflydelse på eget arbejde". A validated-instrument label, so a human decision.
2. **u209 "Ytringsklima"** (factor label). It exists in Danish but is abstract for about B1. The plain
   alternative is "Frihed til at sige fra".
3. **u266 round name "basismålingen {year}"**, which appears in every mail subject. The alternative is
   "hovedmålingen {year}". It should match whatever a future Danish admin interface calls the round.
4. **u193 and u194 shift options** (reviewer's change). A health-sector reviewer may prefer plain wording
   without the shift terms: "Dag- og aftenvagter" and "Skiftende vagter med nat".
5. **u248 "Til {name}"** as the pre-written e-mail's opening line. It is the one form that works with both
   values, but it is stiffer than "Hej …". The respondent can edit it before sending.
