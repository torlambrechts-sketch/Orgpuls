# Lithuanian (lt): the machine draft

348 texts, all translated and independently reviewed; origin *machine*, status *draft* in admin ›
Translations (X-071). Unit numbers (u001…) are the working sheet's, not the product's keys: the
admin export shows each text by its key, bokmål and note.

## Open questions for the human translator

Most important first. The translator and the reviewer each raised these; the reviewer settled the
rest.

1. **Greeting «Sveiki, {name},»:** the code cannot put a name in the vocative, so Lithuanian names print in the base form («Tomas» for «Tomai»). The alternative is to use the greeting without a name for Lithuanian, which is a product change.
2. **Answer scale:** «Greičiau nesutinku / Greičiau sutinku» could replace «Iš dalies…», since both «Iš dalies» answers describe partial agreement.
3. **«kolega iš vadovybės»** is the fallback for an unknown manager, chosen because it reads correctly in the greeting.
4. **Factor names:**
  - «Pagarba ir orumas» (Integritet og verdighet), plain rather than legal;
  - «Galimybė kalbėti atvirai»;
  - «Pareigų aiškumas»;
  - «Dalyvavimas ir įtaka».
5. **SMS:** reminders reach 3 parts with organisation names of about 14 characters. They depend on `{date}` ending in «d.».
6. **Terms:**
  - «paslaugų gavėjai» / klientai;
  - «komanda» / brigada;
  - «pulso apklausa»;
  - «papildoma apklausa»;
  - «Man tai neaktualu».

## The translator's glossary and decisions

### Lithuanian (lt) glossary — Orgpuls employee survey

Norms: VLKK recommendations and Kalbos patarimai (no "pas mus" for "at our workplace", no
"iš … pusės" for an agent, no "apmokyti", no "kaip" in the "as a …" capacity sense, no "pilnai");
Microsoft Lithuanian style guide for interface conventions. Quotation marks „…“, spaced dash " – ",
ellipsis "…" attached to the word. Lithuanian punctuation, not Norwegian: no comma before a single
"ir" joining clauses; comma before "o".

### Register and form

| Decision | Choice | Why |
|---|---|---|
| Address in the survey pages | "jūs", lower case (capital only at sentence start) | VLKK/Microsoft: interface text uses lower case. |
| Address in the e-mails and SMS (all `mail:*` units) | Courtesy capital "Jūs / Jūsų / Jums / Jus" | VLKK allows it in letters to one addressee, and Lithuanian employer, bank and public-sector mail uses it; every mail and SMS here goes to one named person. Applied in every mail unit. The pre-written e-mail to the manager (`contact.mailBody`) is a letter too; its only "Jūs" is sentence-initial. |
| Buttons | Infinitive: "Toliau", "Praleisti", "Pateikti", "Siųsti", "Kopijuoti nuorodą", "Atidaryti pokalbį", "Rašyti el. laišką", "Atsakyti dabar" | Microsoft Lithuanian convention for commands; one form everywhere. |
| Instructions, placeholders | Polite imperative: "Rašykite čia…", "Bandykite dar kartą", "Išsaugokite nuorodą" | Text addressed to the reader. |
| Gender neutrality | Verbs, nouns, adverbs, impersonal forms. Never an adjective or participle in a predicate about the respondent (no "esu patenkintas", "likau vienas", "pats", "nebijodamas"). | Anonymity. Lithuanian verbs carry no gender. |
| Third persons | Generic masculine where it is the norm ("vadovas", "darbuotojai", "pavaduojantys darbuotojai") | Brief allows generic forms for third persons. |
| Numbers 5–10 (`{threshold}`, `{k}`) | Genitive quantity construction: "kai atsakiusiųjų yra bent {threshold}", "kuriose atsakymų yra bent {threshold}" | No noun agrees with the number (5–9 would need "žmonės", 10 "žmonių"). "atsakiusiųjų" (gen. pl.) is the same for both genders. |
| `{minutes}` | "apie {minutes} min." | Invariable abbreviation. |
| `{date}` (lt: "spalio 12 d.") | Placed where its own "d." ends the sentence; no extra full stop after it | Otherwise "12 d.." |
| `{org}` | Nominative subject ("{org} kviečia…"), after a comma or colon, "iš {org}", "{org} vardu" | Registered Norwegian names ("Lumio AS", "Bergen kommune") are indeclinable foreign names in Lithuanian. |
| `{factor}` | "Tema: {factor}" (pill); „{factor}“ after a declined noun: "apie temą „{factor}“" | A quoted title stays nominative after a declined generic noun. |
| `{name}` (contact, manager) | Always a nominative slot: subject ("Su jumis norėtų tiesiogiai pasikalbėti {name}", "…laišką, kurį gaus {name}") or after a colon | A name cannot be declined by the code. |
| `{name}` fallback (`contact.someone`) | "kolega iš vadovybės" (lower case) | "kolega" is common-gender and its vocative equals its nominative, so the fallback also works in the greeting "Sveiki, kolega iš vadovybės,". "vadovas" fails there (vocative "vadove"). All slots are mid-sentence, so lower case. |
| Greeting | "Sveiki, {name}," / "Sveiki," | "Sveiki" is neutral and friendly. The name stays nominative because the code cannot make a vocative. Norwegian names in their original spelling are normally left undeclined anyway. |

