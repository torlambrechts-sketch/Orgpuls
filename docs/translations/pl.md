# Polish (pl): the machine draft

348 texts, all translated and independently reviewed; origin *machine*, status *draft* in admin ›
Translations (X-071). Unit numbers (u001…) are the working sheet's, not the product's keys: the
admin export shows each text by its key, bokmål and note.

## Open questions for the human translator

Most important first. The translator and the reviewer each raised these; the reviewer settled the
rest.

1. **SMS cost.** Polish letters force the more expensive SMS encoding. The invitation SMS was written without diacritics, so it fits one part; «Dzień dobry! …» is the formal alternative at twice the cost. In September and October the reminders reach 3 parts with longer organisation names, because the code writes the month in Polish (a numeric date in SMS would fix it; product decision).
2. **«Przełożony»** is the fallback when a manager has no registered name: «Dzień dobry, Przełożony,» is stiff. This case is rare.
3. **Round names:** «ankieta kontrolna» may sound like checking up on people; «ponowna ankieta» is the alternative. Also confirm «krótka ankieta» for «puls».
4. **Factor names that depart from the literal:**
  - «Szacunek i godność» for Integritet og verdighet;
  - «Udział w decyzjach i kontrola nad pracą»;
  - «Swoboda wypowiedzi»;
  - «Hałas, ergonomia i przerwy».
5. **«Znamy procedury»** (u059–u061), against the draft's «Wszyscy znamy»: it depends on whether «kjente rutiner» means known to us or known to everyone.
6. **Sector terms:**
  - «dyrekcja» / «kierownictwo» in the school module;
  - «ekipa» for laget;
  - «podopieczni i ich bliscy»;
  - «dyżur» / «grafik»;
  - «zdarzenie potencjalnie wypadkowe» for nestenulykke;
  - «nauczyciele» for pedagoger («pedagog» is a false friend);
  - «włączanie» or «inkluzja»;
  - «mobbing» or «przemoc rówieśnicza» for children.

## The translator's glossary and decisions

### Polish (pl) glossary — Orgpuls employee survey

Norwegian term → Polish → why. Decided before translating; the targets follow it.

### Register and typography
- **du** → informal *ty*. In the survey pages lower case (ty, twój, ci) except at a sentence start (Microsoft PL style). In every **mail** unit, including the SMS, and in the pre-written letter `contact.mailBody`, the courtesy capital of personal letters (Ty, Twój, Ci, Cię, Tobą) — PWN rule for letters addressed to one person; used consistently.
- Quotes „…”; parenthetical dash spaced en dash ` – `; ellipsis `…` attached to the word (PWN), so "Skriv her …" → "Napisz tutaj…".
- Gender neutrality: no 1st/2nd-person past tense, no participle or adjective agreeing with the respondent. Tools: present tense, *zdarzyło ci się* + infinitive, impersonal *-no/-to* and *się*, nouns (*osoba*, *świadek*), *w pojedynkę* for "alene", compound future *będę + infinitive*. The same for the manager in `contact.mailBody`.
- Buttons: short informal imperatives (Dalej, Pomiń, Wyślij, Skopiuj link).

