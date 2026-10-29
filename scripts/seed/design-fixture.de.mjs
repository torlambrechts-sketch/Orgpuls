/**
 * The design fixture in Germany (DE-F3, D-291): the same scenario, the same answers and so the same
 * figures (index 61, 64 the year before, 28 of 34), told by a German firm in German, for the German
 * site's product pictures. `node scripts/seed/design-fixture.mjs --market de` emits it.
 *
 * Nothing about the numbers is here: design-fixture.mjs solves them once, for every market. This file
 * holds what a German reader reads instead of the Norwegian — the firm, its people and departments,
 * the comments, the measures, the risk assessment — keyed by the exact Norwegian text it replaces, so
 * a Norwegian text that changes without its German one stops the generator rather than leaking into
 * a picture. And the organisation's own facts in Germany: the market, its language and clock, a
 * USt-IdNr., and no Norwegian register or occupational health service.
 *
 * **Nothing here is real.** Nordwind Tiefbau GmbH is invented. Its number, DE999999995, has the shape
 * of a USt-IdNr. (DE and nine digits, the ninth the ISO 7064 MOD 11,10 check digit of the first eight,
 * app.de_ustid_check, 0236), at the far end of the series. People are invented; addresses are on
 * `.example`, and the streets in the towns named are made up. The works council (Betriebsrat) is the
 * firm's third role in Germany (docs/markets/de-legal.md § 5): its chair is the counterpart the
 * baseline's setup names.
 */

/** The organisation's own id space: the fixture's ids with 8049 in the fourth group */
export const ID_FROM = '00000000-0000-4000-8000-'
export const ID_TO = '00000000-0000-4000-8049-'

export const ORG = {
  market: 'de',
  lang: 'de',
  timezone: 'Europe/Berlin',
  name: 'Nordwind Tiefbau GmbH',
  number: 'DE999999995',
}

