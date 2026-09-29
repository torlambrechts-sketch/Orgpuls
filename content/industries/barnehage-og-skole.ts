import type { IndustryPage } from './types'

/**
 * /barnehage-og-skole — from docs/implementation/bransje-barnehage-og-skole.md (the handoff,
 * 2026-09-27). Every statement it quotes is the module file's (modules/barnehage-og-skole/v1.json)
 * by code, in the «begge» wording, «barna eller elevene»; the question page switches between
 * the three (D-131). Every figure carries its source.
 *
 * Launched 2026-09-27, with the module published: Tor approved its law items, and every other
 * legal text, in admin › Legal review. The brief's opplæringsloven item said «verifiser
 * paragrafer»; it names the sections (§ 12-4, § 13-4, checked against Lovdata 2026-09-27).
 * Parts the template needs and the brief does not write (the loop's steps, the module overview's
 * closing note, the question page's rules) follow helse og omsorg's, in this industry's words.
 */
export const barnehageOgSkole: IndustryPage = {
  slug: 'barnehage-og-skole',
  navLabel: 'Barnehage og skole',
  launched: true,
  module: { key: 'barnehage-og-skole' },
  moduleName: { title: 'Barnehage- og skolemodulen', inline: 'barnehage- og skolemodulen' },
  seo: {
    title: 'Arbeidsmiljøundersøkelse for barnehage og skole | Orgpuls',
    description:
      'Medarbeiderundersøkelse for barnehager, skoler og SFO: vold og trusler, bemanning og vikarer, tid til kjerneoppgavene, foreldresamarbeid, tilrettelegging, støy og vanskelige saker. Anonymt.',
  },
  hero: {
    pill: 'Barnehage, skole og SFO',
    h1: 'Arbeidsmiljø­undersøkelse for barnehage og skole',
    lead:
      'Hovedundersøkelsen måler de emosjonelle kravene, arbeidsmengden og støtten. Barnehage- og skolemodulen legger til det som skjer i barnehagen og klasserommet: vold og trusler, bemanning og vikarer, tid til planlegging, foreldresamarbeid, tilrettelegging, støy og tunge saker. Påstandene sier «barna» i barnehagen og «elevene» i skolen.',
    thresholdNote: 'Ingen gruppe vises før minst fem har svart.',
    preview: {
      company: 'Nordlys skole AS',
      caption: 'Barnehage- og skolemodulen · indeks 0–100',
      columns: ['1.–4. trinn · 14', '5.–7. trinn · 11', 'SFO · 8'],
      rows: [
        { factorKey: 'vold_og_trusler', values: [46, 58, 52] },
        { factorKey: 'bemanning_og_vikarer', values: [49, 61, 44] },
        { factorKey: 'tid_til_kjerneoppgavene', values: [42, 47, 63] },
        { factorKey: 'samarbeid_med_foreldre', values: [61, 55, 70] },
        { factorKey: 'tilrettelegging_og_inkludering', values: [45, 53, 57] },
        { factorKey: 'stoy_kropp_og_pauser', values: [51, 64, 48] },
      ],
      footnote: 'Administrasjonen har tre svar og vises ikke som egen kolonne. Eksempelet er en tenkt virksomhet.',
    },
  },
  challengesIntro: {
    title: 'Ni utfordringer i barnehage og skole',
    text: 'Barnehagene har et sykefravær nesten 70 prosent høyere enn snittet, og grunnskolelærere er det yrket der flest blir utsatt for vold.{{cite:udf_barnehage2026}}{{cite:ssb_vold2026}} Utfordringene under er hentet fra norsk statistikk og forskning, med tall fra Sverige og OECD.',
  },
  challenges: [
    {
      title: 'Vold og trusler i hverdagen',
      body: '28 prosent av grunnskolelærerne ble utsatt for vold på jobb det siste året – høyest av alle yrker – og i undervisningsyrkene samlet økte andelen fra 12 til 18 prosent fra 2022 til 2025.{{cite:ssb_vold2026}} Åtte av ti rektorer i grunnskolen rapporterer slike hendelser, oftest fra et fåtall av de yngste elevene.{{cite:kd_nifu2025}} I Sverige hadde tre av fire inspiserte skoler mangler i arbeidet med å forebygge vold og trusler mot personalet.{{cite:av_skola2025}}',
      measuredBy: { kind: 'module', itemCode: 'BS-VT-1' },
    },
    {
      title: 'Når noen er syke, blir de andre sykere',
      body: 'Sykefraværet i barnehagene var 9,2 prosent i 2025 – nesten 70 prosent høyere enn snittet – og tilsvarer om lag 1,75 årsverk i hver barnehage.{{cite:udf_barnehage2026}} Når fravær ikke dekkes med vikar, blir de som er igjen slitne, og sirkelen fortsetter.{{cite:vg_ssb2025}}',
      measuredBy: { kind: 'module', itemCode: 'BS-BE-2' },
    },
    {
      title: 'Dokumentasjon, vurdering og møter',
      body: 'I TALIS 2024 sier mer enn halvparten av lærerne at administrative oppgaver, vurderingsarbeid og elevatferd gir betydelig stress. Skolelederne rapporterer for lite tid til pedagogisk ledelse.{{cite:talis_udf2025}}',
      measuredBy: { kind: 'module', itemCode: 'BS-TS-2' },
    },
    {
      title: 'Foreldre utenom arbeidstid',
      body: 'Lærere rapporterer at kontakten fra foreldre og elever utenfor den vanlige arbeidsdagen øker, og at kontaktlærerrollen blir stadig mer omfattende.{{cite:kd_laererrollen2026}} Samtidig føler tre av fire seg verdsatt av elever og foreldre – samarbeidet fungerer når rammene er tydelige.{{cite:talis_uio2025}}',
      measuredBy: { kind: 'module', itemCode: 'BS-FO-3' },
    },
    {
      title: 'Mer sammensatte grupper',
      body: 'Fra 2018 til 2024 økte andelen elever som strever med norsk, er faglig svake eller har særskilte behov eller atferdsvansker, ifølge lærerne i TALIS.{{cite:talis_uio2025}} Tilrettelegging krever tid, kompetanse og noen å spørre.',
      measuredBy: { kind: 'module', itemCode: 'BS-TI-1' },
    },
    {
      title: 'For få pedagoger, mange nye',
      body: 'Det mangler om lag 2 600 barnehagelærerårsverk, andelen barnehagelærere har sunket til 42 prosent, og søkningen til utdanningen har falt kraftig siden 2020.{{cite:udf_barnehage2026}} Opplæring av nye og vikarer blir avgjørende.',
      measuredBy: { kind: 'module', itemCode: 'BS-KO-1' },
    },
    {
      title: 'Støy, kropp og pauser',
      body: 'SSB forklarer det høye sykefraværet i barnehagene med at arbeidet er fysisk krevende og gir mye kontakt med mennesker. Barnehagelærere har det høyeste sykefraværet av alle yrkesgrupper i barnehagen.{{cite:vg_ssb2025}} Pauser der man faktisk er avløst, er sjeldne mange steder.',
      measuredBy: { kind: 'module', itemCode: 'BS-FY-3' },
    },
    {
      title: 'Tunge saker',
      body: 'Barnehager og skoler har lovfestede plikter når barn ikke har det trygt: aktivitetsplikt ved mobbing og krenkelser, og opplysningsplikt til barnevernet. Pliktene er tunge å bære alene. Modulen måler om de er fordelt og fulgt opp.',
      measuredBy: { kind: 'module', itemCode: 'BS-VS-2' },
    },
    {
      title: 'De følelsesmessige kravene',
      body: '38 prosent av barnehageansatte opplever høye emosjonelle krav i arbeidet med barn og foreldre.{{cite:stami_emo}} Emosjonelle krav måles i hovedundersøkelsen og gjentas ikke i modulen.',
      measuredBy: { kind: 'core', factorKey: 'emosjon', ordinal: 1, alongside: [2, 3] },
    },
  ],
  moduleOverview: {
    title: 'Barnehage- og skolemodulen',
    intro:
      'Et tillegg til hovedundersøkelsen, bygget på samme måte: påstander på en femdelt skala, indeks fra 0 til 100 og tre forslag til tiltak per faktor. Ordbruken tilpasses: «barna» i barnehagen, «elevene» i skolen.',
    coreAlso: 'teller hvor mange som har opplevd vold eller trusler',
    coreNote: 'Modulen gjentar ikke disse, men går et lag dypere der barnehagen og skolen er annerledes.',
  },
  loop: {
    title: 'Fra svar til tiltak på neste personalmøte',
    steps: [
      { title: 'Mål', text: 'Hovedmåling med barnehage- og skolemodulen, på SMS eller QR-kode på personalrommet.' },
      { title: 'Se per trinn eller avdeling', text: 'Resultat per trinn, avdeling eller SFO, for grupper med minst fem svar.' },
      { title: 'Velg tiltak', text: 'Tre forslag per faktor. Hvert tiltak får en eier og en frist.' },
      { title: 'Mål igjen', text: 'Pulsen spør bare om faktorene dere jobber med, til tiltaket har virket.' },
    ],
    example: {
      factorKey: 'vold_og_trusler',
      actionType: 'rutine',
      groupLabel: '1.–4. trinn',
      chips: ['Foreslått', 'Besluttet med verneombud', 'Pågår', 'Effekt målt i pulsen', 'Lukket over 60'],
      on: 2,
    },
  },
  law: {
    title: 'Det loven peker på i barnehage og skole',
    intro: 'Barnehage- og skolemodulen gir dokumentasjon for kartleggingen der arbeidet med barn og elever har egne krav. Hver faktor viser hjemmelen i rapporten.',
    items: [
      {
        ref: 'aml § 4-3 (6)',
        text: 'Arbeidstaker skal, så langt det er mulig, beskyttes mot vold, trusler og uheldige belastninger som følge av kontakt med andre – også barn og elever.',
        reviewed: true,
      },
      {
        // kap. 23A was repealed on 1 January 2026; kap. 3A (§§ 3A-1–3A-6) replaces it
        ref: 'Forskriften kap. 3A',
        text: 'Der ansatte kan utsettes for vold eller trusler, skal risikoen vurderes, og det skal finnes tiltak, opplæring og oppfølging.',
        reviewed: true,
      },
      {
        ref: 'Opplæringsloven §§ 12-4 og 13-4',
        text: 'Skolen har aktivitetsplikt for et trygt og godt skolemiljø, også ved mobbing og krenkelser, og personalet kan gjøre fysiske inngrep for å avverge at noen blir skadet.',
        reviewed: true,
      },
      {
        ref: 'Barnehageloven §§ 42 og 46',
        text: 'Barnehagen skal sikre et trygt og godt psykososialt miljø og har opplysningsplikt til barnevernet.',
        reviewed: true,
      },
      {
        ref: 'aml §§ 4-4 og 10-9',
        text: 'Støy og ergonomiske belastninger skal holdes forsvarlige, og ansatte har rett til pauser.',
        reviewed: true,
      },
    ],
  },
  faq: [
    {
      q: 'Passer modulen både for barnehager og skoler?',
      a: 'Ja. Påstandene er de samme, men ordbruken tilpasses: «barna» i barnehagen, «elevene» i skolen, og begge deler der dere har både barnehage og skole.',
    },
    {
      q: 'Kan vi spørre om vold fra barn og elever?',
      a: 'Ja, og det er et krav å vurdere risikoen. Hovedundersøkelsen teller hvor mange som har opplevd vold eller trusler. Modulen spør om rutiner, handlingsrom og oppfølging, og om hendelser som ikke ble meldt. Tellespørsmålene vises bare som antall for hele virksomheten.',
    },
    {
      q: 'Ser styreren eller rektoren hvem som svarte?',
      a: 'Nei. Ingen gruppe vises før minst fem har svart, og grensen kan ikke senkes. Små avdelinger teller med i virksomhetens tall.',
    },
    {
      q: 'Hva koster det?',
      a: 'Liten koster 265 kr i måneden for til og med 25 ansatte, Vanlig 565 kr for 26–100 ansatte. Prisene er eks. mva., uten binding og med 15 dager gratis.',
    },
  ],
  cta: {
    title: 'Prøv det på deres egen virksomhet',
    text: 'Skriv inn organisasjonsnummeret, legg inn ansattlista og send på SMS. Dere er i gang på tre minutter, uten kortopplysninger.',
  },
  questionPage: {
    crumb: 'Spørsmålssettet',
    h1: 'Spørsmåls­settet for barnehage og skole',
    lead: 'Åtte faktorer med tre påstander hver, i tillegg til hovedundersøkelsen. Hver faktor har en begrunnelse fra forskning, tilsyn eller regelverket, en hjemmel og tre forslag til tiltak som kan måles på nytt i pulsen.',
    scaleNote: 'Påstandene står i tilfeldig rekkefølge for hver person. Ordlyden er låst, så tallene kan sammenlignes fra måling til måling.',
    countTitle: 'To spørsmål som bare telles',
    countIntro: 'Noen spørsmål passer ikke i en indeks, men sier mye om det avvikssystemet ikke fanger. De vises bare som antall for hele virksomheten.',
    segmentsTitle: 'Bakgrunnsspørsmål',
    segmentsIntro:
      'Valgfrie, for å se forskjell mellom roller og stillingsstørrelser. Hovedundersøkelsens spørsmål om vold og trusler siste tolv måneder og om krenkende atferd gjenbrukes og gjentas ikke her.',
    rulesTitle: 'Slik rapporteres svarene',
    rules: [
      { title: 'Minst fem svar', text: 'Ingen gruppe eller segment vises før minst fem har svart. Grensen kan heves, men aldri senkes.' },
      { title: 'Ingen regning bakover', text: 'Hvis en gruppe kan regnes ut fra totalen og de andre gruppene, holdes en gruppe til tilbake.' },
      { title: 'Ja/nei-spørsmålene', text: 'BS-T-1 og BS-T-2 vises bare som antall for hele virksomheten, aldri per trinn, avdeling eller segment.' },
      {
        title: 'Segmenter',
        text: 'Rolle og stillingsstørrelse vises bare der det er minst fem svar. «Leder eller administrasjon» slås sammen med nærmeste gruppe når den har færre enn fem svar.',
        featureFlag: 'module_segments',
      },
      { title: 'Samme indeks', text: 'Hver påstand regnes om til 0–100, og faktoren er snittet av sine tre påstander.' },
      { title: 'Risikonivå', text: '65 eller mer er lav risiko, 50–64 middels og under 50 høy – det samme som i hovedundersøkelsen.' },
      // the brief § 5.1: the pilot tests that the three work alike; until then the page claims no more
      { title: 'Ordbruk', text: 'Påstandene sier «barna» i barnehagen og «elevene» i skolen. Kodene og skåringen er de samme, og piloten tester at de tre versjonene fungerer likt.' },
      { title: 'Vanskelige saker', text: 'Faktoren handler om plikter, ikke om enkeltsaker. Ikke skriv om enkeltbarn eller enkeltelever i kommentarfeltet.' },
      { title: 'Pulsen', text: 'Når en faktor har åpne tiltak, kommer påstanden tiltaket skal måles på med i neste puls.' },
    ],
    coreNote: 'Barnehage- og skolemodulen gjentar ikke disse.',
    cta: { title: 'Legg barnehage- og skolemodulen til neste måling', text: 'Skriv inn organisasjonsnummeret. Dere er i gang på tre minutter, uten kortopplysninger.' },
  },
  related: ['helse-og-omsorg'],
  sourcesFromFactors: false,
}
