# German (de): the machine draft of the app

The signed-in app's chrome in German: 3 278 strings in `messages/de.json`, the same keys the Swedish
catalogue carries (D-252), drafted by machine in one session (DE-A, D-289) and waiting for Tor's review.
English stands behind every key the file does not have, so nothing shows as a key. The respondent's
texts (the statements, the questions outside the index, the survey pages, the invitation, reminder and
SMS texts) are not in this file: they are DE-A2, drafted into the translation registry as the other
survey languages were (X-071, X-089), and the glossary below is written so that draft matches this one.

## What this file is, and what it is not

- **In German:** navigation, headers, every screen of Innsikt, Målinger, Resultater, Tiltak, Rapport,
  Kommentarer, Årshjulet, Måleoppsett and Oppsett, the help articles and the header panel, the onboarding
  wizard, sign-up, invitations to join, the integrations (Entra, Slack, SMS, Teams), the demo pages, the
  factor descriptions and the notes under the extra questions.
- **In English behind it:** the public site and its SEO texts (`site`, `seo`: the German site is DE-F,
  written for German law, not translated from Norway's), the data processing agreement (`dpa`, DE-E), the
  industry names (`industry`), and the respondent and mail texts (`respond`, `mail`, DE-A2).
- **Norwegian law stays Norwegian.** The help articles and the header panel's law tab describe
  arbeidsmiljøloven, and a German-speaking leader of a Norwegian organisation reads about Norwegian law in
  German: «Arbeidsmiljøloven § 3-1 Buchstabe c», «Arbeitsaufsichtsbehörde» for Arbeidstilsynet,
  «Brønnøysund-Register». A German organisation's own legal texts are the market pack (DE-C), which lays
  over this catalogue by host.

## Register and typography

| Decision | Choice | Why |
|---|---|---|
| Address | **Sie**, capitalised | Business software in Germany addresses its users formally; the source's «du/dere» becomes «Sie» throughout, and «dere» (the organisation) also «Sie». |
| Gender | neutral forms where a person is meant: «Beschäftigte», «beschäftigte Person», «Führungskraft», «Kolleginnen und Kollegen», «Sicherheitsbeauftragte», «Geschäftsführung», «Abteilungsleitung», «die Administration» | The same rule as every other language: a gendered form would exclude people and, in a comment, narrow the haystack. Never the generic masculine, never the Binnen-I or the asterisk. |
| Quotation marks | **„…“** (U+201E / U+201C) | Duden's primary form in Germany. The source's « » is the Swiss convention and is not used; the test `tests/unit/german-platform.test.ts` holds it. |
| Dash | spaced en dash **" – "** | Duden: the Gedankenstrich is the en dash with spaces. The source's em dash never appears. Never in SMS (not GSM-7). |
| Ellipsis | **…** with a space before it where the source has one («Wird gespeichert …») | Keeps the placeholder look of the source. |
| Times | **09:00 Uhr**, «um {time} Uhr» in running text | DIN 5008. |
| Numbers | «15 Min.», «2 Stunden», «Tag {day}»; thousands with a narrow space where the app formats them (Intl) | DIN 5008. |
| Capitalisation of UI labels | sentence case, as the source | «Jetzt synchronisieren», not «Jetzt Synchronisieren». |

## Terms (one word each, used everywhere)

| nb | de | Why / rejected alternative |
|---|---|---|
| måling, kartlegging | **Befragung**, **Erhebung** (the act of mapping, in the law's sense) | «Umfrage» is a poll; «Messung» is physics. |
| grunnlinje | **Basisbefragung**; «Hauptbefragung» where the source says hovedundersøkelse | |
| puls | **Puls**, **Pulsbefragung** | Established in German HR. |
| tiltak | **Maßnahme** | The word §§ 3 and 5 ArbSchG use. |
| risikovurdering | **Risikobewertung** | Not «Gefährdungsbeurteilung», which is the German statutory instrument and is reserved for the legal pack (DE-C), where the product's place in it is explained. |
| terskel | **Mindestgruppengröße** | Says what it is. «Schwelle» and «Schwellenwert» are too abstract on a chip. |
| årshjulet | **Jahresplan**; «Jahresplan und Automatik» as the screen title | «Jahresrad» is not German. |
| forankring | **Verankerung** | |
| indeks, arbeidsmiljøindeks | **Index**, **Arbeitsumfeld-Index** | |
| svarprosent | **Rücklaufquote** | The survey-research term. |
| daglig leder | **Geschäftsführung** | A function, not a person, so no gender. |
| avdelingsleder | **Abteilungsleitung** | Same. |
| verneombud | **Sicherheitsbeauftragte** (plural, gender-neutral) | The closest German function (§ 22 SGB VII). The German pack says «Betriebsrat» where German law gives the role to the works council (de-legal.md). |
| tillitsvalgt(e) | **Arbeitnehmervertretung** | |
| arbeidsmiljøutvalg (AMU) | **Arbeitsschutzausschuss** | § 11 ASiG. |
| bedriftshelsetjeneste (BHT) | **Betriebsärztlicher Dienst** | |
| Arbeidstilsynet | **Arbeitsaufsichtsbehörde** | Describes the Norwegian authority; the German pack names the Länder authorities. |
| Oppsett | **Einstellungen** | |
| Måleoppsett | **Befragungsaufbau** | |
| Innsikt | **Einblicke** | |
| Målinger / Resultater / Tiltak / Rapport / Kommentarer | **Befragungen / Ergebnisse / Maßnahmen / Bericht / Kommentare** | |
| ansatte | **Beschäftigte**; «beschäftigte Person» in the singular | Not «Mitarbeiter». |
| ansattregisteret, registeret | **das Verzeichnis** | |
| gruppe | **Gruppe** | |
| spørsmålssett | **Fragenset** | |
| påstand | **Aussage** | The QPS Nordic German term. |
| spørsmål utenfor indeksen, egne spørsmål | **Zusatzfragen**, **eigene Fragen** | |
| bransjemodul | **Branchenmodul** | |
| samtale (anonymous thread) | **Gespräch** | |
| utsending | **Versand** | |
| påminnelse | **Erinnerung** | |
| katalog (Entra) | **Verzeichnisdienst** | To keep it apart from «das Verzeichnis», the employee register. |
| koble til / koble fra | **anbinden / trennen** | |
| krenkende atferd | **verletzendes Verhalten** | The AGG's «Belästigung» is reserved for the legal texts. |
| ytringsklima | **Meinungsklima** | |
| medvirkning | **Mitwirkung** | |
| anerkjennelse og mening | **Anerkennung und Sinn** | |

## Open questions for the human reviewer

1. **«Sicherheitsbeauftragte» for verneombud** in a Norwegian organisation's app, against «Betriebsrat»
   in the German pack. The two must read as the same role to a German-speaking leader in Norway and a
   German firm respectively; the pack wins on German hosts.
2. **«Mindestgruppengröße»** against the shorter «Schwelle» on the narrowest chips (Oppsett › Grupper,
   the wizard's threshold step): check at 390 px. The stat tile on Oppsett already uses «Mindestgröße»
   (`oppsett.statThreshold`), because the full word clipped there.
3. **«Befragung» for both måling and kartlegging.** The law's kartlegging is rendered «Erhebung» where
   the sentence is about the statutory duty, «Befragung» where it is about the product's round.
4. **Factor abbreviations** («Meinung», «Menge», «Konflikt», «Kontakt», «Emotion», «Führung»,
   «Mitwirk.», «Integr.», «Rolle», «Kollegium», «Sinn») are chosen for the heat map's column width.
5. **«Arbeitsaufsichtsbehörde»** for Arbeidstilsynet reads as a generic noun; «Arbeidstilsynet (die
   norwegische Arbeitsaufsicht)» on first mention is the alternative.

## How it was made

One session, namespace by namespace, each batch merged by a script that refuses a key the source lacks
or an ICU signature that differs from the source's, written in bokmål's key order; every plural carries
German's two categories (one, other), checked against CLDR by `npm run verify:i18n`. Reviewed in the
browser on the QA stack with the language cookie `de` (D-289).

## The legal pack's terms (DE-C, D-290)

For an organisation in Germany the pack `messages/market/de/{de,en}.json` lays German law over this
catalogue (lib/i18n/market-overlay.ts). Its terms, in both of its languages:

| Thing | de | en | Source |
|---|---|---|---|
| the third role (verneombud) | **Betriebsrat** — the person the works council names; empty where there is none | **works council** | § 1, §§ 80, 87, 89 BetrVG; de-legal.md § 5 |
| the survey as the law sees it | **Gefährdungsbeurteilung** for **psychische Belastungen bei der Arbeit** | the risk assessment (Gefährdungsbeurteilung) for psychological load at work | § 5 Abs. 3 Nr. 6 ArbSchG |
| the authority | **die Arbeitsschutzbehörde des Landes** | the Land's occupational safety authority | § 21 ArbSchG; names differ by Land, so no name |
| AMU | **Arbeitsschutzausschuss** | occupational safety committee | § 11 ASiG |
| BHT | **Betriebsarzt und Fachkraft für Arbeitssicherheit** | company doctor and (occupational) safety specialist | §§ 2, 5 ASiG |
| tillitsvalgte | **Arbeitnehmervertretung** | employee representatives | — |
| krenkende atferd | **Belästigung** (the AGG's term, in the pack only) | harassment | § 3 Abs. 3 AGG |
| the documentation | **die Dokumentation nach § 6 ArbSchG** | the documentation under § 6 ArbSchG | § 6 ArbSchG |
| organisation number | **USt-IdNr.** | VAT ID (USt-IdNr.) | de-legal.md assumptions 4 |
| citations | **§ 87 Abs. 1 Nr. 7 BetrVG** — section first, act last, in both languages | same | German convention |

Never in a pack text: a factor name «nach ArbSchG», «nach der GDA», a yearly interval the statute does not set,
«die Berufsgenossenschaft prüft», or a duty on employees to report harassment (de-legal.md, «How a product text
should cite it» under each section).

## The survey in German (DE-A2, D-292)

Every text a respondent can meet, drafted by machine, **817 texts** in two places:

- **The product's own texts, 212**, in `docs/translations/de.orgpuls-translations.json` (format
  `orgpuls-translations` v1, locale `de`, every entry origin *machine*, step *draft*): the 33 core
  statements, the 23 texts of the questions outside the index, the 111 strings of the survey pages and the
  45 invitation, reminder and SMS texts. Their keys are names (`core:ytring:1`, `ui:respond.next`), the
  same in every database, so the package travels: the platform's `translations.import` takes it as the
  admin's export was taken for the five languages before it.
- **The seven published modules' texts, 605**, by code in `modules/<key>/registry/de.json` (D-263): HSE 218,
  Arbetstid och återhämtning 28, Bygg og anlegg 48, Helse og omsorg 49, Handel 49, Barnehage og skole 102
  (with both wordings of its 26 worded texts and its worded factor name), Kunnskap og kontor 111 (of which
  8 are factor names an earlier file left in one database and no file names). A module text's registry key
  is its item's uuid, which differs between databases — a draft keyed by one database's ids reaches no
  other — so the files carry the module's own codes and `npm run -s modules:registry` resolves them against
  the database it runs on, hashed on the bokmål each translates. The registry-file format grew `segments`,
  `variants` and `factorVariants` for this (`lib/modules/registry-file.ts`). `tests/unit/german-survey.test.ts`
  holds each file to its module's definition.

Both reached the hosted registry on 2026-10-29 (D-292), where the platform's auto-approve switch (0101)
approved them as written, marked `approved_auto`, as it did the five languages before. Tor signed `locale_de`
off the same evening (X-116), so German is offered wherever a survey's texts are approved; the open questions
below are for the German reader, whose corrections become new versions.

### Register

Sie throughout, as in the app. The respondent is «Sie», colleagues «Kolleginnen und Kollegen», the line
manager «Führungskraft» («Ihre Führungskraft», «meine direkte Führungskraft» in HSE), management
«die Leitung», the signature of an invitation «Geschäftsführung» (a function, no gender), the third role
«Arbeitnehmervertretung» («Geschäftsführung und Arbeitnehmervertretung sehen dieselben Zahlen zur
gleichen Zeit»). «Beschäftigte» for ansatte, «das ganze Unternehmen» for hele virksomheten. Never the
generic masculine, never the Binnen-I or the asterisk.

### Scales (one set each, used everywhere)

| nb | de | Why / rejected alternative |
|---|---|---|
| Helt uenig / Litt uenig / Verken eller / Litt enig / Helt enig | **Stimme gar nicht zu / Stimme eher nicht zu / Weder noch / Stimme eher zu / Stimme voll zu** | The established German bipolar agreement scale; «eher» carries the source's «litt» in the two middle steps. Rejected: «Stimme nicht zu / Stimme zu» for them, which read as full disagreement and agreement; «Teils, teils» for the midpoint, which reads as «partly true» rather than neither. HSE's module keeps HSE's own five answers without «eher» (below), as its instrument has them. |
| I svært liten grad … I svært stor grad | **In sehr geringem Maß / In geringem Maß / In gewissem Maß / In hohem Maß / In sehr hohem Maß** | «Maß» rather than «Ausmaß»; «In gewissem Maß» for the middle, where «In mittlerem Maß» is not idiomatic. |
| Svært usannsynlig / Lite sannsynlig / Kanskje / Sannsynlig / Svært sannsynlig | **Sehr unwahrscheinlich / Eher unwahrscheinlich / Vielleicht / Wahrscheinlich / Sehr wahrscheinlich** | Symmetric around «Vielleicht». |
| Ja / Nei / Vet ikke | **Ja / Nein / Weiß nicht** | |
| Vil ikke svare | **Keine Angabe** | The standard German survey option; «Möchte nicht antworten» is longer and rarer on a form. |
| Ikke relevant for meg | **Trifft auf mich nicht zu** | The German not-applicable option; «Nicht relevant für mich» rejected as a calque. |
| HSE frekvens: Aldri / Sjelden / Noen ganger / Ofte / Alltid | **Nie / Selten / Manchmal / Oft / Immer** | |
| HSE enighet: Helt uenig / Uenig / Verken eller / Enig / Helt enig | **Stimme gar nicht zu / Stimme nicht zu / Weder noch / Stimme zu / Stimme voll zu** | HSE's own scale, kept apart from the core's. HSE publishes no German version, so these are drafts. |

### Terms in the survey

| nb | de | Why |
|---|---|---|
| måling, kartlegging, undersøkelse | **Befragung**; «Befragung zum Arbeitsumfeld» for arbeidsmiljøundersøkelsen | As the app (above). |
| grunnlinje / puls / oppfølging (round names) | **Basisbefragung {year} / Pulsbefragung {year} / Pulsbefragung {n} · {year} / Folgebefragung {year}** | Without an article, so «zur {round}», «bei der {round}» and «Die {round} endet morgen» stay grammatical in every mail that embeds a round name. |
| tiltak | **Maßnahme(n)** | § 3 ArbSchG's word; «Wirkung der Maßnahmen» for effekt av tiltakene. |
| lederen din | **Ihre Führungskraft** | Also the fallback for `{name}` where a leader has no stored name: fits the title, the text and the button of the contact offer, not the salutation of the prepared mail («Hallo Ihre Führungskraft,») — see the open questions. |
| ledelsen | **die Leitung** | «Geschäftsleitung» is narrower than the source. |
| daglig leder (signature) | **Geschäftsführung** | |
| verneombud | **Arbeitnehmervertretung** in the survey's thank-you text | The German pack says «Betriebsrat» on German hosts; the survey text is read in every market, so the general word. |
| krenkende atferd, trakassering, mobbing | **verletzendes Verhalten, Belästigung, Mobbing** | «Belästigung» is the AGG's word for trakassering; «verletzendes Verhalten» the plain word for krenkende atferd. |
| vold og trusler | **Gewalt und Drohungen** | |
| kollegaer | **Kolleginnen und Kollegen**; «kollegiale Unterstützung» for the factor | |
| anbefalingsspørsmål | **Empfehlungsfrage** | |
| åpent felt | **Offenes Feld** | |
| terskel ({threshold} har svart) | «wenn mindestens {threshold} geantwortet haben» | The number stands alone, as in the source. |
| samtale (anonymous thread) | **Gespräch**; «Gespräch öffnen» | |
| kunder (handel) | **Kundschaft** | Gender-neutral collective. |
| pasienter, brukere og pårørende (helse) | **Betreute und Angehörige** | Covers care and health settings without «Patienten». |
| stillingsprosent | **Stellenumfang** | |
| barna / elevene (barnehage og skole variants) | **die Kinder** / **die Schülerinnen und Schüler** | The two wordings of the module (0083). |
| arbeidsplan, vakt (arbetstid) | **Dienstplan**, **Dienst** | |

### Factor names

| nb | de |
|---|---|
| Ytringsklima | **Meinungsklima** |
| Arbeidsmengde og tidspress | **Arbeitsmenge und Zeitdruck** |
| Motstridende krav | **Widersprüchliche Anforderungen** |
| Kontakt og kommunikasjon | **Kontakt und Kommunikation** |
| Emosjonelle krav | **Emotionale Anforderungen** |
| Støtte fra leder | **Führungsunterstützung** |
| Medvirkning og kontroll | **Mitwirkung und Kontrolle** |
| Integritet og verdighet | **Integrität und Würde** |
| Rolleklarhet | **Rollenklarheit** |
| Støtte fra kollegaer | **Kollegiale Unterstützung** |
| Anerkjennelse og mening | **Anerkennung und Sinn** |

HSE's seven: Anforderungen, Kontrolle, Unterstützung durch Vorgesetzte, Unterstützung durch Kolleginnen und
Kollegen, Beziehungen, Rolle, Veränderung. Arbetstid's five: Dienstplan und Planbarkeit, Erholung und Ruhe,
Erreichbarkeit und Grenzen, Überstunden und lange Arbeitstage, Nacht, Schicht und lange Dienste.

### Typography and SMS

As the app: „…“, the spaced en dash, «{date}» bare after a colon and «am {date}» in running text, «um {time} Uhr».
The four SMS texts use only GSM-7 characters (ä, ö, ü and ß are in the basic set) and each fits one
message with its placeholders filled; `checkImport` raises no `sms_long`. Every plural carries German's two
categories; `countLead` keeps the source's exact branches (=1, =2, =3, other) with the numbers written out.

### How the draft was made

One session, from the admin's own catalogue of 2026-10-29 built against the local database's seven modules
(`lib/i18n/survey-catalogue.ts`), section by section, following this page. The product's texts were
assembled into the package with `buildPackage` and checked with the same `checkImport` the import runs
(212 rows, zero errors, zero warnings) and with the typography checks above; the module texts were re-keyed
from the catalogue's ids to the modules' codes and checked against each module's definition. Reviewed in the
browser on the QA stack (D-292). Module rows carry the SHA-256 of the bokmål they translate; the registry
script lays one only while that bokmål is still the module's (D-253).

### Open questions for the human reviewer (survey)

1. **«Stimme eher (nicht) zu»** for the core's middle steps against HSE's plain «Stimme (nicht) zu»: two
   scales in one survey when a round carries the HSE module. A methodologist decides whether the core keeps
   «eher».
2. **«Ihre Führungskraft» as the `{name}` fallback** reads wrong in the prepared mail's salutation («Hallo
   Ihre Führungskraft,»). The slot is rare (a leader without a stored name) and the person edits the mail
   before sending; Swedish has the same limit with «Chefen». An alternative is a bare «Führungskraft»,
   which fails in «eine E-Mail an {name} schreiben».
3. **«die Leitung» for ledelsen** against «die Geschäftsleitung» and «das Management».
4. **«Betreute und Angehörige»** for pasienter, brukere og pårørende in the health module, where a hospital
   would say «Patientinnen und Patienten».
5. **«Weder noch»** as the midpoint against «Teils, teils» (common in German employee surveys, but not
   neutral) and «Unentschieden».
6. **The round names without an article.** «Zur Basisbefragung 2026» reads well; a reviewer should read the
   four mails that embed a round name («Die {round} endet morgen») once more with each kind.