/** Every Norwegian text the fixture writes, and the German that replaces it */
export const TEXT = {
  // the organisation, its departments and the people the design names
  'Nordvik Anlegg AS': 'Nordwind Tiefbau GmbH',
  '924118742': ORG.number,
  Drift: 'Betrieb',
  Prosjekt: 'Projekt',
  Verksted: 'Werkstatt',
  Administrasjon: 'Verwaltung',
  'Kari Nordbø': 'Katrin Nordmann',
  'Tomas Vik': 'Thomas Wieck',
  'Anne Rygg': 'Anne Rieck',
  'Tuva Berg': 'Tanja Berg',
  'kari@nordvik.example': 'katrin@nordwind.example',
  'tomas@nordvik.example': 'thomas@nordwind.example',
  'anne@nordvik.example': 'anne@nordwind.example',
  'tuva@nordvik.example': 'tanja@nordwind.example',
  '@nordvik.example': '@nordwind.example',
  'Kari Sund, tillitsvalgt Fellesforbundet': 'Karin Sund, Betriebsratsvorsitzende',

  // where the work happens
  Hovedkontor: 'Hauptsitz',
  'Industriveien 14, 3229 Sandefjord': 'Industriestraße 14, Lüneburg',
  'Anlegg Larvik': 'Baustelle Uelzen',
  'Elveveien 8, 3262 Larvik': 'Flussweg 8, Uelzen',
  'Verksted Stokke': 'Werkstatt Winsen',
  'Bekkeveien 2, 3160 Stokke': 'Bachweg 2, Winsen (Luhe)',

  // the rounds' own names (the screens name a round from its kind and dates)
  'Grunnlinje 2023': 'Basisbefragung 2023',
  'Grunnlinje 2024': 'Basisbefragung 2024',
  'Grunnlinje 2025': 'Basisbefragung 2025',
  'Grunnlinje 2026': 'Basisbefragung 2026',
  'Puls mai 2025': 'Puls Mai 2025',
  'Puls august 2025': 'Puls August 2025',
  'Puls mars 2026': 'Puls März 2026',
  'Puls 2026': 'Puls 2026',

  // the measures
  'Fast svar på avviksmeldinger innen fem dager': 'Feste Antwort auf Mängelmeldungen innerhalb von fünf Tagen',
  'Verksted meldte fire avvik i vår uten å få svar. Tiltaket er å gi hver melding et navngitt svar innen fem virkedager.':
    'Die Werkstatt hat im Frühjahr vier Mängel gemeldet, ohne eine Antwort zu bekommen. Die Maßnahme: Jede Meldung erhält innerhalb von fünf Arbeitstagen eine Antwort von einer namentlich genannten Person.',
  'Prioriteringsmøte hver mandag på Prosjekt': 'Prioritätenrunde jeden Montag im Projekt',
  'Tre parallelle prosjekter uten uttalt rekkefølge. Møtet skal ende med én skriftlig prioritert liste.':
    'Drei parallele Projekte ohne ausgesprochene Reihenfolge. Die Runde endet mit einer schriftlichen Prioritätenliste.',
  'Varslingsrutinen gjennomgått i alle team': 'Das Meldeverfahren in allen Teams durchgegangen',
  'Effekten måles i pulsen 12. oktober. Tiltaket kan lukkes når ytringsklima er målt på nytt.':
    'Die Wirkung wird in der Pulsbefragung am 12. Oktober gemessen. Die Maßnahme kann geschlossen werden, wenn das Meinungsklima neu gemessen ist.',
  'Fadderordning for nyansatte første åtte uker': 'Patenschaft für neue Beschäftigte in den ersten acht Wochen',
  'Lederstøtte falt mest blant de som har vært her under et år. Fadderen er kollega, ikke leder.':
    'Die Unterstützung durch die Führungskraft ist am stärksten bei denen gesunken, die weniger als ein Jahr hier sind. Die Patin oder der Pate ist aus dem Kollegium, keine Führungskraft.',
  'Varslingsrutinen trykket og hengt opp på alle rigger': 'Das Meldeverfahren gedruckt und auf allen Baustellen ausgehängt',
  'Ytringsklima gikk fra 39 til 48 i grunnlinjen etterpå. Effekten er dokumentert og tiltaket lukket.':
    'Das Meinungsklima stieg in der folgenden Basisbefragung von 39 auf 48. Die Wirkung ist dokumentiert und die Maßnahme geschlossen.',
  'Tiltaket vurderes som ikke tilstrekkelig alene, og følges opp med fast svarfrist på avviksmeldinger.':
    'Die Maßnahme reicht allein nicht aus und wird mit einer festen Antwortfrist für Mängelmeldungen weitergeführt.',
  'To innleide ekstra i høysesongen': 'Zwei zusätzliche Leihkräfte in der Hochsaison',
  'Arbeidsmengde steg fire poeng, men falt tilbake i 2026. Vurder om tiltaket må gjentas.':
    'Die Arbeitsmenge stieg um vier Punkte, fiel 2026 aber zurück. Prüfen, ob die Maßnahme wiederholt werden muss.',
  'Effekten er borte året etter. Det vurderes om tiltaket må gjentas fast hver høysesong.':
    'Die Wirkung ist im Jahr darauf verschwunden. Wir prüfen, ob die Maßnahme in jeder Hochsaison fest wiederholt wird.',
  'Faste fredagsgjennomganger på Verksted': 'Feste Freitagsrunden in der Werkstatt',
  'Kollegastøtte er den høyeste faktoren i 2026. Tiltaket regnes som virksomt og videreføres som rutine.':
    'Die Unterstützung durch Kolleginnen und Kollegen ist 2026 der höchste Faktor. Die Maßnahme gilt als wirksam und wird als Routine weitergeführt.',
  'Tiltaket regnes som virksomt og videreføres som fast rutine.': 'Die Maßnahme gilt als wirksam und wird als feste Routine weitergeführt.',

  // the risk assessment
  'Sannsynlighet for uønsket tilstand vurdert mot konsekvens for helse, sikkerhet og velferd. Faktorene er også vurdert samlet, siden arbeidsmengde og motstridende krav virker sammen.':
    'Die Wahrscheinlichkeit eines unerwünschten Zustands, bewertet gegen die Folgen für Gesundheit und Sicherheit. Die Faktoren sind auch zusammen beurteilt, weil Arbeitsmenge und widersprüchliche Anforderungen zusammenwirken.',
  'Ansatte melder at avvik ikke følges opp. Over tid svekker det både sikkerhetsarbeidet og tilliten, og øker risikoen for at alvorlige forhold ikke kommer fram.':
    'Beschäftigte melden, dass Mängeln nicht nachgegangen wird. Mit der Zeit schwächt das die Sicherheitsarbeit und das Vertrauen, und es wird wahrscheinlicher, dass ernste Zustände nicht ans Licht kommen.',
  'Vedvarende ubalanse mellom oppgaver og tid på Prosjekt. Kombinert med uklare prioriteringer gir det risiko for helseskadelig belastning over tid.':
    'Ein anhaltendes Missverhältnis zwischen Aufgaben und Zeit im Projekt. Zusammen mit unklaren Prioritäten ergibt das auf Dauer das Risiko einer gesundheitsschädlichen Belastung.',
  'Motstridende krav forsterker belastningen fra arbeidsmengde. Vurderes samlet med faktoren over.':
    'Widersprüchliche Anforderungen verstärken die Belastung durch die Arbeitsmenge. Wird zusammen mit dem Faktor darüber beurteilt.',

  // information and training
  'Oppsummering av funnene lagt fram på allmøte.': 'Eine Zusammenfassung der Ergebnisse in der Betriebsversammlung vorgestellt.',
  'Samme oppsummering skriftlig i personalhåndboka.': 'Dieselbe Zusammenfassung schriftlich im Mitarbeiterhandbuch.',
  'Saksframlegget delt en uke før AMU.': 'Die Vorlage eine Woche vor dem Arbeitsschutzausschuss verteilt.',
  'Hver leder fikk sine egne tall samme uke som resultatet ble frigitt.':
    'Jede Führungskraft bekam ihre eigenen Zahlen in der Woche, in der das Ergebnis freigegeben wurde.',
  'Oppfølging av psykososiale forhold': 'Psychische Belastung in der Praxis',
  'Kurs for ledere med personalansvar.': 'Schulung für Führungskräfte mit Personalverantwortung.',
  'Gjennomgang av varslingsrutinen': 'Durchgang durch das Meldeverfahren',
  'Gjennomgått i alle team.': 'In allen Teams durchgegangen.',

  // the comments and the replies to them
  'Høysesongen er umulig med dagens bemanning.': 'Die Hochsaison ist mit der heutigen Besetzung nicht zu schaffen.',
  'Vi leier inn to ekstra fra januar. Si fra om det monner.': 'Wir holen ab Januar zwei Leihkräfte dazu. Sagt Bescheid, ob es hilft.',
  'Vi har meldt om den samme feilen på løfteutstyret tre ganger.': 'Wir haben denselben Fehler am Hebezeug dreimal gemeldet.',
  'Utstyret er byttet 3. oktober. Takk for at du sto på.': 'Das Gerät wurde am 3. Oktober ausgetauscht. Danke, dass du drangeblieben bist.',
  'Vil bare si at omleggingen av morgenmøtet var et godt grep.': 'Wollte nur sagen, dass die Umstellung der Morgenbesprechung ein guter Schritt war.',
  'Godt å høre — vi beholder det.': 'Gut zu hören – wir behalten das bei.',
  'Ny leder er engasjert, men vi ser henne for lite ute.': 'Die neue Chefin ist engagiert, aber wir sehen sie zu selten draußen.',
  'Jeg setter opp faste besøk på anleggene hver tirsdag fra juni.': 'Ich richte ab Juni feste Besuche auf den Baustellen jeden Dienstag ein.',
  'Fredagsgjennomgangene har gjort at vi faktisk snakker sammen.': 'Durch die Freitagsrunden reden wir tatsächlich miteinander.',
  'Da fortsetter vi med dem.': 'Dann machen wir damit weiter.',
  'Alle prosjektene har frist samme uke i november. Hvert år.': 'Alle Projekte haben in derselben Novemberwoche Abgabe. Jedes Jahr.',
  'Vi tar det opp med kundene før neste kontraktsrunde.': 'Wir sprechen das vor der nächsten Vertragsrunde mit den Kunden an.',
  'Det hjelper ikke å si fra. Vi meldte avvik på riggingen i vår og hørte aldri noe.':
    'Es bringt nichts, etwas zu sagen. Wir haben im Frühjahr einen Mangel an der Baustelleneinrichtung gemeldet und nie etwas gehört.',
  'Man blir fort stemplet som vanskelig hvis man tar opp ting på morgenmøtet.':
    'Man gilt schnell als schwierig, wenn man in der Morgenbesprechung etwas anspricht.',
  'Avviksskjemaet er så tungvint at folk heller lar være.': 'Das Mängelformular ist so umständlich, dass die Leute es lieber lassen.',
  'Lederen min tar det på alvor når jeg sier fra. Det burde gjelde alle.':
    'Bei uns wird es ernst genommen, wenn ich etwas sage. Das sollte überall gelten.',
  'Takk — vi tar det med inn i arbeidet med ytringsklima.': 'Danke – wir nehmen das in die Arbeit am Meinungsklima mit.',
  'Tre prosjekter samtidig og ingen som sier hva som skal vike.': 'Drei Projekte gleichzeitig, und niemand sagt, was zurückstehen soll.',
  'Jeg jobber kveld nesten hver uke i høysesong.': 'In der Hochsaison arbeite ich fast jede Woche abends.',
  'To prosjektledere ber om det samme mannskapet samme uke.': 'Zwei Projektleitungen wollen in derselben Woche dieselbe Kolonne.',
  'Etter ulykken i mai snakket vi aldri om det.': 'Nach dem Unfall im Mai haben wir nie darüber gesprochen.',
  'Lederen er flink, men sitter aldri ute hos oss.': 'Die Leitung ist gut, aber nie draußen bei uns.',
  'Samholdet på laget er det beste med jobben.': 'Der Zusammenhalt in der Kolonne ist das Beste an der Arbeit.',
  'Omleggingen av morgenmøtet var et godt grep.': 'Die Umstellung der Morgenbesprechung war ein guter Schritt.',
  'Så fint å høre — vi fortsetter med det.': 'Schön zu hören – wir machen damit weiter.',
  'Fint at vi fikk være med å velge nytt verktøy.': 'Gut, dass wir beim neuen Werkzeug mitentscheiden durften.',
}

/**
 * What the organisation is in Germany, after the rows are written: no Norwegian register snapshot and
 * no occupational health service of the Norwegian kind (Betriebsarzt and Fachkraft für
 * Arbeitssicherheit are appointed as needed, §§ 2, 5 ASiG, and no industry list names them), no
 * fellesferie to skip, and each measure citing its factor's provision in the German pack
 * (lib/legal/pack.ts factorLawRefs) rather than a Norwegian one.
 */
export const AFTER = (org) => `
update app.organizations set
  bht_name = null, registry_fetched_at = null, registry_form_code = null, registry_form_label = null,
  registry_nace_code = null, registry_nace_label = null, registry_registered_on = null,
  registry_address = null, registry_municipality = null, registry_municipality_no = null,
  registry_employees = null, registry_vat = null
where id = '${org}';
update app.year_wheels set skip_fellesferie = false where org_id = '${org}';
update app.measures set law_ref = null where org_id = '${org}';`
