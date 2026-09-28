import type { IndustryPage } from './types'

/**
 * /handel — from docs/implementation/bransje-handel.md (the handoff, 2026-09-27). Every statement
 * it quotes is the module file's (modules/handel/v1.json) by code, or the core instrument's by
 * factor and ordinal; every figure carries its source.
 *
 * Launched 2026-09-28 with the module published as provisional (X-078). The lone-work law item
 * still names no paragraph (§ 5), as approved.
 *
 * The brief's preview shows the warehouse without «Alene på vakt» and «Grenser mot kunder», and its
 * footnote says so. Choosing factors is built but not switched on (`module_factor_toggles`), so the
 * two rows and that sentence show only when it is, as on /helse-og-omsorg (D-122, D-138). Parts the
 * template needs and the brief does not write (the law block's heading, the loop's steps, the
 * overview's closing note, the question page's words) follow the other industries', in this one's
 * words.
 */
export const handel: IndustryPage = {
  slug: 'handel',
  navLabel: 'Handel',
  launched: true,
  card: { newUntil: '2026-12-27' },
  module: { key: 'handel', version: '1.0.0' },
  moduleName: { title: 'Handel-modulen', inline: 'handel-modulen' },
  seo: {
    title: 'Arbeidsmiljøundersøkelse for handel og butikk | Orgpuls',
    description:
      'Medarbeiderundersøkelse for butikk, lager og netthandel: tyveri og trusler, alenevakter, krevende kunder, bemanning, vaktplan, deltid og tunge løft. Anonymt, på tvers av vakter.',
  },
  hero: {
    pill: 'Butikk, lager og netthandel',
    h1: 'Arbeidsmiljø­undersøkelse for handel',
    lead:
      'Hovedundersøkelsen måler emosjonelle krav, arbeidsmengde og støtte. Handel-modulen legger til det som skjer på butikkgulvet: tyveri og trusler, alenevakter, kunder som går over grensen, bemanning i travle timer, vaktplan, deltid og tunge løft. Alt anonymt, på mobilen, på tvers av vakter.',
    thresholdNote: 'Ingen gruppe vises før minst fem har svart.',
    preview: {
      company: 'Solbakken Handel AS',
      caption: 'Handel-modulen · indeks 0–100',
      columns: ['Butikk sentrum · 14', 'Butikk kjøpesenter · 11', 'Lager · 8'],
      rows: [
        { factorKey: 'sikkerhet_tyveri_trusler', values: [54, 61, 72] },
        { factorKey: 'alene_pa_vakt', values: [47, 58, null], featureFlag: 'module_factor_toggles' },
        { factorKey: 'grenser_mot_kunder', values: [49, 57, null], featureFlag: 'module_factor_toggles' },
        { factorKey: 'bemanning_og_tempo', values: [45, 52, 63] },
        { factorKey: 'vaktplan', values: [60, 43, 68] },
        { factorKey: 'fysisk_arbeid', values: [64, 66, 48] },
      ],
      footnoteFlagged: {
        text: 'Lageret har verken kundekontakt eller alenevakter, så de faktorene er ikke spurt der.',
        featureFlag: 'module_factor_toggles',
      },
      footnote: 'Kontoret har tre svar og vises ikke som egen kolonne. Eksempelet er en tenkt virksomhet.',
    },
  },
  challengesIntro: {
    title: 'Ni utfordringer som går igjen i handelen',
    text: 'Butikkmedarbeider er Norges vanligste yrke, og varehandelen har over 300 000 sysselsatte.{{cite:regj_natt}} Utfordringene under er hentet fra norsk tilsyn og forskning, med tall fra Danmark og Storbritannia.',
  },
  challenges: [
    {
      title: 'Tyveri, trusler og ran',
      body: 'I Fafos undersøkelse blant over 6 000 butikkansatte hadde 28 prosent opplevd vanskelige situasjoner med tyveri det siste året, og 12 prosent trusler så alvorlige at de ble redde.{{cite:regj_natt}} I Oslo økte butikktyveriene med 60 prosent i 2025.{{cite:oslo_politi}} I Danmark har fire av ti butikkansatte i HK Handel selv konfrontert en tyv, og nesten hver fjerde av dem er blitt truet eller utsatt for vold.{{cite:dk_tyveri2026}}',
      measuredBy: { kind: 'module', itemCode: 'HA-SI-1' },
    },
    {
      title: 'Alene på vakt',
      body: 'En av tre butikkansatte jobber alene av og til eller oftere, og en tredjedel av virksomhetene med alenearbeid har ikke vurdert risikoen ved det.{{cite:regj_natt}} Det meste av alenearbeidet skjer på dagtid og tidlig kveld – ikke bare om natten.',
      measuredBy: { kind: 'module', itemCode: 'HA-AL-1' },
    },
    {
      title: 'Kunder som går over grensen',
      body: '28 prosent i detaljhandelen er ofte eller av og til i konflikt med kunder, mot 16 prosent i arbeidslivet ellers – og 38 prosent blant de yngste. 12 prosent av kvinnene har opplevd uønsket seksuell oppmerksomhet det siste året, nesten alltid fra kunder, og bare et mindretall melder fra.{{cite:regj_natt}} I Storbritannia er 78 prosent av butikkansatte blitt skjelt ut og 54 prosent truet det siste året.{{cite:usdaw2025}}',
      measuredBy: { kind: 'module', itemCode: 'HA-KU-3' },
    },
    {
      title: 'For få på jobb når det er travelt',
      body: 'Kundenes frustrasjon over for lite bemanning er den vanligste utløseren for sjikane og trusler mot butikkansatte i Storbritannia.{{cite:usdaw2025}} Bemanning er derfor et sikkerhetsspørsmål, ikke bare et spørsmål om tempo.',
      measuredBy: { kind: 'module', itemCode: 'HA-BE-1' },
    },
    {
      title: 'Vaktplan på kort varsel',
      body: 'Nesten halvparten i varehandelen jobber utenom vanlig dagtid. Blant tillitsvalgte og verneombud i butikk sier 39 prosent at de har svært liten påvirkning på arbeidsplanene.{{cite:regj_natt}}',
      measuredBy: { kind: 'module', itemCode: 'HA-AV-1' },
    },
    {
      title: 'Deltid og tilhørighet',
      body: 'Nær 40 prosent i varehandelen jobber deltid, og over en tredjedel i detaljhandelen er under 25 år. Butikkansatte rapporterer lavere engasjement og tilhørighet enn arbeidslivet ellers.{{cite:regj_natt}}',
      measuredBy: { kind: 'module', itemCode: 'HA-ST-3' },
    },
    {
      title: 'Ny, ung – og fort alene',
      body: '28 prosent av butikkansatte har ikke fått opplæring i å håndtere ran, trusler eller tyveri, og nær halvparten av elevene og studentene i butikk har jobbet der under ett år.{{cite:regj_natt}}',
      measuredBy: { kind: 'module', itemCode: 'HA-OP-2' },
    },
    {
      title: 'Tunge løft og mange timer på beina',
      body: 'Butikkansatte jobber oftere med armene løftet, på huk og med tunge løft enn arbeidslivet ellers, og flere er fysisk utmattet etter jobb.{{cite:regj_natt}}',
      measuredBy: { kind: 'module', itemCode: 'HA-FY-1' },
    },
    {
      title: 'Følelsene i kundemøtet',
      body: 'Butikkansatte opplever oftere høye emosjonelle krav (30 mot 20 prosent) og lav kontroll over egen arbeidssituasjon (32 mot 25 prosent) enn arbeidslivet ellers.{{cite:regj_natt}} Dette måles i hovedundersøkelsen og gjentas ikke i modulen.',
      measuredBy: { kind: 'core', factorKey: 'emosjon', ordinal: 1, alongside: [2, 3] },
    },
  ],
  moduleOverview: {
    title: 'Handel-modulen',
    intro:
      'Et tillegg til hovedundersøkelsen, bygget på samme måte: påstander på en femdelt skala, indeks fra 0 til 100 og tre forslag til tiltak per faktor.',
    coreNote: 'Handel-modulen gjentar ikke disse, men går et lag dypere der butikkgulvet er annerledes.',
  },
  loop: {
    title: 'Fra svar til tiltak på neste personalmøte',
    steps: [
      { title: 'Mål', text: 'Hovedmåling med handel-modulen, på SMS eller QR-kode på pauserommet.' },
      { title: 'Se per butikk', text: 'Resultat per butikk og lager, for grupper med minst fem svar.' },
      { title: 'Velg tiltak', text: 'Tre forslag per faktor. Hvert tiltak får en eier og en frist.' },
      { title: 'Mål igjen', text: 'Pulsen spør bare om faktorene dere jobber med, til tiltaket har virket.' },
    ],
    example: {
      factorKey: 'alene_pa_vakt',
      actionType: 'rutine',
      groupLabel: 'Butikk sentrum',
      chips: ['Foreslått', 'Besluttet med verneombud', 'Pågår', 'Effekt målt i pulsen', 'Lukket over 60'],
      on: 2,
    },
  },
  law: {
    title: 'Det loven peker på i handelen',
    intro: 'Handel-modulen gir dokumentasjon for kartleggingen der butikk og lager har egne krav. Hver faktor viser hjemmelen i rapporten.',
    items: [
      {
        ref: 'aml § 4-3 (6)',
        text: 'Arbeidstaker skal, så langt det er mulig, beskyttes mot vold, trusler og uheldige belastninger som følge av kontakt med andre.',
        reviewed: true,
      },
      {
        ref: 'Forskriften kap. 23A',
        text: 'Der ansatte kan utsettes for vold eller trusler, skal risikoen vurderes, og det skal finnes tiltak, opplæring og oppfølging.',
        reviewed: true,
      },
      {
        ref: 'Alenearbeid',
        text: 'Arbeidsgiver skal vurdere om det er særlig risiko ved alenearbeid, i samarbeid med verneombudet (hjemmel verifiseres).',
        reviewed: true,
      },
      {
        ref: 'aml §§ 10-3 og 10-9',
        text: 'Arbeidsplanen skal drøftes med tillitsvalgte, og ansatte har rett til pauser – også på alenevakter.',
        reviewed: true,
      },
      { ref: 'aml § 14-3', text: 'Deltidsansatte har fortrinnsrett til en utvidet stilling før arbeidsgiver ansetter nye.', reviewed: true },
      {
        ref: 'Likestillings- og diskrimineringsloven § 13',
        text: 'Arbeidsgiver skal forebygge og søke å hindre seksuell trakassering, også fra kunder.',
        reviewed: true,
      },
    ],
  },
  faq: [
    {
      q: 'Hvor mye lenger blir undersøkelsen?',
      a: 'Handel-modulen er 24 påstander og to korte ja/nei-spørsmål, rundt tre minutter ekstra. Hovedmålingen tar rundt fire minutter.',
    },
    {
      q: 'Kan vi spørre om tyveri og trusler?',
      a: 'Ja, og det er et krav å vurdere risikoen. Hovedundersøkelsen teller hvor mange som har opplevd vold eller trusler. Handel-modulen spør i tillegg om rutiner, hjelp og oppfølging, og om hendelser som ikke ble meldt. Tellespørsmålene vises bare som antall for hele virksomheten.',
    },
    {
      q: 'Ser butikksjefen hvem som føler seg utrygg på alenevakter?',
      a: 'Nei. Spørsmålet vises bare som antall for hele virksomheten, aldri per butikk eller vakt. Ingen gruppe vises før minst fem har svart.',
    },
    {
      q: 'Hva med ekstrahjelper og studenter?',
      a: 'De kan legges inn i ansattlista som alle andre. Undersøkelsen sendes på SMS eller deles som QR-kode på pauserommet og er åpen i flere dager, så alle vakter rekker å svare.',
    },
    {
      q: 'Kan vi se resultat per butikk?',
      a: 'Ja, i pakken Vanlig, for butikker med minst fem svar. Har en butikk for få svar, teller svarene med i virksomhetens tall.',
    },
    {
      q: 'Hva koster det?',
      a: 'Liten koster 265 kr i måneden for til og med 25 ansatte, Vanlig 565 kr for 26–100 ansatte. Prisene er eks. mva., uten binding og med 15 dager gratis.',
    },
  ],
  cta: {
    title: 'Prøv det i deres egen butikk',
    text: 'Skriv inn organisasjonsnummeret, legg inn ansattlista og send på SMS. Dere er i gang på tre minutter, uten kortopplysninger.',
  },
  questionPage: {
    crumb: 'Spørsmålssettet',
    h1: 'Spørsmåls­settet for handel',
    lead: 'Åtte faktorer med tre påstander hver, i tillegg til hovedundersøkelsen. Hver faktor har en begrunnelse fra forskning og tilsyn, en hjemmel og tre forslag til tiltak som kan måles på nytt i pulsen.',
    scaleNote: 'Påstandene står i tilfeldig rekkefølge for hver person. Ordlyden er låst, så tallene kan sammenlignes fra måling til måling.',
    countTitle: 'To spørsmål som bare telles',
    countIntro: 'Noen spørsmål passer ikke i en indeks, men sier mye om det avvikssystemet ikke fanger og om alenevaktene. De vises bare som antall for hele virksomheten.',
    segmentsTitle: 'Bakgrunnsspørsmål',
    segmentsIntro: 'Valgfrie, for å se forskjell mellom butikk og lager, og mellom heltid og deltid. Undersøkelsen spør ikke om alder, fordi mange i handelen er unge og gruppene da blir for små.',
    rulesTitle: 'Slik rapporteres svarene',
    rules: [
      { title: 'Minst fem svar', text: 'Ingen gruppe vises før minst fem har svart. Grensen kan heves, men aldri senkes.' },
      { title: 'Ingen regning bakover', text: 'Hvis en gruppe kan regnes ut fra totalen og de andre gruppene, holdes en gruppe til tilbake.' },
      {
        title: 'Ja/nei-spørsmålene',
        text: 'HA-T-1 og HA-T-2 vises bare som antall for hele virksomheten, aldri per butikk eller vakt. «Jobber aldri alene» holdes utenfor andelen.',
      },
      {
        title: 'Segmenter',
        text: 'Arbeidssted og stillingsstørrelse vises bare der det er minst fem svar, og aldri kombinert med en gruppe hvis det gir færre enn fem.',
        featureFlag: 'module_segments',
      },
      { title: 'Samme indeks', text: 'Hver påstand regnes om til 0–100, og faktoren er snittet av sine tre påstander.' },
      {
        title: 'Foreløpige terskler',
        text: '65 eller mer er lav risiko, 50–64 middels og under 50 høy – det samme som i hovedundersøkelsen, men merket foreløpig til modulen er validert.',
      },
      { title: 'Pulsen', text: 'Når en faktor har åpne tiltak, kommer påstanden tiltaket skal måles på med i neste puls.' },
      {
        title: 'Velg det som gjelder',
        text: 'Alene på vakt kan slås av der ingen jobber alene, og Grenser mot kunder der ingen har kundekontakt. Da stilles heller ikke spørsmålet om å jobbe alene og føle seg utrygg.',
        featureFlag: 'module_factor_toggles',
      },
    ],
    coreNote: 'Handel-modulen gjentar ikke disse.',
    cta: { title: 'Legg handel-modulen til neste måling', text: 'Skriv inn organisasjonsnummeret. Dere er i gang på tre minutter, uten kortopplysninger.' },
  },
  related: ['kunnskap-og-kontor', 'helse-og-omsorg'],
}
