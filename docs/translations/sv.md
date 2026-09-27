# Swedish (sv): the machine draft

348 texts, all translated and independently reviewed; origin *machine*, status *draft* in admin ›
Translations (X-071). Unit numbers (u001…) are the working sheet's, not the product's keys: the
admin export shows each text by its key, bokmål and note.

## Open questions for the human translator

Most important first. The translator and the reviewer each raised these; the reviewer settled the
rest.

1. **Round name «baslinjemätningen {year}»,** which appears in every mail subject, against the plainer «huvudmätningen {year}». Both work in every sentence.
2. **«forsvarlig»** rendered as «säker omsorg» (a Norwegian legal standard with no Swedish counterpart). The alternatives are «god och säker omsorg», or «säker bemanning».
3. **«pedagoger»** in Swedish preschools can mean all staff (u092).
4. **«Chefen»** is capitalised mid-sentence when it stands in for a manager's name, as the bokmål «Lederen» is.
5. **Factor names:** «Yttrandeklimat» and «Oförenliga krav» (the QPSNordic terms) against the plainer «Klimat för att säga ifrån» and «Motstridiga krav».
6. **Agreement scale** «Tar helt avstånd … Instämmer helt», and the short midpoint «Varken eller».
7. **Legal references in notes:** AFS 2015:4 and AFS 1993:2 were replaced by the new AFS series on 1 January 2025.

## The translator's glossary and decisions

### Swedish (sv) glossary — Orgpuls employee survey

Norms: Svenska skrivregler (Språkrådet), Myndigheternas skrivregler / klarspråk, Microsoft's Swedish
localization style guide for interface conventions. Terms from the official Swedish QPSNordic
(Arbetslivsinstitutet, Arbetslivsrapport 2000:19) wherever the concept is the same.

### Register and typography

| Decision | Choice | Why |
|---|---|---|
| Address | **du**, lower case | Swedish norm for all modern surveys and UI (Microsoft style guide). |
| Quotation marks | **”…”** (U+201D both sides) | Swedish typographic norm (Svenska skrivregler). Used around `{factor}` in running text. |
| Dash | spaced en dash **" – "** | Svenska skrivregler; replaces nb's em dash. Never in SMS (not GSM-7). |
| Ellipsis | **…** with a space before it where nb has one ("Skriv här …") | Keeps the placeholder look of the source. |
| Comma after an initial subordinate clause | used where nb has one and the clause is long | Allowed by Svenska skrivregler; helps reading on a phone. |
| Dates | "den {date}" in running text, bare "{date}" after a colon | Myndigheternas skrivregler ("den 12 oktober"). |
| i morgon, i stället | written apart | Myndigheternas skrivregler. |

### Scales (one set each, used everywhere)

| nb | sv | Why / rejected alternative |
|---|---|---|
| Helt uenig / Litt uenig / Verken eller / Litt enig / Helt enig | **Tar helt avstånd / Tar delvis avstånd / Varken eller / Instämmer delvis / Instämmer helt** | The established Swedish bipolar agreement scale (ESS/WVS Sweden; QPSNordic's Swedish commitment items q109–111 use "tar … avstånd / instämmer"). Rejected: "Helt oenig … Helt enig" (mirrors nb, but "oenig" is not idiomatic for one person's view) and "Instämmer inte alls … Instämmer helt" (unipolar). Midpoint "Varken eller" mirrors nb "Verken eller"; fuller alternative "Varken instämmer eller tar avstånd". |
| Svært usannsynlig / Lite sannsynlig / Kanskje / Sannsynlig / Svært sannsynlig | **Mycket osannolikt / Osannolikt / Kanske / Sannolikt / Mycket sannolikt** | Symmetric; neuter agrees with "Hur sannolikt är det …". Literal "Inte särskilt sannolikt" for "Lite sannsynlig" rejected for symmetry. |
| Ja / Nei / Vet ikke / Vil ikke svare | **Ja / Nej / Vet inte / Vill inte svara** | Standard Swedish survey options. |
| Ikke relevant for meg (not-applicable button under the scale; key added to the catalogue at 15:25) | **Gäller inte mig** | Idiomatic Swedish N/A option; literal alternative "Inte relevant för mig". |

### Terms

