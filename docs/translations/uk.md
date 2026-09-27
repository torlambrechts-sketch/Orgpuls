# Ukrainian (uk): the machine draft

348 texts, all translated and independently reviewed; origin *machine*, status *draft* in admin ›
Translations (X-071). Unit numbers (u001…) are the working sheet's, not the product's keys: the
admin export shows each text by its key, bokmål and note.

## Open questions for the human translator

Most important first. The translator and the reviewer each raised these; the reviewer settled the
rest.

1. **Agreement scale:** «Скоріше (не) погоджуюся» is the usual Ukrainian survey anchor, but style guides treat «скоріше» meaning «rather» as a Russianism and prefer «Радше». It appears on every statement.
2. **Near miss (nestenulykke)** is described as «ситуація, коли ледь не стався нещасний випадок»: confirm, or choose a shorter term the audience knows.
3. **«Керівник»** is the fallback for an unknown manager: «Добрий день, Керівник!» and a capitalised mid-sentence use.
4. **Care module:** «підопічні» / «родичі» for brukere og pårørende.
5. **Kindergarten and school role options:** «допоміжний персонал» usually reads as service staff; «Фахові працівники» for fagarbeider is vague.
6. **Generic «ти» in the construction module** (u123, u143) in a survey that otherwise uses «ви».
7. **Factor names:**
  - «Повага й гідність»;
  - «Участь і вплив»;
  - «Свобода висловлюватися»;
  - «Емоційне навантаження»;
  - «Адаптація та інклюзія» («адаптація» can suggest a child's settling-in).
8. **Register:** courtesy capital «Ви» in mail and SMS, lower case on the pages.

## The translator's glossary and decisions

### Orgpuls survey — Ukrainian (uk) glossary

Norms: Український правопис 2019, current standard vocabulary, no Russianisms or surzhyk.
Typography: apostrophe ʼ (U+02BC), quotes «…» (inner „…“), spaced dash " — ", ellipsis … with no
space before it (the bokmål " …" is a Norwegian convention).

### Register and grammar decisions

| Topic | Decision | Why |
|---|---|---|
| Address, interface | «ви», lower case (capital only at the start of a sentence) | Microsoft Ukrainian style guide; standard in Ukrainian UIs |
| Address, e-mails and SMS (mail:*) and the pre-written letter `contact.mailBody` | courtesy capital «Ви / Вас / Вам / Ваш» in every unit | each mail is a personal letter to one person («Добрий день, {name}!»); the courtesy capital is the Ukrainian letter convention |
| Buttons, commands, CTA | infinitive: «Далі», «Пропустити», «Надіслати», «Копіювати посилання», «Відкрити розмову», «Пройти опитування» | Microsoft Ukrainian convention for commands |
| Instructions, placeholders, errors | imperative ви-form: «Напишіть тут…», «Спробуйте ще раз», «Збережіть посилання» | same guide |
| Gender neutrality (respondent) | present tense, plural past («ви відповіли»), nouns, impersonal «-но/-то» forms, «мені доводиться», adverbs «наодинці»; never «сам/сама», «впевнений/-а», past singular in 1st person | anonymity + inclusion (brief) |
| Third persons | generic masculine where that is the norm: «керівник», «учень», «підопічний», «колега» | brief allows generic forms for third persons |
| Greeting in letters | «Добрий день, {name}!» / «Добрий день!» — «!» not «,» | Ukrainian letter convention; {name} stays nominative (cannot be put in the vocative) |
| Number agreement with non-plural placeholders | {threshold}, {k} are 5–10 → always genitive plural («{k} людей», «{threshold} відповідей»); {minutes} → invariable abbreviation «хв» | 3–4 would need «хвилини», 5+ «хвилин» |
| Placeholder positions | {org}, {round}, {factor}, {name} only in nominative/accusative-neuter positions, after a colon, or in apposition («на тему «{factor}»») | values are never inflected |
| і / й, у / в | euphony where natural («роботи й брак часу», «в опитуванні») | Правопис 2019 |

### Terms

| Norwegian | Ukrainian | Why / notes |
|---|---|---|
| leder (respondent's line manager) | керівник («ваш керівник», «мій керівник») | standard HR term; «начальник» is colloquial/hierarchical, «менеджер» an anglicism |
| ledelsen (management) | керівництво | collective noun; also the author label in the thread |
| Lederen (fallback for {name}) | Керівник (capitalised, used like a role name) | must work as a sentence subject, after «Добрий день,» and after «Написати лист:» |
| kollega / kollegaer | колега / колеги | |
| arbeidsmiljø | робоче середовище | the psychosocial sense; «умови праці» suggests pay/schedule/physical conditions only |
| undersøkelse | опитування | «дослідження» = research |
| medarbeiderundersøkelse | опитування працівників | |
| svare på {round} (mails) | пройти {round} («запрошуємо пройти», «ще не пройшли») | «опитування» is neuter, so accusative = nominative and {round} is never inflected |
| svar / svare (page) | відповідь / відповідати | |
| spørsmål | запитання | the normative word for a question to be answered («питання» = issue) |
| påstand | твердження | |
| grunnlinjen {year} | основне опитування {year} року | the year's main, full survey; «базове» (baseline) would read as "basic" |
| pulsen {year} | коротке опитування {year} року | plain; «пульс-опитування» is HR jargon |
| puls {n} · {year} | коротке опитування № {n} · {year} | «№» avoids an ordinal suffix that would depend on {n} |
| oppfølgingen {year} | повторне опитування {year} року | |
| anonym / anonymt | анонімний / анонімно | |
| kommentar | коментар | |
| samtale (anonymous thread) | розмова | «діалог» is bookish, «листування» too literal |
| lenke | посилання | |
| e-post | електронна пошта (the mailbox), лист / електронний лист (a message) | no Latin «e-mail» |
| virksomhet | організація | fits companies, municipalities, schools |
| gruppe | група | |
| frivillig | за бажанням | «необовʼязково» sounds like "not needed" |
| Yes / No / Don't know / Prefer not to answer | Так / Ні / Не знаю / Не хочу відповідати | one wording everywhere |
| vold og trusler | насильство та погрози | |
| krenkende atferd | образлива поведінка | |
| trakassering | домагання | term of ILO C190 in Ukrainian («насильство та домагання у сфері праці») |
| mobbing | цькування | Ukrainian Labour Code uses «мобінг (цькування)»; native word |
| krenkelser (school) | приниження | «образ» (gen. pl. of «образа») would be ambiguous with «образ» (image) |
| hendelse | випадок | |
| melde (fra) | повідомляти | |
| uønskede hendelser | небажані події | OSH term |
| nestenulykke | «ситуація, коли ледь не стався нещасний випадок» (descriptive) | no short term workers know; «майже нещасний випадок» is a calque that parses as "almost-unhappy case" |
| turnus | графік змін | |
| vakt | зміна | |
| ekstravakt / vaktbytte | додаткова зміна / обмін змінами | |
| bemanning | кількість персоналу | «укомплектованість» is bureaucratic |
| vikar | заміна («йому знаходять заміну»); vikarer as people: тимчасові працівники | |
| forsvarlig (omsorg/bemanning) | належний (догляд) | |
| brukere | підопічні | the everyday care word for people receiving care; «користувачі послуг» is a calque |
| pårørende | родичі | |
| forflytning | переміщення підопічних | |
| hjelpemidler | допоміжні засоби | |
| rapport (care handover) | передача зміни | |
| stilling / stillingsstørrelse | ставка | «повна ставка», «неповна ставка» — what Ukrainian workers say |
| laget | команда (core); бригада (construction) | «бригада» is the construction crew |
| byggeplass / prosjekt | будівельний майданчик / обʼєкт | |
| underentreprenører og andre fag | субпідрядники та бригади інших спеціальностей | |
| lærling | практикант | «учень» would read as "school pupil" |
| barn / elever | діти / учні | |
| pedagog / lærer | вихователь / вчитель (options); педагог (statements) | |
| foreldre | батьки | |
| personalet | колектив | |
| faglig | професійний / фаховий | |
| Orgpuls | Orgpuls | never translated |

### Factor names

| Norwegian | Ukrainian | Note |
|---|---|---|
| Ytringsklima | Свобода висловлюватися | «Свобода висловлювань» would sound political (freedom of speech) |
| Arbeidsmengde og tidspress | Обсяг роботи й брак часу | «тиск часу» is a calque |
| Motstridende krav | Суперечливі вимоги | |
| Kontakt og kommunikasjon | Контакт і спілкування | |
| Emosjonelle krav | Емоційне навантаження | «емоційні вимоги» is the COPSOQ calque, unclear to workers |
| Støtte fra leder | Підтримка керівника | |
| Medvirkning og kontroll | Участь і вплив | «контроль» in Ukrainian means being supervised/checked |
| Integritet og verdighet | Повага й гідність | «цілісність/доброчесність» mean wholeness/honesty; «недоторканність» is legal jargon |
| Rolleklarhet | Чіткість ролі | |
| Støtte fra kollegaer | Підтримка колег | |
| Anerkjennelse og mening | Визнання й сенс роботи | |
| Helhet (label) | Загалом | |

### Scales

- Agreement (respond.scale.o1–o5): Повністю не погоджуюся / Скоріше не погоджуюся /
  Ні погоджуюся, ні не погоджуюся / Скоріше погоджуюся / Повністю погоджуюся.
  Rejected: «(не) згоден/згодна» (gendered), «Важко сказати» as midpoint (reads as don't know),
  «Частково погоджуюся» (reads as agreeing with part of the statement).
- Likelihood (anbefaling o1–o5): Дуже малоймовірно / Малоймовірно / Можливо / Імовірно / Дуже ймовірно.

## The reviewer's log

### Ukrainian (uk) draft: review log (TRAPD "R")

Reviewer: independent review of the machine draft, all 290 units read against the bokmål. Changes are
in `targets-z-review.json`, which overrides the translator's files. After the change, `tr-merge.ts` and
`tr-check.ts` report 0 errors. The remaining WARN and INFO lines are expected: ICU keywords read as
Latin text, full-width scale buttons, the source's own trailing blank lines in `contact.mailBody`, the
deliberate «!» in the greetings, and SMS texts that start with `{org}`.

11 units changed: 9 text changes and 2 note-only changes.

| Category | Units |
|---|---|
| accuracy | u123, u143 |
| naturalness | u064, u065, u066, u144, u162 |
| grammar or typography | u163, u175 |
| gender | — |
| consistency | — (u064–u066 also align with HO-BF-1) |
| placeholder | — |
| other (note only, left for the human) | u111, u234 |

### Changes

### u064 / u065 / u066 (BS-BE-1, combined / kindergarten / school): naturalness
- before: «Кількість персоналу дає змогу **давати** дітям чи учням / дітям / учням те, що їм потрібно»
- after: «Кількість персоналу дає змогу **забезпечувати** дітям чи учням / дітям / учням те, що їм потрібно»
- why: «дає змогу давати» repeats the same verb root, which reads clumsily. «забезпечувати» fixes that and uses the
  same wording as the health module's HO-BF-1 («дає змогу забезпечувати належний догляд»). The meaning and the
  three wordings stay parallel.

### u123 (BA factor name) and u143 (BA-PH-1): accuracy, a judgment call
- before: «Сказати, що тобі погано» / «І тут нормально сказати, що тобі погано»
- after: «Сказати, що в тебе не все гаразд» / «І тут нормально сказати, що в тебе не все гаразд»
- why: «ikke har det bra» means not doing well in how one is getting on, and this is the psychological-health
  factor. «мені/тобі погано» is often read as feeling physically unwell («стало погано»). «в тебе не все
  гаразд» keeps the everyday register and the translator's generic «ти». Notes updated.

### u144 (BA-PH-2): naturalness (word order)
- before: «Після нещасного випадку чи ситуації, коли він ледь не стався, з тими, хто там був, розмовляють»
- after: «Після нещасного випадку чи ситуації, коли він ледь не стався, розмовляють із тими, хто там був»
- why: with the verb stranded at the end after two subordinate clauses, the sentence was hard to follow.
  The normal order reads at once. The meaning is unchanged.

### u162 (HO factor name «Stilling og tilhørighet»): naturalness (Russianism)
- before: «Ставка й приналежність до колективу»
- after: «Ставка й належність до колективу»
- why: for "belonging to" something, the normative word is «належність». Ukrainian style guides
  (Антоненко-Давидович and others) treat «приналежність» in this sense as a Russianism: in Ukrainian,
  «приналежності» means accessories or kit.

### u163 (HO factor name «Grenser mot brukere og pårørende»): grammar or typography (euphony)
- before: «Межі у стосунках із підопічними та родичами»
- after: «Межі в стосунках із підопічними та родичами»
- why: Правопис 2019 § 23 prefers «в» after a vowel before a consonant. «ст» is not among the clusters that
  take «у» (в, ф, льв, св, тв, хв). The translator's note is kept.

### u175 (HO-HF-2): grammar or typography (euphony)
- before: «Важлива інформація доходить до мене і тоді, коли …»
- after: «Важлива інформація доходить до мене й тоді, коли …»
- why: «й» after a vowel before a consonant (Правопис 2019 § 23). This is the draft's only
  vowel-«і»-consonant slip; everywhere else the draft follows its own rule.

### u111 (BS-S-rolle option 2): note only, left for the human
- text unchanged: «Фахові працівники, асистенти або допоміжний персонал»
- note added: «допоміжний персонал» is usually read as service staff (cleaning, kitchen, caretaking), which
  «miljøpersonale» (staff supporting pupils' well-being) is not. The note suggests e.g. «персонал супроводу»,
  to be checked with staff, together with the translator's own question about «фахові працівники».

### u234 (agreement scale o1, carries the set's note): note only, left for the human
- text unchanged. Question added to the note: «Скоріше» (o2, o4) is the usual anchor in Ukrainian survey
  research, but style guides treat «скоріше» in the sense 'rather' as a Russianism and prefer «Радше».
  It is on every statement, so a human should decide. It is not changed here because both are in current
  use and the brief asks for the anchors survey research uses.

### Left for the human without a new unit note
- u250 `contact.someone` «Керівник»: it works as a subject, after «Написати лист:» and in the greeting. In
  `contact.body` it appears capitalised mid-sentence («…лист, який отримає Керівник. Тоді Керівник
  дізнається…»), as the bokmål «Lederen» does. It is acceptable, like a role name in a contract, but a human
  may prefer another fallback.
- u123 / u143: the generic «ти» (now «в тебе») in a survey that otherwise says «ви». The translator's
  reasoning holds, but it is a register decision a native reviewer should confirm.
- u055 «Адаптація та інклюзія»: in kindergartens «адаптація» also means a child's settling-in period. The
  statements below it make the sense clear. «Індивідуальний підхід та інклюзія» is an alternative if staff
  misread it.

### Translator's open points: settled without a change
- u003: keep «а не потім за спиною». The alternative «шепочуться по кутках» adds "whispering" and is more
  colloquial.
- u040 / glossary: keep «домагання» (harassment) and «цькування» (bullying). «домагання» is the term used in the
  ILO C190 and EU-directive translations and covers sexual harassment as a subtype, which is also true of
  «trakassering».
- u197: «Вільна відповідь» is right for «Åpent felt».
- u248: the rephrasing «Пишу щодо свого коментаря …» keeps authorship clear and is gender-neutral. The greeting's
  nominative `{name}` is unavoidable.
- u270 / u271: keep «Добрий день, {name}!» / «Добрий день!». The «!» is the Ukrainian letter convention (the
  check's WARN is expected).
- u276: «Пройти опитування» as the CTA is right; «Відповісти» could be read as "reply to this e-mail".
- u290: keep «Не стосується мене», which matches «Ikke relevant for meg».
- Round names: checked in all eight host sentences with all four names. All are grammatical with the value
  uninflected, and so is the capitalised start of `sistePaminnelse.lead`.
- `{name}`: checked in title, body, CTA and mail body with a real name and with the fallback «Керівник».
  `{factor}`, `{date}`, `{org}`, `{threshold}`, `{k}` and `{minutes}` were checked the same way.
- Register: «ви» is lower case on every page and «Ви/Вас/Вам/Ваш» is used throughout the mails, SMS and the
  pre-written `contact.mailBody`. It is consistent.
- SMS: recomputed with a Ukrainian date. All four SMS texts are 2 parts with «Lumio AS» or «Stavanger kommune».
  `sms.lastReminder` reaches 3 parts (136 characters) only with a 20-character org name and «30 листопада».
