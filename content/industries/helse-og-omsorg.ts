import type { IndustryPage } from './types'

/**
 * /helse-og-omsorg — ported from docs/reference/helse-og-omsorg.html and its question page.
 * Every statement it quotes is the module file's (modules/helse-og-omsorg/v1.json) by code,
 * or the core instrument's by factor and ordinal; every figure carries its source.
 *
 * The reference shows one factor switched off in its example (Natt without forflytning) and
 * says so in its footnote and in the first FAQ answer. Choosing factors is built but not
 * switched on (`module_factor_toggles`), so the row, that sentence and that part of the
 * answer are shown only when it is (D-122). Launched in Norwegian on 2026-09-27, when Tor approved
 * it and its law items (X-065); the English page waits for its own review.
 */
export const helseOgOmsorg: IndustryPage = {
  slug: 'helse-og-omsorg',
  navLabel: 'Helse og omsorg',
  // Tor approved the page and its seven law items on 2026-09-27 (X-065)
  launched: true,
  module: { key: 'helse-og-omsorg' },
  moduleName: { title: 'Helse-modulen', inline: 'helse-modulen' },
  seo: {
    title: 'Arbeidsmiljøundersøkelse for helse og omsorg | Orgpuls',
    description:
      'Arbeidsmiljøundersøkelse for helse og omsorg: vold og trusler, bemanning, turnus, deltid, grenser mot brukere og forflytning. Anonymt. 15 dager gratis.',
  },
  hero: {
    pill: 'Helse, omsorg og arbeid med mennesker',
    h1: 'Arbeidsmiljø­undersøkelse for helse og omsorg',
    lead:
      'Se hvor vold, stram bemanning og turnus uten hvile går ut over de ansatte – og få forslag til tiltak for hver faktor. Helse-modulen kommer i tillegg til hovedundersøkelsen. Den spør også om deltid, grenser mot brukere og pårørende, dokumentasjon og tunge løft. Ansatte på alle vakter svarer anonymt på mobilen.',
    thresholdNote: 'Som standard vises ingen gruppe før minst 5 har svart.',
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
      footnote: 'Hjemmetjenesten ligger under 50 på vold og trusler – der starter tiltaket. Kjøkkenet har 3 svar og vises ikke som egen kolonne. Eksempelet er en tenkt virksomhet.',
    },
  },
  challengesIntro: {
    title: 'Ni utfordringer som går igjen i helse og omsorg',
    text: 'Helse- og sosialtjenester har det høyeste sykefraværet av alle næringer, 9 prosent i første kvartal 2026.{{cite:nav_q1}} Utfordringene under er hentet fra norsk, svensk og dansk tilsyn og forskning. Dere kan måle alle anonymt og følge dem opp med tiltak – som resten av arbeidsmiljøet.',
  },
  challenges: [
    {
      title: 'Vold og trusler er en del av hverdagen',
      body: 'Rundt en av fire ansatte i kommunale helse- og omsorgstjenester har vært utsatt for vold eller trusler.{{cite:ks_vold}} I Sverige står vold og trusler bak en av fire anmeldte arbeidsulykker med sykefravær i omsorgsboliger, mot 6 prosent i arbeidslivet ellers.{{cite:av_vold24}} I Danmark fant Arbejdstilsynet at mer enn hvert tiende plejecenter de besøkte i 2022, ikke beskyttet de ansatte godt nok.{{cite:foa_dk}} Hovedundersøkelsen teller hvor mange som har opplevd det, og helse-modulen spør om det dere kan gjøre noe med: om risikoen er kjent, om hendelser blir meldt og om den som var involvert, blir fulgt opp.',
      measuredBy: { kind: 'module', itemCode: 'HO-VT-2' },
    },
    {
      title: 'For få på vakt til å gjøre jobben forsvarlig',
      body: 'En av fire sykepleiere sier de sjelden eller aldri kan gi forsvarlig pleie til alle pasientene i løpet av en vakt.{{cite:nsf_forsvarlig}} Dansk forskning kaller det moralsk stress: man vet hva som er riktig, men får ikke gjort det.{{cite:ae_dk}} Spørsmål om arbeidsmengde alene fanger ikke opp dette.',
      measuredBy: { kind: 'module', itemCode: 'HO-BF-2' },
    },
    {
      title: 'Turnus som ikke gir hvile',
      body: 'En SINTEF-undersøkelse blant over 18 000 sykepleiere beskriver ubesatte stillinger, stram bemanning og turnuser med lite rom for hvile mellom vaktene.{{cite:sintef_nsf}} De som går turnusen, merker først om den fungerer.',
      measuredBy: { kind: 'module', itemCode: 'HO-TH-1' },
    },
    {
      title: 'Deltid som ingen har valgt',
      body: 'Ufrivillig deltid gjelder 43 000 kommunalt ansatte, og sju av ti deltidsansatte i kommunene jobber i helse og omsorg.{{cite:fafo_deltid}} Deltidsansatte får ofte svakere tilhørighet til arbeidsplassen, og det går ut over både fagmiljø og kontinuitet.{{cite:hdir_heltid}}',
      measuredBy: { kind: 'module', itemCode: 'HO-HF-1' },
    },
    {
      title: 'Når brukere og pårørende går over grensen',
      body: 'Det siste året har 20 prosent av sykepleierne og 16,5 prosent av helsefagarbeiderne opplevd seksuell trakassering – blant de høyeste andelene i arbeidslivet.{{cite:ssb_trakassering}} Det skjer ofte i møte med brukere, der det er lett å bortforklare. Likevel ligger ansvaret for å forebygge hos arbeidsgiver.',
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
      body: 'Arbeid med mennesker gir belastninger som ikke handler om mengde: sorg, sinne, uro og ansvar for andres liv. Hovedundersøkelsen måler disse belastningene, så modulen gjentar dem ikke.',
      measuredBy: { kind: 'core', factorKey: 'emosjon', ordinal: 1, alongside: [2, 3] },
    },
  ],
  moduleOverview: {
    title: 'Helse-modulen',
    intro:
      'Modulen kommer i tillegg til hovedundersøkelsen og er bygget på samme måte. Svarene på en skala med fem trinn blir en indeks fra 0 til 100, og hver faktor har 3 forslag til tiltak.',
    coreAlso: 'teller hvor mange som har opplevd vold eller trusler',
    coreNote: 'Helse-modulen gjentar ikke disse, men går et lag dypere der omsorgsarbeidet er annerledes.',
  },
  loop: {
    title: 'Fra svar til tiltak på neste personalmøte',
    steps: [
      { title: 'Mål', text: 'Hovedmåling med helse-modulen, på SMS eller QR-kode på vaktrommet.' },
      { title: 'Se per avdeling', text: 'Resultat per avdeling og post, for grupper med nok svar – 5 som standard.' },
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
    intro: 'Helse-modulen gir dere dokumentasjon på kartleggingen der omsorgsarbeidet har egne krav. I rapporten ser dere hjemmelen for hver faktor.',
    items: [
      {
        ref: 'aml § 4-3 (2) b',
        text: 'Psykososiale arbeidsmiljøfaktorer omfatter blant annet emosjonelle krav og belastninger i arbeid med mennesker.',
        reviewed: true,
      },
      {
        ref: 'aml § 4-3 (6)',
        text: 'Arbeidstaker skal, så langt det er mulig, beskyttes mot vold, trusler og uheldige belastninger som følge av kontakt med andre.',
        reviewed: true,
      },
      {
        // was «kap. 23A», repealed 1 January 2026 (FOR-2025-12-16-2615); kap. 3A replaces it with the
        // same duties. Corrected 2026-09-27; the text Tor approved is unchanged, the reference awaits
        // his approval in admin › Legal review (D-131)
        ref: 'Forskriften kap. 3A',
        text: 'Der ansatte kan utsettes for vold eller trusler, skal risikoen vurderes, og det skal finnes tiltak, opplæring og oppfølging.',
        reviewed: true,
      },
      {
        ref: 'Forskriften § 1A-2',
        text: 'Faktorene skal kartlegges og risikovurderes hver for seg og samlet, i samarbeid med de ansatte, og gjentas regelmessig.',
        reviewed: true,
      },
      {
        ref: 'aml kapittel 10',
        text: 'Arbeidsplanen skal ikke gi uheldige belastninger, og kravene til hviletid gjelder også i turnus.',
        reviewed: true,
      },
      { ref: 'aml § 14-3', text: 'Deltidsansatte har fortrinnsrett til en utvidet stilling før arbeidsgiver ansetter nye.', reviewed: true },
      {
        ref: 'Likestillings- og diskrimineringsloven § 13',
        text: 'Arbeidsgiver skal forebygge og søke å hindre seksuell trakassering, også fra brukere og pårørende.',
        reviewed: true,
      },
    ],
  },
  faq: [
    {
      q: 'Hvor mye lenger blir undersøkelsen?',
      a: 'Rundt 3 minutter. Helse-modulen er 24 påstander og 2 korte ja/nei-spørsmål, og hovedmålingen tar rundt 4 minutter.',
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
      a: 'Nei. Spørsmålet vises bare som antall for hele virksomheten, aldri per avdeling eller vakt. Som standard vises ingen gruppe før minst 5 har svart, og grensen kan aldri settes under 3.',
    },
    {
      q: 'Hvordan når vi dem som går turnus og natt?',
      a: 'Send undersøkelsen på e-post eller SMS, eller del den som lenke og QR-kode på vaktrommet. Den står åpen i flere dager, så alle vakter rekker å svare.',
    },
    {
      q: 'Kan vi se resultat per avdeling eller post?',
      a: 'Ja, i pakken Vanlig, for avdelinger med nok svar – 5 som standard. Har en avdeling for få svar, teller svarene med i virksomhetens tall.',
    },
    {
      q: 'Hva koster det?',
      a: 'Liten koster 265 kr i måneden for til og med 25 ansatte, Vanlig 565 kr for 26–100 ansatte. Prisene er eks. mva., uten binding og med 15 dager gratis.',
    },
  ],
  cta: {
    title: 'Prøv det i deres egen virksomhet',
    text: 'Skriv inn organisasjonsnummeret, legg inn ansattlista og send på SMS. Dere er i gang på 3 minutter, uten kortopplysninger.',
  },
  questionPage: {
    crumb: 'Spørsmålssettet',
    h1: 'Spørsmåls­settet for helse og omsorg',
    lead: 'Se alle 24 påstandene helse-modulen legger til hovedundersøkelsen – 8 faktorer med 3 påstander hver. Hver faktor har en begrunnelse fra forskning og tilsyn, en hjemmel og 3 forslag til tiltak dere kan måle på nytt i pulsen.',
    scaleNote: 'Hver person får påstandene i tilfeldig rekkefølge. Ordlyden ligger fast, så dere kan sammenligne tall fra måling til måling.',
    countTitle: 'To spørsmål som bare telles',
    countIntro: 'Noen spørsmål passer ikke i en indeks, men sier mye om det avvikssystemet ikke fanger. De vises bare som antall for hele virksomheten.',
    segmentsTitle: 'Bakgrunnsspørsmål',
    segmentsIntro:
      'Valgfrie, for å se forskjell mellom dag, kveld og natt, og mellom heltid og deltid. Hovedundersøkelsen spør allerede om vold og trusler de siste 12 månedene og om krenkende atferd, så det gjentas ikke her.',
    rulesTitle: 'Slik rapporteres svarene',
    rules: [
      { title: 'Minst 5 svar som standard', text: 'Ingen gruppe eller segment vises før minst 5 har svart. Grensen kan heves til 10. Små team kan senke den til 3; en runde beholder grensen den startet med.' },
      { title: 'Ingen regning bakover', text: 'Hvis en gruppe kan regnes ut fra totalen og de andre gruppene, holdes en gruppe til tilbake.' },
      { title: 'Ja/nei-spørsmålene', text: 'HO-T-1 og HO-T-2 vises bare som antall for hele virksomheten, aldri per avdeling eller segment.' },
      {
        title: 'Segmenter',
        text: 'Vaktordning og stillingsstørrelse vises bare der grensen er nådd, og aldri kombinert med en gruppe hvis det gir færre svar enn grensen.',
        featureFlag: 'module_segments',
      },
      { title: 'Samme indeks', text: 'Hver påstand regnes om til 0–100, og faktoren er snittet av sine tre påstander.' },
      { title: 'Risikonivå', text: '65 eller mer er lav risiko, 50–64 middels og under 50 høy – det samme som i hovedundersøkelsen.' },
      { title: 'Pulsen', text: 'Når en faktor har åpne tiltak, kommer påstanden som måler tiltaket, med i neste puls.' },
      {
        title: 'Velg det som gjelder',
        text: 'Faktorer som ikke passer, kan slås av. Forflytning gir for eksempel lite mening på et legekontor.',
        featureFlag: 'module_factor_toggles',
      },
    ],
    coreNote: 'Helse-modulen gjentar ikke disse.',
    cta: { title: 'Legg helse-modulen til neste måling', text: 'Skriv inn organisasjonsnummeret. Dere er i gang på 3 minutter, uten kortopplysninger.' },
  },
  related: ['bygg-og-anlegg'],
  // the reference lists only what the page itself cites
  sourcesFromFactors: false,
}