### Terms
| Norwegian | Polish | Why |
|---|---|---|
| leder (line manager) | **przełożony** (twój przełożony) | Standard in Polish work-environment questionnaires (QPS Nordic, COPSOQ PL); fits all sectors. Generic masculine, allowed for third persons. *kierownik* rejected: a job title. |
| Lederen (fallback for an unknown name) | **Przełożony** | Works as a nominative subject ("Przełożony chce porozmawiać…"); every {name} sentence is built so {name} is nominative. |
| ledelsen (management) | **kierownictwo** | Neutral across companies, municipalities, schools. In the kindergarten/school module only: **dyrekcja**, the only natural word there. *zarząd* rejected (the board). |
| kollega / kollegaer | **współpracownik / współpracownicy** | Survey standard (COPSOQ PL "wsparcie współpracowników"). |
| arbeidsmiljø | **środowisko pracy** | Kodeks pracy / BHP term. |
| undersøkelse, medarbeiderundersøkelse | **ankieta**, **ankieta pracownicza** | Everyday word; *badanie* avoided in round names because "zaprasza na badanie / badanie kontrolne" reads as a medical check-up (a Polish worker knows *badania kontrolne* from occupational medicine). |
| grunnlinjen {year} | **główna ankieta {year}** | The year's main, full survey. |
| pulsen {year} / puls {n} · {year} | **krótka ankieta {year}** / **krótka ankieta {n} · {year}** | Plain description; "puls" alone is opaque in Polish. |
| oppfølgingen {year} | **ankieta kontrolna {year}** | Follow-up measurement; alternative *ponowna ankieta*. |
| {round} in mails | always nominative: after a colon or dash, or as the subject of a present-tense verb | Round names are never inflected, so no sentence needs another case. |
| anonym / anonymt | **anonimowy / anonimowo** | |
| svar / svare | **odpowiedź, odpowiedzi / odpowiadać, odpowiedzieć** | A whole survey response = *Twoje odpowiedzi* (plural reads naturally). |
| kommentar | **komentarz** | |
| samtale (anonymous conversation) | **rozmowa** | |
| lenke | **link** | Everyday Polish; *odnośnik* is purist. |
| e-post | **e-mail**, **wiadomość** | |
| virksomhet (the whole organisation) | **organizacja** | Fits companies, municipalities and schools; *firma* excludes the public sector; *zakład pracy* is the alternative. |
| gruppe | **grupa** | |
| påstand | **stwierdzenie** | |
| {org} | nominative only: subject, after a colon/dash, or in parentheses | *w firmie {org}* rejected: a municipality is not a *firma*. |
| {factor} | after "Temat:" or as „{factor}” apposition to a declined noun (*do tematu „{factor}”*) | |
| {threshold}, {k} (5–10) | **co najmniej {k} osób** / **{threshold} odpowiedzi** | *osób* is right for every value 5–10; *odpowiedzi* is the same form for all numbers ≥ 2. |
| {minutes} | **{minutes} min** | Invariable abbreviation (brief rule 1). |
| vold og trusler | **przemoc i groźby** | |
| hendelse (with violence) | **incydent przemocy lub gróźb**; "vært med på" = *mieć do czynienia z* | Otherwise *zdarzenie*; *uønskede hendelser* = *zdarzenia niepożądane*. |
| krenkende atferd | **obraźliwe zachowania** | Plain; *zachowania naruszające godność* is the legal-register alternative. |
| trakassering | **nękanie** | *molestowanie* rejected: reads as sexual abuse. |
| mobbing | **mobbing** | Kodeks pracy term, known to everyone. |
| krenkelser (school module) | **obraźliwe zachowania** | Kept consistent with krenkende atferd. |
| turnus | **grafik** (options: *praca na dwie/trzy zmiany*) | What Polish nurses and carers call the rota. |
| vakt | **dyżur** | Natural in health and care ("dodatkowe dyżury", "zamiana dyżurów"). |
| nestenulykke | **zdarzenie potencjalnie wypadkowe** | Standard Polish BHP term (ZPW); *prawie wypadek* is colloquial. |
| underentreprenører og andre fag | **podwykonawcy i inne branże** | Construction usage. |
| laget (construction module) | **ekipa** | How Polish construction workers say "crew"; core items use *zespół*. |
| brukere og pårørende | **podopieczni i ich bliscy** | Covers residents, home-care clients and patients; *pacjenci* is hospital-only. |
| forsvarlig (bemanning, omsorg) | **bezpieczna** (obsada, opieka) | Plain; *należyta opieka* is the more legal alternative. |
| forflytning | **przemieszczanie podopiecznych** | |
| stilling / stillingsstørrelse | **etat / wymiar etatu** | |
| pedagog (kindergarten/school) | **nauczyciel** (option: *kadra pedagogiczna*) | False friend: Polish *pedagog* is a specific counselling role. |
| vikar | **osoba na zastępstwie**; *zastępstwo* | |
| fagarbeider, assistent, miljøpersonale | **opiekunowie, asystenci, personel wspierający** | Group labels, so the respondent does not pick a gendered job title. |
| lærling | **praktykant** | |
| Orgpuls | **Orgpuls** | Never translated. |

### Factor names (core)
Ytringsklima → Swoboda wypowiedzi · Arbeidsmengde og tidspress → Obciążenie pracą i presja czasu · Motstridende krav → Sprzeczne wymagania · Kontakt og kommunikasjon → Kontakt i komunikacja · Emosjonelle krav → Wymagania emocjonalne · Støtte fra leder → Wsparcie przełożonego · Medvirkning og kontroll → Udział w decyzjach i kontrola nad pracą · Integritet og verdighet → Szacunek i godność · Rolleklarhet → Jasność roli · Støtte fra kollegaer → Wsparcie współpracowników · Anerkjennelse og mening → Uznanie i poczucie sensu