| nb | sv | Why |
|---|---|---|
| leder (the respondent's line manager) | **chef**; in the core statements **min närmaste chef** | QPSNordic q73, q75, q78 "närmaste chef". UI texts: "din chef", "chefen". Never "ledare". |
| Lederen (fallback for `{name}`) | **Chefen** (capitalised) | Works as greeting ("Hej Chefen,"), subject, object and sentence-initially; "din chef" fails in "Hej din chef,". |
| ledelsen | **ledningen** | QPSNordic q88, q104. |
| kollega(er) | **arbetskamrat(er)** | QPSNordic (q30, q72, scale "Stöd från arbetskamrater"). |
| laget (the work team) | **arbetslaget** | Swedish work-team word in schools, care and construction; "teamet" is an anglicism. |
| nye (new people) | **nya medarbetare** | Bare "nya" is weak as a noun in Swedish. |
| opplæring | **upplärning** | Transparent; "introduktion" is the onboarding alternative. |
| arbeidsmiljø | **arbetsmiljö** | |
| kartlegge arbeidsmiljøet | **kartlägga arbetsmiljön** | Standard Swedish phrase. |
| undersøkelse / medarbeiderundersøkelse | **undersökning / medarbetarundersökning** | "enkät" reserved for the questionnaire itself (not needed here). |
| grunnlinjen {year} | **baslinjemätningen {year}** | "Baseline measurement"; plainer alternative "huvudmätningen {year}". |
| pulsen {year} | **pulsmätningen {year}** | "pulsmätning" is the established Swedish HR term. |
| puls {n} · {year} | **pulsmätning {n} · {year}** | Indefinite, name-like, as in nb. |
| oppfølgingen {year} | **uppföljningen {year}** | |
| "i {org}" in mail subjects/leads | **hos {org}** | Works with any registered name ("hos Lumio AS", "hos Bergen kommune"). |
| anonym / anonymt | **anonym / anonymt** | |
| svar / svare | **svar / svara** | |
| kommentar | **kommentar** | |
| samtale (anonymous conversation) | **samtal** | Plain Swedish; "konversation" is the chat-app alternative. |
| lenke | **länk** | |
| e-post | **e-post** (the medium, address), **mejl** (one message) | Språkrådet accepts "mejl"; how Swedes write. |
| plakat | **affisch** | "plakat" is a false friend (placard). |
| virksomhet (the organisation) | **organisation** | "verksamhet" means operations/unit in Swedish. |
| gruppe | **grupp** | |
| påstand | **påstående** | |
| tall (results) | **siffror** | |
| svarfrist | **sista svarsdag** | |
| melde (an incident) | **rapportera** | Swedish safety usage ("rapportera tillbud"). |
| si fra / melde fra (speak up) | **säga ifrån / säga till** | QPSNordic q85 "säga ifrån". |
| kritikkverdige forhold | **missförhållanden** | Term of the Swedish whistleblower act. |
| vold og trusler | **våld och hot** | AFS 1993:2 "Våld och hot i arbetsmiljön". |
| krenkende atferd | **kränkande beteende** | Mirrors nb; the AFS 2015:4 term "kränkande särbehandling" is narrower. |
| trakassering | **trakasserier** | QPSNordic scale "Mobbning och trakasserier". |
| mobbing | **mobbning** | SAOL main form; QPSNordic scale name. |
| krenkelser | **kränkningar** | |
| opplevd (violence, harassment) | **varit utsatt för** | QPSNordic q31, q83 "blivit utsatt för". |
| utrygg | **osäker** | Safety usage "osäkra handlingar/förhållanden". |
| nestenulykke | **tillbud** | Swedish legal and everyday term. |
| uønskede hendelser | **oönskade händelser** | |
| fremdrift | **framdrift** | Project progress; alternative "tidplan/tempo". |
| tidsplan | **tidplan** | Construction usage. |
| beskjed | **besked** | |
| underentreprenører og andre fag | **underentreprenörer och andra yrkesgrupper** | |
| byggeplass | **byggarbetsplats** | |
| restitusjon | **återhämtning** | |
| turnus | **schema** | Swedish health-care usage ("påverka sitt schema"). |
| vakt | **pass** | "mellan passen", "extrapass", "passbyten". |
| vaktordning | **typ av schema** | |
| todelt / tredelt turnus / fast natt | **tvåskift / treskift / fast natt** | QPSNordic q11 "Två-skiftsarbete / Tre-skiftsarbete / Fast nattskift" in current spelling. |
| brukere og pårørende | **brukare (och patienter) och anhöriga** | Swedish "brukare" does not cover hospital patients; nb "brukere" does. |
| forsvarlig (omsorg, bemanning) | **säker (omsorg)** | No Swedish counterpart to the Norwegian legal standard; "god och säker vård" is the nearest. |
| forflytning | **förflyttning** | Swedish care term. |
| hjelpemidler | **hjälpmedel** | |
| rapport (handover) | **rapport** | Same word in Swedish health care. |
| stilling / stillingsstørrelse | **tjänst / hur stor tjänst** | Plain; formal "tjänstgöringsgrad". |
| barnehage | **förskola** | |
| pedagog (in a list of roles) | **förskollärare** | Swedish title of the qualified preschool teacher. |
| pedagoger (as a group of staff) | **pedagoger** | Covers both kinds of teacher. |
| lærer | **lärare** | |
| fagarbeider / assistent / miljøpersonale | **barnskötare / assistent / annan stödpersonal** | No Swedish title for miljøpersonale. |
| foreldre | **föräldrar** | "vårdnadshavare" is too formal. |
| vikar | **vikarie** | "ta in en vikarie". |
| (vanskelig) sak | **(svårt) ärende** | |
| støy | **buller** (factor), **ljudnivå** (statement) | |
| pause | **paus** | QPSNordic q48. |
| tilrettelegging | **anpassning** | Swedish school usage ("extra anpassningar"). |

### Factor names

| nb | sv | Source |
|---|---|---|
| Ytringsklima | **Yttrandeklimat** | Swedish debate on freedom to speak up; alt. "Klimat för att säga ifrån". |
| Arbeidsmengde og tidspress | **Arbetsmängd och tidspress** | QPSNordic "arbetsmängd". |
| Motstridende krav | **Oförenliga krav** | QPSNordic q43; alt. "Motstridiga krav". |
| Kontakt og kommunikasjon | **Kontakt och kommunikation** | |
| Emosjonelle krav | **Emotionella krav** | Swedish research term. |
| Støtte fra leder | **Stöd från chef** | QPSNordic scale 7.1. |
| Medvirkning og kontroll | **Delaktighet och kontroll** | |
| Integritet og verdighet | **Integritet och värdighet** | |
| Rolleklarhet | **Rolltydlighet** | QPSNordic scale 3.1. |
| Støtte fra kollegaer | **Stöd från arbetskamrater** | QPSNordic scale 7.2. |
| Anerkjennelse og mening | **Uppskattning och meningsfullhet** | QPSNordic q78 "uppskattning", q28 "meningsfullt". |

"Orgpuls" is never translated.

## The reviewer's log

### Swedish (sv) review log (TRAPD step "R")

I reviewed all 290 units against the bokmål, with the English as a reference and the Swedish
QPSNordic questionnaire for terms. I changed three units. Each is in `targets-z-review.json`,
which overrides the translator's files. The bokmål is given for each change so it can be
re-keyed if the unit ids ever move.

**Warning:** `rekey.sh` deletes every `targets*.json`, this file's companion included, before it
rewrites the translator's files. If it is run again, re-apply these three changes.

### Changes

### u142 (module, Bygg og anlegg BA-NU-3): accuracy (intensity)
- nb: "Man får tid til å lære en ny oppgave skikkelig før det forventes tempo"
- before: "Man får tid att lära sig en ny uppgift ordentligt innan det krävs tempo"
- after: "Man får tid att lära sig en ny uppgift ordentligt innan man förväntas hålla tempot"
- reason: nb "forventes" means *expected*, but "krävs" means *required*, which is stronger.
  The brief requires the same intensity. "innan man förväntas hålla tempot" is also more
  idiomatic than "det krävs tempo" here. This is a judgement call, and the unit's note says so.

### u169 (module, Helse og omsorg HO-BF-2): grammar
- nb: "Jeg slipper å gå hjem med dårlig samvittighet for det jeg ikke rakk"
- before: "Jag slipper gå hem med dåligt samvete för det jag inte hann"
- after: "Jag slipper gå hem med dåligt samvete för det jag inte hann med"
- reason: "hinna" takes either an infinitive or "med" + object. "det jag inte hann" is a
  truncated colloquial form, while "det jag inte hann med" is the standard phrase.

### u219 (ui, respond.invalidLead): grammar and typography, plus naturalness
- nb: "Lenken er brukt opp, utløpt eller feil. Har du allerede svart, er svaret registrert — du kan ikke svare igjen."
- before: "Länken är förbrukad, har gått ut eller är fel. Har du redan svarat är ditt svar registrerat – du kan inte svara igen."
- after: "Länken har använts, har gått ut eller är fel. Har du redan svarat, är ditt svar registrerat – du kan inte svara igen."
- reason: (1) Comma after the inverted conditional clause. The source has one, and every other
  inverted conditional in the draft has one (u233, u246, u285). Without it the clause is easy
  to misparse. (2) Judgement call: "förbrukad" is the word for consumables and quotas. For a
  one-time link, "har använts" is the plain B1 form and is what Swedish error messages say.
  The note says so, so the human can revert it.
