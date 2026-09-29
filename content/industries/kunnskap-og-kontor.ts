import type { IndustryPage } from './types'

/**
 * /kunnskap-og-kontor — from docs/implementation/bransje-kunnskap-og-kontor.md (the handoff,
 * 2026-09-27). Every statement it quotes is the module file's (modules/kunnskap-og-kontor/v1.json)
 * by code; the preview, the overview and the loop show the simplified set, and the question page
 * lists the extended set with a switch to the simplified one (D-137). Every figure carries its source.
 *
 * Launched 2026-09-28 with the module published as provisional (X-078); the brief's open decisions
 * (§ 8) keep their defaults.
 * The brief's card text and sort order belong to the front page's industry block, which is not
 * built. Parts the template needs and the brief does not write (the loop's steps, the overview's
 * closing note, the question page's words) follow the other industries', in this one's words. The
 * brief's answer about home workers claimed statements hidden by work form, which is not built;
 * it says what is: «Ikke relevant for meg» (0087).
 */
export const kunnskapOgKontor: IndustryPage = {
  slug: 'kunnskap-og-kontor',
  navLabel: 'Kunnskap og kontor',
  launched: true,
  card: { newUntil: '2026-12-27' },
  module: { key: 'kunnskap-og-kontor', defaultVariant: 'forenklet' },
  moduleName: { title: 'Kontor-modulen', inline: 'kontor-modulen' },
  seo: {
    title: 'Arbeidsmiljøundersøkelse for kunnskap og kontor | Orgpuls',
    description:
      'Medarbeiderundersøkelse for rådgivning, IT, finans, media og eiendom: konsentrasjon, digitale verktøy, tilgjengelighet, restitusjon, hybridarbeid og KI. Forenklet eller utvidet. Anonymt.',
  },
  hero: {
    pill: 'Rådgivning, IT, finans, media og eiendom',
    h1: 'Arbeidsmiljø­undersøkelse for kunnskap og kontor',
    lead:
      'Hovedundersøkelsen måler arbeidsmengde, roller og støtte. Kontor-modulen legger til det som preger kunnskapsarbeid: avbrytelser og møter, digitale verktøy, tilgjengelighet utenom arbeidstid, restitusjon, hybridarbeid og KI. Velg forenklet eller utvidet, alt anonymt.',
    thresholdNote: 'Ingen gruppe vises før minst fem har svart.',
    preview: {
      company: 'Fjellstad Rådgivning AS',
      caption: 'Kontor-modulen, forenklet · indeks 0–100',
      columns: ['Rådgivning · 18', 'IT · 12', 'Administrasjon · 7'],
      rows: [
        { factorKey: 'f_konsentrasjon', values: [48, 57, 66] },
        { factorKey: 'f_tilgjengelighet', values: [44, 59, 71] },
        { factorKey: 'f_privatliv_restitusjon', values: [51, 63, 69] },
        { factorKey: 'f_hybrid', values: [62, 49, 74] },
        { factorKey: 'f_laering', values: [70, 66, 52] },
        { factorKey: 'f_teknologi_ki', values: [58, 72, 47] },
      ],
      footnote: 'Tersklene er foreløpige til modulen er validert. Eksempelet er en tenkt virksomhet.',
    },
  },
  challengesIntro: {
    title: 'Ni utfordringer i kunnskaps- og kontorarbeid',
    text: 'Hentet fra internasjonal forskning og nordiske kilder. Åtte måles i kontor-modulen, én dekkes av hovedundersøkelsen. Alle kan følges opp med tiltak på samme måte som resten av arbeidsmiljøet.',
  },
  challenges: [
    {
      title: 'Arbeidsdagen blir hakket opp',
      body: 'Avbrytelser og oppgavebytte gir feil, forsinkelser, stress og utmattelse, viser en gjennomgang av 247 publikasjoner.{{cite:puranik2020}} Antall møter henger sammen med daglig tretthet.{{cite:luong2005}} I Microsofts brukerundersøkelse sier 68 prosent at de mangler nok uavbrutt fokustid – leverandørtall, men i tråd med forskningen.{{cite:ms_wti2023}}',
      measuredBy: { kind: 'module', itemCode: 'KK-FA-1' },
    },
    {
      title: 'For mange kanaler, for mange varsler',
      body: 'Teknostress – overbelastning, kompleksitet og stadige endringer i verktøy – henger sammen med stress og utbrenthet.{{cite:tarafdar2007}} God opplæring og brukerstøtte demper effekten.{{cite:day2012}} Digitalt stress er nå målt og validert også i Norge.{{cite:dss_no}}',
      measuredBy: { kind: 'module', itemCode: 'KK-DV-2' },
    },
    {
      title: 'Alltid på',
      body: 'Kontakt om jobb utenom arbeidstid undergraver helse og balansen mellom jobb og fritid, selv når fleksibelt arbeid ellers gir bedre arbeidstid.{{cite:eurofound_wtq}} Trangen til å svare raskt – telepress – svekker evnen til å koble av.{{cite:barber2015}} Der det finnes tydelige frakoblingsregler, er telepresset lavere.{{cite:barber2026}}',
      measuredBy: { kind: 'module', itemCode: 'KK-TG-1' },
    },
    {
      title: 'Jobben følger med hjem',
      body: 'I EU-OSHAs undersøkelse, som også omfattet Norge, rapporterte 37 prosent generell utmattelse og 27 prosent stress, angst eller depresjon.{{cite:osha_pulse}} Mental løsrivelse fra jobben i fritiden er den mest robuste formen for restitusjon.{{cite:sonnentag2007}}',
      measuredBy: { kind: 'module', itemCode: 'KK-RE-1' },
    },
    {
      title: 'Sammen, men hver for oss',
      body: 'Andelen som jobber hjemmefra flere dager i uka, er mer enn doblet siden 2019.{{cite:stami_faktabok}} Hjemmekontor gir mer kontroll og balanse, men også mindre kollegastøtte og økte krav til tilgjengelighet.{{cite:stami_hjemmekontor}} Faglig isolasjon svekker ytelsen, særlig for dem som jobber mye hjemme.{{cite:golden2008}}',
      measuredBy: { kind: 'module', itemCode: 'KK-TN-2' },
    },
    {
      title: 'Landskap og kjøkkenbord',
      body: 'I kontorlandskap veier støy og manglende skjerming tyngre enn fordelen ved lettere kontakt.{{cite:kim2013}} Når arbeidet gjøres hjemme, krever hjemmekontorforskriften skriftlig avtale og et forsvarlig arbeidsmiljø – også det psykososiale.{{cite:hjemmekontorforskriften}}',
      measuredBy: { kind: 'module', itemCode: 'KK-FY-1' },
    },
    {
      title: 'Kompetanse som går ut på dato',
      body: 'Utviklingsmuligheter er en av de viktigste ressursene i jobben og demper belastningen fra høye krav.{{cite:bakker2007}} I kunnskapsbransjene endres kompetansekravene raskt, ikke minst på grunn av KI.',
      measuredBy: { kind: 'module', itemCode: 'KK-LU-2' },
    },
    {
      title: 'KI endrer jobben raskere enn opplæringen',
      body: 'Nesten fem av ti norske foretak med minst ti ansatte bruker KI i 2026 – og ni av ti i informasjon og kommunikasjon.{{cite:ssb_ki}} Der ansatte får opplæring og blir involvert, rapporterer de bedre utfall.{{cite:oecd_ai}}',
      measuredBy: { kind: 'module', itemCode: 'KK-KI-1' },
    },
    {
      title: 'Mye å gjøre',
      body: 'Arbeidsmengde, tidspress, rolleklarhet og medvirkning er kjernen i hovedundersøkelsen og gjentas ikke i modulen. Modulen spør i stedet hvor presset kommer fra: avbrytelser, kanaler, tilgjengelighet og kunder.',
      measuredBy: { kind: 'core', factorKey: 'mengde', ordinal: 1, alongside: [2, 3] },
    },
  ],
  moduleOverview: {
    title: 'Kontor-modulen',
    intro:
      'Et tillegg til hovedundersøkelsen, bygget på samme måte: påstander på en femdelt skala, indeks fra 0 til 100 og tre forslag til tiltak per faktor. Velg forenklet (24 påstander, ca. 3 minutter) eller utvidet (opptil 62 påstander, ca. 7 minutter). De 24 kjernepåstandene er med i begge.',
    coreNote: 'Modulen gjentar ikke disse, men spør hvor presset kommer fra i kunnskapsarbeid.',
  },
  loop: {
    title: 'Fra svar til tiltak på neste teammøte',
    steps: [
      { title: 'Mål', text: 'Hovedmåling med kontor-modulen, forenklet eller utvidet, på SMS eller e-post.' },
      { title: 'Se per team', text: 'Resultat per team eller avdeling, for grupper med minst fem svar.' },
      { title: 'Velg tiltak', text: 'Tre forslag per faktor. Hvert tiltak får en eier og en frist.' },
      { title: 'Mål igjen', text: 'Pulsen spør bare om faktorene dere jobber med, til tiltaket har virket.' },
    ],
    example: {
      factorKey: 'f_tilgjengelighet',
      actionType: 'workshop',
      groupLabel: 'Rådgivning',
      chips: ['Foreslått', 'Besluttet med verneombud', 'Pågår', 'Effekt målt i pulsen', 'Lukket over 60'],
      on: 2,
    },
  },
  law: {
    title: 'Det loven peker på i kunnskaps- og kontorarbeid',
    intro: 'Kontor-modulen gir dokumentasjon for kartleggingen der kunnskapsarbeid har egne belastninger. Hver faktor viser hjemmelen i rapporten.',
    items: [
      {
        ref: 'aml § 4-3 og forskriften kap. 1A',
        text: 'Fra 1. januar 2026 stiller loven tydeligere krav til det psykososiale arbeidsmiljøet. Faktorene skal kartlegges og risikovurderes systematisk, i samarbeid med de ansatte.',
        reviewed: true,
      },
      { ref: 'aml § 4-2', text: 'Ved omstilling og ny teknologi skal de ansatte få informasjon, medvirkning og nødvendig opplæring.', reviewed: true },
      { ref: 'aml § 10-8', text: 'Arbeidstakere har krav på daglig og ukentlig arbeidsfri – også når de kan nås på mobilen.', reviewed: true },
      {
        ref: 'Hjemmekontorforskriften',
        text: 'Fast hjemmearbeid krever skriftlig avtale, og arbeidsmiljøet hjemme skal være fullt forsvarlig, også det psykososiale.',
        reviewed: true,
      },
      { ref: 'aml kapittel 9', text: 'Kontrolltiltak, også digitale, må ha saklig grunn og drøftes med de ansattes representanter.', reviewed: true },
      {
        ref: 'EUs KI-forordning art. 4',
        text: 'Virksomheter som bruker KI, skal sørge for tilstrekkelig KI-kompetanse hos de ansatte. Status i EØS må verifiseres.',
        reviewed: true,
      },
    ],
  },
  faq: [
    {
      q: 'Forenklet eller utvidet – hva skal vi velge?',
      a: 'Forenklet er 24 påstander og tar rundt tre minutter ekstra. Utvidet er opptil 62 påstander og passer som fordypning, for eksempel annethvert år. De 24 kjernepåstandene er med i begge, så resultatene kan sammenlignes over tid.',
    },
    {
      q: 'Er spørsmålene validert?',
      a: 'Faktorene bygger på validerte skalaer og forskning, men formuleringene er våre egne. Modulen er merket som foreløpig til den er testet i en pilot, og risikonivåene vises som foreløpige så lenge.',
    },
    {
      q: 'Ser lederen hvem som ble kontaktet i fritiden?',
      a: 'Nei. Spørsmålet vises bare som antall for hele virksomheten, aldri per team. Ingen gruppe vises før minst fem har svart, og grensen kan ikke senkes.',
    },
    {
      q: 'Vi jobber mye hjemmefra. Passer modulen?',
      a: 'Ja. Påstandene om samarbeid, sparring og utstyr gjelder uansett hvor man jobber. Den som ikke bruker kontoret, kan svare «Ikke relevant for meg» på påstanden om arbeidsplassen der, og det svaret teller ikke i indeksen.',
    },
    {
      q: 'Hva koster det?',
      a: 'Liten koster 265 kr i måneden for til og med 25 ansatte, Vanlig 565 kr for 26–100 ansatte. Prisene er eks. mva., uten binding og med 15 dager gratis.',
    },
  ],
  cta: {
    title: 'Prøv det på deres egen virksomhet',
    text: 'Skriv inn organisasjonsnummeret, legg inn ansattlista og send på SMS eller e-post. Dere er i gang på tre minutter, uten kortopplysninger.',
  },
  questionPage: {
    crumb: 'Spørsmålssettet',
    h1: 'Spørsmåls­settet for kunnskap og kontor',
    lead: 'Utvidet er femten faktorer og opptil 62 påstander. Forenklet er åtte faktorer med tre påstander hver, alle kjernepåstander som også er med i utvidet. Hver faktor har en begrunnelse fra forskning eller regelverket, en hjemmel og tre forslag til tiltak som kan måles på nytt i pulsen.',
    scaleNote: 'Påstandene står i tilfeldig rekkefølge for hver person. Ordlyden er låst, så tallene kan sammenlignes fra måling til måling.',
    countTitle: 'Fire spørsmål som bare telles',
    countIntro: 'Noen spørsmål passer ikke i en indeks, men sier mye om tilgjengelighet og hjemmekontor. De vises bare som antall for hele virksomheten.',
    segmentsTitle: 'Bakgrunnsspørsmål',
    segmentsIntro: 'Valgfrie, for å se forskjell mellom arbeidsformer og hvor mye som går til kundearbeid. Lederrolle og stillingstype brukes ikke, fordi det gir for små grupper.',
    rulesTitle: 'Slik rapporteres svarene',
    rules: [
      { title: 'Minst fem svar', text: 'Ingen gruppe eller segment vises før minst fem har svart. Grensen kan heves, men aldri senkes.' },
      { title: 'Ingen regning bakover', text: 'Hvis en gruppe kan regnes ut fra totalen og de andre gruppene, holdes en gruppe til tilbake.' },
      { title: 'Ja/nei-spørsmålene', text: 'KK-T-1 til KK-T-4 vises bare som antall for hele virksomheten, aldri per team eller segment. «Jobber ikke fast hjemmefra» holdes utenfor andelen.' },
      { title: 'Forenklet og utvidet', text: 'Kjernepåstandene er med i begge. I utvidet regnes de åtte forenklede faktorene også ut, som sammenlignbar indeks.' },
      { title: 'Samme indeks', text: 'Hver påstand regnes om til 0–100, og faktoren er snittet av sine påstander. En faktor vises bare når alle påstandene i den er stilt.' },
      { title: 'Foreløpige terskler', text: '65 eller mer er lav risiko, 50–64 middels og under 50 høy – det samme som i hovedundersøkelsen, men merket foreløpig til modulen er validert.' },
      { title: 'Pulsen', text: 'Når en faktor har åpne tiltak, kommer påstanden tiltaket skal måles på med i neste puls.' },
    ],
    coreNote: 'Kontor-modulen gjentar ikke disse.',
    cta: { title: 'Legg kontor-modulen til neste måling', text: 'Skriv inn organisasjonsnummeret. Dere er i gang på tre minutter, uten kortopplysninger.' },
  },
  related: ['bygg-og-anlegg'],
  sourcesFromFactors: false,
}