### Answer scales
- Agreement (o1–o5): Zdecydowanie się nie zgadzam / Raczej się nie zgadzam / Ani się zgadzam, ani się nie zgadzam / Raczej się zgadzam / Zdecydowanie się zgadzam — the standard Polish Likert anchors, 1st-person present (gender-neutral). Rejected: *Trochę się (nie) zgadzam* (literal "litt", not used in Polish surveys) and *Nie mam zdania* (a don't-know).
- Recommendation: Bardzo mało prawdopodobne / Mało prawdopodobne / Być może / Prawdopodobne / Bardzo prawdopodobne.
- Yes / No / Don't know / Prefer not to answer: **Tak / Nie / Nie wiem / Wolę nie odpowiadać** everywhere.

## The reviewer's log

### Polish (pl) review log (TRAPD step "R")

I reviewed all 290 units against the bokmål, using the English as a reference. I checked each
against the brief, the translator's glossary and the way the app assembles the strings
(`components/respond/*`, `lib/respond/questions.ts`, `supabase/functions/_shared/mail.ts`).

I changed the text of **7 units**. I also corrected the SMS-length notes of **2 more**, whose
texts are unchanged. All nine are in `targets-z-review.json`, which overrides the translator's
files. The bokmål is given for each change, so the change can be re-applied if the unit ids ever
move. After merging, `tr-check.ts pl` reports 0 errors. Its 15 warnings and info lines are the
same benign ones the draft had: the scale anchors are long for labels, one text consists only of
placeholders, the texts that start with `{round}` or `{org}` get their capital from the code, and
`mailBody` keeps the source's two trailing blank lines.

| Category | Units |
|---|---|
| accuracy | u059, u060, u061, u142, u152, u222 |
| naturalness | none |
| grammar or typography | none |
| gender | none (no gendered form found; see "Checked, not changed") |
| consistency | none as the main reason (u142 also restores consistency with u025) |
| placeholder | none (every `{round}`, `{org}`, `{date}`, `{factor}` and `{name}` host checked) |
| other: SMS length | u286 (text); u287 and u289 (note only) |

### Changes

### u059, u060, u061 (module, Barnehage og skole BS-VT-1, all three wordings): accuracy (added quantifier), judgement call
- nb: "Vi har kjente rutiner for hva vi gjør når et barn eller en elev blir voldelig eller truende" (and the "et barn" and "en elev" wordings)
- before: "Wszyscy znamy procedury postępowania w sytuacji, gdy dziecko lub uczeń stosuje przemoc lub grozi"
- after: "Znamy procedury postępowania w sytuacji, gdy dziecko lub uczeń stosuje przemoc lub grozi"
- The kindergarten (u060) and school (u061) wordings change the same way: "Wszyscy znamy …" becomes "Znamy …".
- reason: The bokmål says the routines are known. It does not say "all of us". "Wszyscy" adds a
  universal quantifier, which the brief forbids ("the same intensity and quantifiers"). It also
  changes the answers: someone who knows the routines but doubts that a newcomer does would
  agree with the bokmål and disagree with "Wszyscy znamy". The Danish draft made the same choice
  ("Vi kender vores retningslinjer"). This is a judgement call, because "kjente rutiner" can be
  read as "known to everyone" (the uk and lt drafts read it that way). The notes say so, so the
  human can revert.

### u142 (module, Bygg og anlegg BA-NU-3): accuracy (intensity)
- nb: "Man får tid til å lære en ny oppgave skikkelig før det forventes tempo"
- before: "Jest czas, żeby porządnie nauczyć się nowego zadania, zanim zacznie się wymagać szybkiej pracy"
- after: "Jest czas, żeby porządnie nauczyć się nowego zadania, zanim zacznie się oczekiwać szybkiej pracy"
- reason: "forventes" means expected. "wymagać" means require or demand, which is stronger. The
  draft itself renders "forventes" as "oczekiwać" in u025 ("czego się ode mnie oczekuje"). The
  Swedish review made the same fix on this unit.

### u152 (module, Bygg og anlegg, answer option 1 of BA-S-arbeidssted): accuracy (false friend)
- nb: "Prosjekt eller byggeplass"
- before: "Na budowie lub przy projekcie"
- after: "Na budowie lub w terenie"
- reason: In a Norwegian construction company, "prosjekt" is the project site: being out on a
  job, as opposed to the workshop or warehouse (option 2) or the office (option 3). In Polish,
  "przy projekcie" means working on a project or on the design ("projekt" = design
  documentation), so an office-based engineer could pick option 1 as well as option 3. The
  answer also does not fit "Gdzie…?". "w terenie" covers civil-works sites such as roads and
  tunnels, which "budowa" alone may not suggest. The uk and lt drafts also avoided the literal
  "project" ("обʼєкт", "objektas"). The note gives "na obiekcie" as the jargon alternative.

### u222 (ui, respond.keys.lead): accuracy (ambiguity)
- nb: "Ledelsen kan svare deg uten å vite hvem du er. Lenken under er den eneste veien tilbake til svaret. Lagre den nå: …"
- before: "… Link poniżej to jedyny sposób, żeby wrócić do odpowiedzi. …"
- after: "… Link poniżej to jedyny sposób, żeby wrócić i zobaczyć odpowiedź. …" (the rest unchanged)
- reason: The genitive "odpowiedzi" is singular and plural alike. Everywhere else in the survey,
  "Twoje odpowiedzi" means the respondent's survey answers. So the sentence could be read as
  "the only way back to your answers", which suggests that the answers can be retrieved through
  a personal link. That misreads the anonymity model, on the screen whose job is to explain it.
  The accusative singular "zobaczyć odpowiedź" can only mean management's reply. "wrócić" keeps
  the bokmål's "tilbake".

### u286 (mail, sms.default): other (SMS length); settles the translator's open question
- nb: "Hei! {org} spør hvordan du har det på jobb. Svar anonymt:"
- before: "Dzień dobry! {org} pyta, jak Ci się pracuje. Odpowiedz anonimowo:"
- after: "Witaj! {org} pyta, jak Ci jest w pracy. Odpowiedz anonimowo:"
- reason: The brief says to keep SMS texts "as short as the meaning allows". The translator
  offered this diacritic-free wording in the note and applied the same principle to both
  reminders. It is correct Polish with no letter left unaccented. It is GSM-7: 107 characters
  with "Lumio AS" and the link, which is 1 part, and it stays 1 part with an org name of up to
  about 60 characters. The draft was UCS-2 and 2 parts, and reached 3 parts once the org name
  exceeded 30 characters. This matters most here, because the invitation SMS is the
  highest-volume message. "jak Ci jest w pracy" is also closer to "hvordan du har det på jobb"
  than "jak Ci się pracuje" (how you like working). I did not switch u288 (sms.link). Its
  GSM-7 alternative ("oto link do ankiety z plakatu") drops "du ba om", and it is a
  low-volume message that stays within 2 parts for org names up to 42 characters. The note
  keeps "Dzień dobry! …" as the alternative.

### u287, u289 (mail, sms.reminder and sms.lastReminder): other (note corrected, text unchanged)
- note before (u287): "… Only a September or October date … makes it UCS-2 (≈122 = 2 parts) …"
- note after (u287): "… a September or October date … makes it UCS-2, which is 2 parts only for org names up to 20 characters and 3 beyond; the cause is the date, which the code formats."
- The u289 note changes the same way, with a limit of 14 characters.
- reason: I measured both texts with the real Polish date ("12 października") and longer org
  names. The draft's notes give the 2-part figure for "Lumio AS" only. With "Oslo
  universitetssykehus HF" (27 characters), both reminders are 3 parts in September and October.
  The wording is already tight, and trimming "Anonimowo, przez nowy link:" to "Nowy link,
  anonimowo:" saves only 6 characters. The cause is the month name that the code inserts. I
  left this for the human and the product owner (open question 1).

### Checked, not changed
- **Gender:** I scanned every unit for gendered 1st- and 2nd-person past tenses, participles
  and adjectives. There are none. The draft's devices are sound and used consistently: "w
  pojedynkę", "zdarzyło ci się", "doszło przy tobie", "poproszono cię", "osoba, która
  napisała", "chce" rather than "chciałby", and "Mamy omówione/ustalone". In `mailBody`, the
  manager is addressed without any gendered form.
- **Register:** "ty" is lower case on the pages and capitalised only at the start of a
  sentence or heading. The mail units, the SMS and `mailBody` use the courtesy capitals
  throughout.
- **Placeholders:** I rendered every `{round}` host with all four round names. `{org}` is
  always nominative. `{date}` follows a colon, "do" or "koniec", and "12 października" is
  already genitive. `{factor}` is quoted after "tematu" or follows "Temat:". I checked `{name}`
  in `contact.title`, `body`, `cta` and `mailBody` with a name and with the fallback
  "Przełożony". "{threshold} osób", "{k} osób" and "{threshold} odpowiedzi" are correct for
  every value from 5 to 10. "{minutes} min" is invariable.
- **Plurals:** u213, u223 and u224 have one, few, many and other, and u213 keeps =1, =2 and
  =3. The forms are right, including the genitive singular for fractions.
- **Typography:** „…”, the spaced en dash, "…" attached to the preceding word, no ASCII
  apostrophes, and the line breaks of `mailBody` kept.
- **Considered and left as defensible:** u007 (the scope of "rzadko … nie wiedząc" reads
  correctly). u166 and u177 ("Mamy omówione/ustalone" are colloquial but standard enough, and
  gender-neutral). u173 ("w ostatniej chwili" for "på kort varsel" is idiomatic, if slightly
  stronger). u094 ("przyjazny dla ciała"). u196 ("Pytanie o polecenie": the question beneath
  resolves "polecenie"). u112 ("Kierownictwo" for the role option is broader than "dyrekcja",
  which suits a person who leads a department). u020 ("mój głos jest słyszany").
