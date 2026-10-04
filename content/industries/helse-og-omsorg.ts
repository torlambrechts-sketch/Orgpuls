import type { IndustryPage } from './types'

/**
 * /helse-og-omsorg beyond its landing page (D-210): the menu name, whether it is live, the module, and the
 * question page's own words (/helse-og-omsorg/sporsmal, statements from modules/helse-og-omsorg/v1.json).
 * The page itself is the landing template and its messages; the words only the older template
 * drew are gone, and `law` stays as the legal review's record (D-213).
 */
export const helseOgOmsorg: IndustryPage = {
  slug: 'helse-og-omsorg',
  navLabel: 'Helse og omsorg',
  // Tor approved the page and its seven law items on 2026-09-27 (X-065)
  launched: true,
  module: { key: 'helse-og-omsorg' },
  moduleName: 'Helse-modulen',
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
}
