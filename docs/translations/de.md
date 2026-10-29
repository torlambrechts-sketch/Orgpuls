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
