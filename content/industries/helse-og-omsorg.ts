import type { IndustryPage } from './types'

/**
 * /helse-og-omsorg — ported from docs/reference/helse-og-omsorg.html and its question page.
 * Every statement it quotes is the module file's (modules/helse-og-omsorg/v1.json) by code,
 * or the core instrument's by factor and ordinal; every figure carries its source.
 *
 * The reference shows one factor switched off in its example (Natt without forflytning) and
 * says so in its footnote and in the first FAQ answer. Choosing factors is built but not
 * switched on (`module_factor_toggles`), so the row, that sentence and that part of the
 * answer are shown only when it is (D-122). Until launch the address keeps its current
 * landing page and this one is a preview; its law items wait for review.
 */
export const helseOgOmsorg: IndustryPage = {
  slug: 'helse-og-omsorg',
  navLabel: 'Helse og omsorg',
  launched: false,
  module: { key: 'helse-og-omsorg', version: '1.0.0' },
  moduleName: { title: 'Helse-modulen', inline: 'helse-modulen' },
  seo: {
    title: 'Arbeidsmiljøundersøkelse for helse og omsorg | Orgpuls',
    description:
      'Medarbeiderundersøkelse for helse og omsorg med egen helse-modul: vold og trusler, bemanning og forsvarlighet, turnus, deltid, grenser mot brukere og pårørende, dokumentasjon og forflytning. Anonymt, på tvers av turnus.',
  },
  hero: {
    pill: 'Helse, omsorg og arbeid med mennesker',
    h1: 'Arbeidsmiljø­undersøkelse for helse og omsorg',
    lead:
      'Hovedundersøkelsen måler de emosjonelle kravene og om noen står alene i dem. Helse-modulen legger til det som gjør omsorgsarbeid annerledes: vold og trusler, bemanning og samvittighet, turnus og deltid, grenser mot brukere og pårørende, dokumentasjon og tunge forflytninger. Alt anonymt, på mobilen, på tvers av turnus.',
    thresholdNote: 'Ingen gruppe vises før minst fem har svart.',
    preview: {
      company: 'Lindely Omsorg AS',
      caption: 'Hovedmåling september · indeks 0–100',
      columns: ['Sykehjem 1. etg · 16', 'Hjemmetjenesten · 12', 'Natt · 7'],
      rows: [
        { factorKey: 'vold_og_trusler', values: [57, 46, 62] },
        { factorKey: 'bemanning_og_forsvarlig_omsorg', values: [44, 52, 41] },
        { factorKey: 'turnus_og_hvile', values: [61, 68, 49] },
        { factorKey: 'grenser_mot_brukere_og_parorende', values: [66, 55, 70] },
        { factorKey: 'tid_til_kjerneoppgavene', values: [48, 59, 63] },
        { factorKey: 'forflytning_og_tunge_loft', values: [53, 42, null], featureFlag: 'module_factor_toggles' },
      ],
      footnoteFlagged: {
        text: 'Nattevakten har valgt bort forflytning, fordi de tyngste forflytningene skjer på dagtid.',
        featureFlag: 'module_factor_toggles',
      },
      footnote: 'Kjøkkenet har tre svar og vises ikke som egen kolonne. Eksempelet er en tenkt virksomhet.',
    },
  },
  challengesIntro: {
    title: 'Ni utfordringer som går igjen i helse og omsorg',
    text: 'Helse- og sosialtjenester har det høyeste sykefraværet av alle næringer, 9 prosent i første kvartal 2026.{{cite:nav_q1}} Utfordringene under er hentet fra norsk, svensk og dansk tilsyn og forskning. Alle kan måles anonymt og følges opp med tiltak – på samme måte som resten av arbeidsmiljøet.',
  },
  challenges: [
    {
      title: 'Vold og trusler er en del av hverdagen',
      body: 'Rundt en av fire ansatte i kommunale helse- og omsorgstjenester har vært utsatt for vold eller trusler.{{cite:ks_vold}} I Sverige står vold og trusler bak en av fire anmeldte arbeidsulykker med sykefravær i omsorgsboliger, mot seks prosent i arbeidslivet ellers.{{cite:av_vold24}} I Danmark fant Arbejdstilsynet at mer enn hvert tiende plejecenter de besøkte i 2022, ikke beskyttet de ansatte godt nok.{{cite:foa_dk}} Hovedundersøkelsen teller allerede hvor mange som har opplevd det. Helse-modulen spør om det som kan gjøres noe med: om risikoen er kjent, om hendelsene blir meldt, og om den som var involvert blir fulgt opp.',
      measuredBy: { kind: 'module', itemCode: 'HO-VT-2' },
    },
    {
      title: 'For få på vakt til å gjøre jobben forsvarlig',
      body: 'En av fire sykepleiere sier de sjelden eller aldri kan gi forsvarlig pleie til alle pasientene i løpet av en vakt.{{cite:nsf_forsvarlig}} Dansk forskning kaller det moralsk stress: man vet hva som er riktig, men får ikke gjort det.{{cite:ae_dk}} Det måles ikke av spørsmål om arbeidsmengde alene.',
      measuredBy: { kind: 'module', itemCode: 'HO-BF-2' },
    },
    {
      title: 'Turnus som ikke gir hvile',
      body: 'En SINTEF-undersøkelse blant over 18 000 sykepleiere beskriver ubesatte stillinger, stram bemanning og turnuser med lite rom for hvile mellom vaktene.{{cite:sintef_nsf}} Om turnusen fungerer, merkes først på dem som går den.',
      measuredBy: { kind: 'module', itemCode: 'HO-TH-1' },
    },
    {
      title: 'Deltid som ingen har valgt',
      body: '43 000 kommunalt ansatte jobber ufrivillig deltid, og sju av ti deltidsansatte i kommunene jobber i helse og omsorg.{{cite:fafo_deltid}} Deltidsansatte får ofte svakere tilhørighet til arbeidsplassen, og det går ut over både fagmiljø og kontinuitet.{{cite:hdir_heltid}}',
      measuredBy: { kind: 'module', itemCode: 'HO-HF-1' },
    },
    {
      title: 'Når brukere og pårørende går over grensen',
      body: '20 prosent av sykepleierne og 16,5 prosent av helsefagarbeiderne har opplevd seksuell trakassering det siste året, blant de høyeste andelene i arbeidslivet.{{cite:ssb_trakassering}} Det skjer ofte i møte med brukere, der det er lett å bortforklare – og der ansvaret for å forebygge fortsatt ligger hos arbeidsgiver.',
      measuredBy: { kind: 'module', itemCode: 'HO-GP-2' },
    },
    {
      title: 'Tastaturet tar tid fra brukeren',
      body: 'Sykepleiere anslår at de bruker rundt to timer per arbeidsdag i den elektroniske journalen, og rundt tre av fire mener tiden går på bekostning av pasientnære oppgaver.{{cite:tidstyver}} Tidstyvene er ofte lokale, og de som ser dem best, er de som går vaktene.',
      measuredBy: { kind: 'module', itemCode: 'HO-TK-1' },
    },
    {
      title: 'Nye og vikarer alene på vakt',
      body: 'Ti år etter utdanning jobber en av fem sykepleiere ikke lenger i helsetjenesten, og ønsket om å slutte er størst blant de unge og de som har jobbet kortest.{{cite:ssb_sykepleiere}} Om nye og vikarer får opplæring før de står alene, og om rapporten mellom vaktene holder, avgjør mye av det første året.',
      measuredBy: { kind: 'module', itemCode: 'HO-FT-1' },
    },
    {
      title: 'Tunge løft uten hjelpemidler',
      body: 'STAMI-forskning i hjemmetjenesten viser at mer enn seks av ti gjør tunge fysiske løft uten hjelpemidler – og halvparten gjør det selv når hjelpemidlene finnes.{{cite:stami_forflytning}} Problemet er sjelden bare utstyret, men tiden og bemanningen til å bruke det.',
      measuredBy: { kind: 'module', itemCode: 'HO-FL-2' },
    },
    {
      title: 'Det følelsesmessige arbeidet',
      body: 'Arbeid med mennesker gir belastninger som ikke handler om mengde: sorg, sinne, uro og ansvar for andres liv. Det er kjernen i hovedundersøkelsen for helse og omsorg, og gjentas derfor ikke i modulen.',
      measuredBy: { kind: 'core', factorKey: 'emosjon', ordinal: 1, alongside: [2, 3] },
    },
  ],
  moduleOverview: {
    title: 'Helse-modulen',
    intro:
      'Et tillegg til hovedundersøkelsen, bygget på samme måte: påstander på en femdelt skala, regnet om til en indeks fra 0 til 100, med tre forslag til tiltak per faktor.',
    coreAlso: 'teller hvor mange som har opplevd vold eller trusler',
    coreNote: 'Helse-modulen gjentar ikke disse, men går et lag dypere der omsorgsarbeidet er annerledes.',
  },
  loop: {
    title: 'Fra svar til tiltak på neste personalmøte',
    steps: [
      { title: 'Mål', text: 'Hovedmåling med helse-modulen, på SMS eller QR-kode på vaktrommet.' },
      { title: 'Se per avdeling', text: 'Resultat per avdeling og post, for grupper med minst fem svar.' },
      { title: 'Velg tiltak', text: 'Tre forslag per faktor. Hvert tiltak får en eier og en frist.' },
      { title: 'Mål igjen', text: 'Pulsen spør bare om faktorene dere jobber med, til tiltaket har virket.' },
    ],
    example: {
      factorKey: 'vold_og_trusler',
      actionType: 'rutine',
      groupLabel: 'Hjemmetjenesten',
      chips: ['Foreslått', 'Besluttet med verneombud', 'Pågår', 'Effekt målt i pulsen', 'Lukket over 60'],
      on: 2,
    },
  },
  law: {
    title: 'Det loven peker på i arbeid med mennesker',
    intro: 'Helse-modulen gir dokumentasjon for kartleggingen der omsorgsarbeidet har egne krav. Hver faktor viser hjemmelen i rapporten.',
    items: [
      {
        ref: 'aml § 4-3 (2) b',
        text: 'Psykososiale arbeidsmiljøfaktorer omfatter blant annet emosjonelle krav og belastninger i arbeid med mennesker.',
        reviewed: false,
      },
      {
        ref: 'aml § 4-3 (6)',
        text: 'Arbeidstaker skal, så langt det er mulig, beskyttes mot vold, trusler og uheldige belastninger som følge av kontakt med andre.',
        reviewed: false,
      },
      {
        ref: 'Forskriften kap. 23A',
        text: 'Der ansatte kan utsettes for vold eller trusler, skal risikoen vurderes, og det skal finnes tiltak, opplæring og oppfølging.',
        reviewed: false,
      },
      {
        ref: 'Forskriften § 1A-2',
        text: 'Faktorene skal kartlegges og risikovurderes hver for seg og samlet, i samarbeid med de ansatte, og gjentas regelmessig.',
        reviewed: false,
      },
      {
        ref: 'aml kapittel 10',
        text: 'Arbeidsplanen skal ikke gi uheldige belastninger, og kravene til hviletid gjelder også i turnus.',
        reviewed: false,
      },
      { ref: 'aml § 14-3', text: 'Deltidsansatte har fortrinnsrett til en utvidet stilling før arbeidsgiver ansetter nye.', reviewed: false },
      {
        ref: 'Likestillings- og diskrimineringsloven § 13',
        text: 'Arbeidsgiver skal forebygge og søke å hindre seksuell trakassering, også fra brukere og pårørende.',
        reviewed: false,
      },
    ],
  },
  faq: [
    {
      q: 'Hvor mye lenger blir undersøkelsen?',
      a: 'Helse-modulen er 24 påstander og to korte ja/nei-spørsmål, rundt tre minutter ekstra. Hovedmålingen tar rundt fire minutter.',
      more: {
        text: 'Dere kan også velge bare de faktorene som gjelder dere, for eksempel uten forflytning på et legekontor.',
        featureFlag: 'module_factor_toggles',
      },
    },
    {
      q: 'Kan vi spørre om vold og trusler?',
      a: 'Ja, og det er et krav å vurdere risikoen, jf. arbeidsmiljøloven § 4-3 sjette ledd. Hovedundersøkelsen teller hvor mange som har opplevd vold eller trusler. Helse-modulen spør i tillegg om forebygging, melding og oppfølging, og om hendelser som ikke ble meldt. Tellespørsmålene vises bare som antall for hele virksomheten.',
    },
    {
      q: 'Ser lederen hvem som svarte at bemanningen ikke var forsvarlig?',
      a: 'Nei. Spørsmålet vises bare som antall for hele virksomheten, aldri per avdeling eller vakt. Ingen gruppe vises før minst fem har svart, og grensen kan ikke senkes.',
    },
    {
      q: 'Når folk går i turnus og på natt?',
      a: 'Undersøkelsen sendes på e-post eller SMS, eller deles som lenke og QR-kode på vaktrommet. Den er åpen i flere dager, så alle vakter rekker å svare.',
    },
    {
      q: 'Kan vi se resultat per avdeling eller post?',
      a: 'Ja, i pakken Vanlig, for avdelinger med minst fem svar. Har en avdeling for få svar, teller svarene med i virksomhetens tall.',
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
    h1: 'Spørsmåls­settet for helse og omsorg',
    lead: 'Åtte faktorer med tre påstander hver, i tillegg til hovedundersøkelsen. Hver faktor har en begrunnelse fra forskning og tilsyn, en hjemmel og tre forslag til tiltak som kan måles på nytt i pulsen.',
    scaleNote: 'Påstandene står i tilfeldig rekkefølge for hver person. Ordlyden er låst, så tallene kan sammenlignes fra måling til måling.',
    countTitle: 'To spørsmål som bare telles',
    countIntro: 'Noen spørsmål passer ikke i en indeks, men sier mye om det avvikssystemet ikke fanger. De vises bare som antall for hele virksomheten.',
    segmentsTitle: 'Bakgrunnsspørsmål',
    segmentsIntro:
      'Valgfrie, for å se forskjell mellom dag, kveld og natt, og mellom heltid og deltid. Hovedundersøkelsens spørsmål om vold og trusler siste tolv måneder og om krenkende atferd gjenbrukes og gjentas ikke her.',
    rulesTitle: 'Slik rapporteres svarene',
    rules: [
      { title: 'Minst fem svar', text: 'Ingen gruppe eller segment vises før minst fem har svart. Grensen kan heves, men aldri senkes.' },
      { title: 'Ingen regning bakover', text: 'Hvis en gruppe kan regnes ut fra totalen og de andre gruppene, holdes en gruppe til tilbake.' },
      { title: 'Ja/nei-spørsmålene', text: 'HO-T-1 og HO-T-2 vises bare som antall for hele virksomheten, aldri per prosjekt eller segment.' },
      {
        title: 'Segmenter',
        text: 'Vaktordning og stillingsstørrelse vises bare der det er minst fem svar, og aldri kombinert med en gruppe hvis det gir færre enn fem.',
        featureFlag: 'module_segments',
      },
      { title: 'Samme indeks', text: 'Hver påstand regnes om til 0–100, og faktoren er snittet av sine tre påstander.' },
      { title: 'Risikonivå', text: '65 eller mer er lav risiko, 50–64 middels og under 50 høy – det samme som i hovedundersøkelsen.' },
      { title: 'Pulsen', text: 'Når en faktor har åpne tiltak, kommer påstanden tiltaket skal måles på med i neste puls.' },
      {
        title: 'Velg det som gjelder',
        text: 'Faktorer som ikke passer, kan slås av. Forflytning gir for eksempel lite mening på et legekontor.',
        featureFlag: 'module_factor_toggles',
      },
    ],
    coreNote: 'Helse-modulen gjentar ikke disse.',
    cta: { title: 'Legg helse-modulen til neste måling', text: 'Skriv inn organisasjonsnummeret. Dere er i gang på tre minutter, uten kortopplysninger.' },
  },
  related: ['bygg-og-anlegg'],
  // the reference lists only what the page itself cites
  sourcesFromFactors: false,
}