### Terms

| Norwegian | Lithuanian | Why / notes |
|---|---|---|
| leder (respondent's line manager) | vadovas ("mano vadovas", "jūsų vadovas") | Generic masculine, the norm. |
| ledelsen (management) | vadovybė | Also the thread's label for management's messages. |
| kollega | kolega (pl. kolegos) | Common gender. |
| arbeidsmiljø | darbo aplinka | Term used in Lithuanian labour and safety law. |
| undersøkelse / medarbeiderundersøkelse | apklausa / darbuotojų apklausa | |
| runde: grunnlinje | "{year} m. pagrindinė apklausa" (main survey) | The yearly full survey. "bazinė apklausa" is the research term but opaque to B1 readers. |
| runde: puls | "{year} m. pulso apklausa"; numbered: "{year} m. pulso apklausa Nr. {n}" | "Pulso apklausa" is an established Lithuanian HR term. "Nr." avoids ordinal endings ("3-ioji" vs "2-oji"). Alternative: "trumpoji apklausa". |
| runde: oppfølging | "{year} m. papildoma apklausa" (additional survey) | One factor in depth, as needed. Alternative: "tikslinė apklausa". |
| (round names in sentences) | Nominative only: "vyksta {round}", "Rytoj baigiasi {round}", "…: {round}, {org}" | Never after a preposition ("į {round}" would need the accusative). Also works for the future `forvarsel` and `resultat` mails. |
| anonym / anonymt | anonimiškas (predicate), anonimiškai (adverb) | "Jūsų atsakymas anonimiškas", "atsakykite anonimiškai". |
| svar / svare | atsakymas / atsakyti | "svar" = one person's whole submission. |
| kommentar | komentaras | |
| samtale (anonymous conversation) | pokalbis | "Jūsų pokalbis", "Atidaryti pokalbį". |
| lenke | nuoroda | |
| e-post | el. paštas (address or system), el. laiškas (a message) | VLKK abbreviations. |
| virksomhet (the organisation) | organizacija ("visos organizacijos mastu") | Covers companies, municipalities, schools and kindergartens. "įmonė" would be too narrow. |
| hos oss (here, at our workplace) | mūsų darbovietėje, or "mes" as subject | "pas mus" in this sense is a VLKK-listed error. |
| gruppe | grupė | |
| påstand | teiginys | |
| lag (team; core and construction) | komanda | One word for the same respondent everywhere. "brigada" would be more idiomatic on site; see open questions. |
| **Core factor names** | | |
| Ytringsklima | Galimybė kalbėti atvirai | "Freedom to speak up"; "klimatas" calques read badly. |
| Arbeidsmengde og tidspress | Darbo krūvis ir laiko spaudimas | |
| Motstridende krav | Prieštaringi reikalavimai | |
| Kontakt og kommunikasjon | Kontaktas ir bendravimas | "bendravimas", not "komunikacija". |
| Emosjonelle krav | Emociniai reikalavimai | Established psychosocial-risk term (COPSOQ). |
| Støtte fra leder | Vadovo parama | |
| Medvirkning og kontroll | Dalyvavimas ir įtaka | "kontrolė" would read as supervision by others; this is control over one's own work. |
| Integritet og verdighet | Pagarba ir orumas | Plain and fits the three statements. The legal "asmens neliečiamybė" (EU Charter) is heavy for B1 readers. Flagged for review. |
| Rolleklarhet | Pareigų aiškumas | Native. Alternative: "Vaidmens aiškumas". |
| Støtte fra kollegaer | Kolegų parama | |
| Anerkjennelse og mening | Pripažinimas ir prasmė | |
| **Outside the index** | | |
| vold og trusler | smurtas ir grasinimai | |
| krenkende atferd | įžeidus elgesys | Adjective "įžeidus", not the participle "įžeidžiantis" (VLKK). |
| trakassering | priekabiavimas | Labour-code term. |
| mobbing | patyčios | |
| krenkelser (school) | įžeidinėjimai | |
| Ja / Nei / Vet ikke / Vil ikke svare | Taip / Ne / Nežinau / Nenoriu atsakyti | One wording everywhere. |
| **Modules** | | |
| turnus | darbo grafikas | |
| vakt | pamaina ("papildomos pamainos", "tarp pamainų") | "budėjimas" is on-call duty, not a shift. |
| nestenulykke | vos neįvykęs nelaimingas atsitikimas | Wording used in safety training. Once rephrased as "kai jo vos išvengta" to avoid a double noun. |
| underentreprenører og andre fag | subrangovai ir kitų specialybių darbuotojai | |
| brukere og pårørende | paslaugų gavėjai ir jų artimieji | Covers patients, residents and clients. Alternative: "klientai". |
| pedagog | pedagogas | |
| fagarbeider / assistent / miljøpersonale | padėjėjai / asistentai / pagalbinis personalas | No direct Lithuanian equivalent of "fagarbeider"; see open questions. |
| vikar | pavaduojantis darbuotojas; "pavadavimas" (the practice) | "pavaduotojas" means a deputy, so it is avoided. |
| bemanning | darbuotojų skaičius | |
| forsvarlig (omsorg) | tinkama (priežiūra) | |
| stilling / stillingsstørrelse | etatas ("Kokiu etatu dirbate?", "visu etatu") | |
| barn / elever | vaikai / mokiniai | |
| særskilte behov | specialieji poreikiai | |
| opplæring | mokymai ("gauna mokymus") | Not "apmokymai" (VLKK). |
| **Scales** | | |
| Helt uenig … Helt enig | Visiškai nesutinku / Iš dalies nesutinku / Nei sutinku, nei nesutinku / Iš dalies sutinku / Visiškai sutinku | Standard Lithuanian Likert anchors. Verbs, so gender-neutral. |
| Svært usannsynlig … Svært sannsynlig | Labai mažai tikėtina / Mažai tikėtina / Galbūt / Tikėtina / Labai tikėtina | "Netikėtina" was rejected: it also means "unexpected" or "unbelievable". |
| Orgpuls | Orgpuls | Never translated. No quotation marks: a brand in its original form. |

## The reviewer's log

### Lithuanian (lt) review log (TRAPD step "R")

Reviewer's overrides are in `targets-z-review.json`, which the merge applies after the
translator's `targets-1/2/3-*.json`. The translator's files are unchanged. All 290 units were
read against the bokmål. Every `{round}`, `{org}`, `{date}` ("spalio 12 d.", checked for all 12
months with `Intl` lt-LT), `{factor}`, `{name}` (a name, and the fallback "kolega iš vadovybės"),
`{threshold}` and `{k}` (5–10) host was read with its values substituted. The plurals, the
barnehage/skole wordings, the glossary terms and the jūs/Jūs register were also checked.

### Text changes (4)

| Unit | Key | Before → after | Category | Reason |
|---|---|---|---|---|
| u063 | BS-VT-3 / HO-VT-3 | "Po smurto ar grasinimų atvejo **jame dalyvavusiems darbuotojams** suteikiama tolesnė pagalba" → "Po smurto ar grasinimų atvejo **darbuotojams, kurie su juo susidūrė,** suteikiama tolesnė pagalba" | accuracy | "dalyvauti" (take part) in a violence incident can read as being a party to the violence. "den som var involvert" is neutral, and in this module it is usually the victim. "susidurti su" (be faced with) is neutral, and it is the verb the count questions HO-T-1 and BS-T-1 already use ("jums teko susidurti su … atveju"). |
| u230 | respond.promise1 | "Jūsų atsakymas anonimiškas. **Vardas,** el. pašto adresas ir IP adresas nesaugomi…" → "Jūsų atsakymas anonimiškas. **Vardas, pavardė,** el. pašto adresas ir IP adresas nesaugomi…" | accuracy | "Navn" is the whole name. "vardas" alone is the given name, so the anonymity promise said nothing about the surname. |
| u249 | respond.thread.contact.note | "**Laiškas** adresu {email} **siunčiamas iš jūsų asmeninio** el. pašto. …" → "**Laišką** adresu {email} **siunčiate iš savo** el. pašto. …" | accuracy | "din egen e-post" means your own mailbox as opposed to Orgpuls. "asmeninis el. paštas" means a private address as opposed to a work one, which tells people they must write from a private account. "savo" says "own" exactly and is gender-neutral. The passive became active because "savo" needs a subject. |
| u007 | core, Motstridende krav 1 | "…ir nežinau, ką **galima** atidėti" → "…ir nežinau, ką atidėti" | accuracy (judgement call) | "hva som skal prioriteres ned" means what is to be deprioritised. "ką galima atidėti" (what may be put off) adds a permission reading. The plain deliberative infinitive "ką atidėti" ("what to put off", like "nežinau, ką daryti") matches the source. The polarity and "retai" are unchanged. |

### Note-only changes, open questions for the human translator (4)

| Unit | Key | Change | Category |
|---|---|---|---|
| u270 | mail:greeting | Note rewritten as an OPEN question, text unchanged. Most readers of the Lithuanian mail have Lithuanian names, and the code cannot form a vocative, so the greeting prints "Sveiki, Tomas," instead of "Tomai". Should lt always use greetingPlain ("Sveiki,")? This is a product decision, because `{name}` cannot be dropped from the unit. | other |
| u234 | respond.scale.o1 | OPEN added: consider "Greičiau nesutinku / Greičiau sutinku" instead of "Iš dalies nesutinku / Iš dalies sutinku". Both "iš dalies" anchors describe partial agreement, so only their position tells them apart. The current set is acceptable and was kept. | other |
| u287 | mail:sms.reminder | Note now gives the lengths with a realistic org name. With "Bergen kommune" (14 characters) and a long month it is 135 characters, which is 3 UCS-2 parts. | other |
| u289 | mail:sms.lastReminder | Same. With "Bergen kommune" it is 135–138 characters, which is 3 parts in every month. With "Lumio AS" it is 129–132, which is 2 parts. | other |

### Considered and kept (no change)

- **u250 `contact.someone` = "kolega iš vadovybės"** (lower case). It reads correctly in all four slots: the title (nominative subject at the end), the body (twice as subject), the button (after a colon) and the mail greeting. "kolega" is common gender and its vocative is the same as the nominative, and the code uses the fallback nowhere else (RespondentThread.tsx). The translator's question on this is settled.
- **u067 / u108 vikar → "pavaduoti"**. In Norwegian, "vikar" also covers a colleague who is put in for someone. "fravær ikke dekket med vikar" means nobody stood in. "niekas nepavadavo" says exactly that.
- **Round names** ("{year} m. pagrindinė / pulso / papildoma apklausa", "… pulso apklausa Nr. {n}") were read in all 8 hosts. They always stand in a nominative slot, after "vyksta"/"baigiasi" or after a colon. Settled; keep them.
- **lag → "komanda"** in both core and construction. One word for the same respondent matters more than the site idiom "brigada". Settled.
- **fagarbeider → "Padėjėjai, asistentai ir pagalbinis personalas"**: every non-teaching, non-leading staff member can find themselves in it. Settled.
- **brukere → "paslaugų gavėjai"**, the Lithuanian social-services term. Settled.
- **Rolleklarhet → "Pareigų aiškumas"**; **u290 "Man tai neaktualu"**. Settled.
- **u200 Integritet og verdighet → "Pagarba ir orumas"**. The reviewer agrees it is the right label for respondents. The translator's "please confirm" note stays for the human, because it is the statutory factor name.
- **u004 "atlaikyti"** (withstand) is a shade stronger than "håndtere", but it expresses sustainability over time, and the translator's note gives the back-translation. Kept.
- Gender: no respondent-describing adjective or participle was found. "vieni", "pradėdami" (new or substitute staff) and the reciprocal "vienas kitą" (u129, u185) are generic forms for third persons or for the group.
- The warnings from the check (u229, u248, u250, u252, u277, u283, u287) are all intended.
