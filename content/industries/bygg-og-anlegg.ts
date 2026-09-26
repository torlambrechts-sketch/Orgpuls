import type { IndustryPage } from './types'

/**
 * /bygg-og-anlegg — ported from docs/reference/bygg-og-anlegg.html. Every statement it quotes
 * is the module file's (modules/bygg-og-anlegg/v1.json) by code; every figure carries the
 * source it came from. Two sentences of the reference describe factor toggles, which are
 * built but switched off (`module_factor_toggles`), and are left out until they ship (D-118).
 */
export const byggOgAnlegg: IndustryPage = {
  slug: 'bygg-og-anlegg',
  navLabel: 'Bygg og anlegg',
  launched: false,
  module: { key: 'bygg-og-anlegg', version: '1.0.0' },
  moduleName: { title: 'Bygg-modulen', inline: 'bygg-modulen' },
  seo: {
    title: 'Arbeidsmiljøundersøkelse for bygg og anlegg | Orgpuls',
    description:
      'Medarbeiderundersøkelse for bygg og anlegg med egen bygg-modul: sikkerhet under tidspress, samordning, språk, nye og unge, psykisk helse og arbeidstid. Anonymt, på SMS, med tiltak.',
  },
  hero: {
    pill: 'Bygg, anlegg og verksted',
    h1: 'Arbeidsmiljø­undersøkelse for bygg og anlegg',
    lead:
      'Hovedundersøkelsen dekker det som gjelder alle arbeidsplasser. Bygg-modulen legger til det som skjer på en byggeplass: sikkerhet under tidspress, mange firma på samme sted, språk på laget, nye og unge, og om det er rom for å si at man ikke har det bra. Alt anonymt, på mobilen, med tiltak som følger opp.',
    thresholdNote: 'Ingen gruppe vises før minst fem har svart.',
    preview: {
      company: 'Nordvik Anlegg AS',
      caption: 'Hovedmåling september · indeks 0–100',
      columns: ['Prosjekt Nord · 14', 'Verksted · 9', 'Prosjekt Sør · 11'],
      rows: [
        { factorKey: 'sikkerhet_foran_fremdrift', values: [58, 71, 48] },
        { factorKey: 'planlegging_og_fremdrift', values: [44, 66, 39] },
        { factorKey: 'samordning_pa_byggeplassen', values: [51, 57, 47] },
        { factorKey: 'sprak_og_beskjeder', values: [63, 78, 55] },
        { factorKey: 'nye_og_unge', values: [69, 74, 61] },
        { factorKey: 'a_si_at_man_ikke_har_det_bra', values: [55, 62, 52] },
      ],
      footnote: 'Administrasjonen har tre svar og vises ikke som egen kolonne. Eksempelet er en tenkt virksomhet.',
    },
  },
  challengesIntro: {
    title: 'Åtte utfordringer som går igjen på byggeplassen',
    text: 'Hentet fra norsk, svensk og dansk tilsyn og forskning, og fra internasjonale funn der de nordiske tallene mangler. Alle åtte kan måles anonymt og følges opp med tiltak – på samme måte som resten av arbeidsmiljøet.',
  },
  challenges: [
    {
      title: 'Fremdriften går foran sikkerheten',
      body: 'Dødsfallene i bygg og anlegg er de laveste på ti år, men næringen hadde fortsatt 3 902 registrerte arbeidsskader i 2024.{{cite:at_kompass}} Svenske Arbetsmiljöverket fant i 2026 at tidspress, prispress og taushetskultur er det som oftest hindrer en god sikkerhetskultur på byggeplassen.{{cite:av_kultur}} Tallene i avvikssystemet sier lite om dette. Det gjør svarene på om folk tør å stanse en jobb.',
      measuredBy: { kind: 'module', itemCode: 'BA-SF-2' },
    },
    {
      title: 'Tidsplanen er laget uten dem som skal gjøre jobben',
      body: 'I en europeisk undersøkelse svarte 74 prosent i svensk byggbransje at de jobbet under tidspress, mot 47 prosent i EU.{{cite:ki_osa}} Det danske Arbejdstilsynet peker på urealistiske tidsplaner og dårlig planlegging som årsak, og på at tidspress gir ulykker fordi det ryddes mindre og hjelpemidler blir stående.{{cite:at_dk}} Hovedundersøkelsen måler arbeidsmengden. Bygg-modulen måler hvor den kommer fra.',
      measuredBy: { kind: 'module', itemCode: 'BA-PF-1' },
    },
    {
      title: 'Mange firma, uklart ansvar',
      body: 'På en byggeplass jobber hovedentreprenør, underentreprenører og innleide side om side. Når ansvaret for sikkerheten ligger hos noen uten tid, ressurser eller mandat, svekkes arbeidet – og det skjer oftest i prosjekter med mange aktører.{{cite:av_kultur}} Folk på laget merker det før noen andre.',
      measuredBy: { kind: 'module', itemCode: 'BA-SB-1' },
    },
    {
      title: 'Beskjeden som ikke ble forstått',
      body: 'Manglende felles språk, kulturforskjeller og mangelfull opplæring trekker fortsatt HMS-standarden ned på norske byggeplasser, viser Fafo.{{cite:fafo}} Siden 2024 må minst én på hvert arbeidslag kunne kommunisere både med laget og på norsk eller engelsk, når sikkerheten krever det.{{cite:at_sprak_krav}} Om det fungerer i praksis, vet bare de som står på laget.',
      measuredBy: { kind: 'module', itemCode: 'BA-SP-3' },
    },
    {
      title: 'De nye og de unge',
      body: 'Arbeidstakere under 25 år er de som oftest skades i bygg og anlegg.{{cite:at_kompass}} Rundt en av fem lærlinger slutter innen de første ti månedene.{{cite:nho_laerling}} Begge deler handler om det samme: om nye får opplæring, en fast person å spørre og tid til å lære før tempoet settes opp.',
      measuredBy: { kind: 'module', itemCode: 'BA-NU-1' },
    },
    {
      title: 'Det psykiske bak hjelmen',
      body: 'Fra 2019 til 2023 økte sykefraværet i bygg og anlegg med 22 prosent – mest av de store næringene.{{cite:nav}} I Storbritannia er mannlige bygningsarbeidere om lag tre ganger så utsatt for selvmord som menn i andre næringer, og bransjen beskrives som en der man bærer det alene.{{cite:ciob}} En anonym undersøkelse kan vise om det er rom for å si fra, uten at noen må stå fram.',
      measuredBy: { kind: 'module', itemCode: 'BA-PH-1' },
      helpline: true,
    },
    {
      title: 'Lange dager og lang vei hjem',
      body: '12 prosent i anlegg jobber mer enn 48 timer i uka, mot 8 prosent i arbeidslivet ellers, og halvparten jobber i kulde.{{cite:noa}} Lange uker øker risikoen for feil og ulykker. Pendling og perioder borte kommer i tillegg, og tapper mer enn det som synes i timelistene.',
      measuredBy: { kind: 'module', itemCode: 'BA-AR-1' },
    },
    {
      title: 'Tonen på riggen',
      body: 'Bygg og anlegg har den laveste andelen kvinner og en utpreget mannsdominert kultur. Kvinnelige lærlinger forteller om arbeidstøy og brakkefasiliteter som ikke passer, og om oppmerksomhet de helst ville vært foruten.{{cite:samforsk}} Dette måles i hovedundersøkelsen med faktoren Integritet og verdighet, og med spørsmålet om krenkende atferd – som bare vises som antall for hele virksomheten.',
      measuredBy: { kind: 'core', factorKey: 'integritet', ordinal: 1 },
    },
  ],
  moduleOverview: {
    title: 'Bygg-modulen',
    intro:
      'Et tillegg til hovedundersøkelsen, bygget på samme måte: påstander på en femdelt skala, regnet om til en indeks fra 0 til 100, med tre forslag til tiltak per faktor. Sikkerhetsfaktorene bygger på dimensjonene i det nordiske sikkerhetsklimaskjemaet NOSACQ-50, som ble utviklet på byggeplasser i de fem nordiske landene.{{cite:nosacq}}',
    coreNote: 'Bygg-modulen gjentar ikke disse, men går et lag dypere der byggeplassen er annerledes.',
  },
  loop: {
    title: 'Fra svar til tiltak på neste prosjektmøte',
    steps: [
      { title: 'Mål', text: 'Hovedmåling med bygg-modulen, på SMS eller QR-kode i brakka.' },
      { title: 'Se per prosjekt', text: 'Resultat per prosjekt og verksted, for grupper med minst fem svar.' },
      { title: 'Velg tiltak', text: 'Tre forslag per faktor. Hvert tiltak får en eier og en frist.' },
      { title: 'Mål igjen', text: 'Pulsen spør bare om faktorene dere jobber med, til tiltaket har virket.' },
    ],
    example: {
      factorKey: 'sikkerhet_foran_fremdrift',
      actionType: 'rutine',
      groupLabel: 'Prosjekt Sør',
      chips: ['Foreslått', 'Besluttet med verneombud', 'Pågår', 'Effekt målt i pulsen', 'Lukket over 60'],
      on: 2,
    },
  },
  law: {
    title: 'Det loven peker på',
    intro: 'Bygg-modulen gir dokumentasjon for kartleggingen der byggeplassen har egne krav. Hver faktor viser hjemmelen i rapporten.',
    items: [
      {
        ref: 'aml § 4-3 og forskriften kap. 1A',
        text: 'Fra 1. januar 2026 stiller loven tydeligere krav til det psykososiale arbeidsmiljøet. Faktorene skal kartlegges og risikovurderes systematisk, i samarbeid med de ansatte.',
        reviewed: true,
      },
      { ref: 'aml § 2-2', text: 'Når flere arbeidsgivere er på samme arbeidsplass, skal hovedbedriften samordne HMS-arbeidet.', reviewed: true },
      { ref: 'aml § 2-3', text: 'Arbeidstaker skal avbryte arbeidet ved fare for liv eller helse, og melde fra om feil og mangler.', reviewed: true },
      { ref: 'aml § 3-2', text: 'Arbeidsgiver skal sørge for nødvendig opplæring, øvelse og instruksjon.', reviewed: true },
      {
        ref: 'Språkkravet',
        text: 'Minst én på hvert arbeidslag på bygge- og anleggsplassen skal kunne kommunisere med de andre og på norsk eller engelsk, der sikkerheten krever det.',
        reviewed: true,
      },
      {
        ref: 'aml kapittel 10',
        text: 'Arbeidstidsordninger skal ikke gi uheldige belastninger, og kravene til hviletid gjelder også på prosjekt.',
        reviewed: true,
      },
    ],
  },
  faq: [
    {
      q: 'Hvor mye lenger blir undersøkelsen?',
      a: 'Bygg-modulen er 24 påstander og to korte ja/nei-spørsmål, rundt tre minutter ekstra. Hovedmålingen tar rundt fire minutter.',
    },
    {
      q: 'Kan vi velge bare de faktorene som gjelder oss?',
      a: 'Ja. Dere kan velge bare de faktorene som gjelder dere, for eksempel uten samordning i et verksted uten underentreprenører.',
      featureFlag: 'module_factor_toggles',
    },
    {
      q: 'Kan vi sende til underentreprenører og innleide?',
      a: 'Undersøkelsen går til deres egne ansatte. Hvordan samarbeidet med andre firma oppleves, fanges opp gjennom faktoren Samordning på byggeplassen. Innleide som er en del av laget kan legges inn i ansattlista på vanlig måte.',
    },
    {
      q: 'Hva med ansatte uten e-post?',
      a: 'Undersøkelsen kan sendes på SMS, eller deles som lenke og QR-kode i brakka. E-postadresse er valgfritt.',
    },
    {
      q: 'Ser lederen hvem som har svart nei på sikkerhetsspørsmålene?',
      a: 'Nei. Ingen gruppe vises før minst fem har svart, og grensen kan ikke senkes. De to ja/nei-spørsmålene om nestenulykker og utrygge jobber vises bare som antall for hele virksomheten, aldri per prosjekt.',
    },
    {
      q: 'Kan vi se resultat per prosjekt?',
      a: 'Ja, i pakken Vanlig, for grupper med minst fem svar. Har et prosjekt for få svar, teller svarene med i virksomhetens tall.',
    },
    {
      q: 'Hva koster det?',
      a: 'Liten koster 265 kr i måneden for til og med 25 ansatte, Vanlig 565 kr for 26–100 ansatte. Prisene er eks. mva, uten binding og med 15 dager gratis.',
    },
  ],
  cta: {
    title: 'Prøv på neste prosjekt',
    text: 'Skriv inn organisasjonsnummeret, legg inn mannskapet og send på SMS. Dere er i gang på tre minutter, uten kortopplysninger.',
  },
  questionPage: {
    crumb: 'Spørsmålssettet',
    h1: 'Spørsmåls\u00ADsettet for bygg og anlegg',
    lead: 'Åtte faktorer med tre påstander hver, i tillegg til hovedundersøkelsen. Hver faktor har en begrunnelse fra forskning og tilsyn, en hjemmel og tre forslag til tiltak som kan måles på nytt i pulsen.',
    scaleNote: 'Påstandene står i tilfeldig rekkefølge for hver person. Ordlyden er låst, så tallene kan sammenlignes fra måling til måling.',
    countTitle: 'To spørsmål som bare telles',
    countIntro: 'Noen spørsmål passer ikke i en indeks, men sier mye om det avvikssystemet ikke fanger. De vises bare som antall for hele virksomheten.',
    segmentsTitle: 'Bakgrunnsspørsmål',
    segmentsIntro: 'Valgfrie, for å se forskjell mellom byggeplass og verksted, og mellom nye og erfarne. Hovedundersøkelsens krenkende-atferd-spørsmål gjenbrukes og gjentas ikke her.',
    rulesTitle: 'Slik rapporteres svarene',
    rules: [
      { title: 'Minst fem svar', text: 'Ingen gruppe vises før minst fem har svart. Grensen kan heves, men aldri senkes.' },
      { title: 'Ingen regning bakover', text: 'Hvis en gruppe kan regnes ut fra totalen og de andre gruppene, holdes en gruppe til tilbake.' },
      { title: 'Ja/nei-spørsmålene', text: 'BA-T-1 og BA-T-2 vises bare som antall for hele virksomheten, aldri per prosjekt.' },
      {
        title: 'Segmenter',
        text: 'Arbeidssted og ansiennitet vises bare der det er minst fem svar, og aldri kombinert med en gruppe hvis det gir færre enn fem.',
        featureFlag: 'module_segments',
      },
      { title: 'Samme indeks', text: 'Hver påstand regnes om til 0–100, og faktoren er snittet av sine tre påstander.' },
      { title: 'Risikonivå', text: '65 eller mer er lav risiko, 50–64 middels og under 50 høy – det samme som i hovedundersøkelsen.' },
      { title: 'Pulsen', text: 'Når en faktor har åpne tiltak, kommer påstanden tiltaket skal måles på med i neste puls.' },
      {
        title: 'Velg det som gjelder',
        text: 'Faktorer som ikke passer, kan slås av. Samordning på byggeplassen gir for eksempel lite mening i et verksted uten underentreprenører.',
        featureFlag: 'module_factor_toggles',
      },
    ],
    coreNote: 'Bygg-modulen gjentar ikke disse.',
    cta: { title: 'Legg bygg-modulen til neste måling', text: 'Skriv inn organisasjonsnummeret. Dere er i gang på tre minutter, uten kortopplysninger.' },
  },
  related: ['helse-og-omsorg'],
}
