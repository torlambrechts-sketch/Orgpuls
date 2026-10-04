import type { IndustryPage } from './types'

/**
 * /handel beyond its landing page (D-207): the menu name, whether it is live, the module, and the
 * question page's own words (/handel/sporsmal, statements from modules/handel/v1.json).
 * The page itself is the landing template and its messages; the words only the older template
 * drew are gone, and `law` stays as the legal review's record (D-213).
 */
export const handel: IndustryPage = {
  slug: 'handel',
  navLabel: 'Handel',
  launched: true,
  card: { newUntil: '2026-12-27' },
  module: { key: 'handel' },
  moduleName: 'Handel-modulen',
  law: {
    title: 'Det loven peker på i handelen',
    intro: 'Handel-modulen gir dere dokumentasjon på kartleggingen der butikk og lager har egne krav. I rapporten ser dere hjemmelen for hver faktor.',
    items: [
      {
        ref: 'aml § 4-3 (6)',
        text: 'Arbeidstaker skal, så langt det er mulig, beskyttes mot vold, trusler og uheldige belastninger som følge av kontakt med andre.',
        reviewed: true,
      },
      {
        // was «kap. 23A», repealed 1 January 2026 (FOR-2025-12-16-2615); kap. 3A replaces it with the
        // same duties, as corrected on helse-og-omsorg and barnehage-og-skole (D-131). The text is
        // unchanged; the reference awaits Tor's look in admin › Legal review
        ref: 'Forskriften kap. 3A',
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
  questionPage: {
    crumb: 'Spørsmålssettet',
    h1: 'Spørsmåls­settet for handel',
    lead: 'Se alle 24 påstandene handel-modulen legger til hovedundersøkelsen – 8 faktorer med 3 påstander hver. Hver faktor har en begrunnelse fra forskning og tilsyn, en hjemmel og 3 forslag til tiltak dere kan måle på nytt i pulsen.',
    scaleNote: 'Hver person får påstandene i tilfeldig rekkefølge. Ordlyden ligger fast, så dere kan sammenligne tall fra måling til måling.',
    countTitle: 'To spørsmål som bare telles',
    countIntro: 'Noen spørsmål passer ikke i en indeks, men sier mye om det avvikssystemet ikke fanger og om alenevaktene. De vises bare som antall for hele virksomheten.',
    segmentsTitle: 'Bakgrunnsspørsmål',
    segmentsIntro: 'Valgfrie, for å se forskjell mellom butikk og lager, og mellom heltid og deltid. Undersøkelsen spør ikke om alder, fordi mange i handelen er unge og gruppene da blir for små.',
    rulesTitle: 'Slik rapporteres svarene',
    rules: [
      { title: 'Minst 5 svar som standard', text: 'Ingen gruppe vises før minst 5 har svart. Grensen kan heves til 10. Små team kan senke den til 3; en runde beholder grensen den startet med.' },
      { title: 'Ingen regning bakover', text: 'Hvis en gruppe kan regnes ut fra totalen og de andre gruppene, holdes en gruppe til tilbake.' },
      {
        title: 'Ja/nei-spørsmålene',
        text: 'HA-T-1 og HA-T-2 vises bare som antall for hele virksomheten, aldri per butikk eller vakt. «Jobber aldri alene» holdes utenfor andelen.',
      },
      {
        title: 'Segmenter',
        text: 'Arbeidssted og stillingsstørrelse vises bare der grensen er nådd, og aldri kombinert med en gruppe hvis det gir færre svar enn grensen.',
        featureFlag: 'module_segments',
      },
      { title: 'Samme indeks', text: 'Hver påstand regnes om til 0–100, og faktoren er snittet av sine tre påstander.' },
      {
        title: 'Foreløpige terskler',
        text: '65 eller mer er lav risiko, 50–64 middels og under 50 høy – det samme som i hovedundersøkelsen, men merket foreløpig til modulen er validert.',
      },
      { title: 'Pulsen', text: 'Når en faktor har åpne tiltak, kommer påstanden som måler tiltaket, med i neste puls.' },
      {
        title: 'Velg det som gjelder',
        text: 'Alene på vakt kan slås av der ingen jobber alene, og Grenser mot kunder der ingen har kundekontakt. Da stilles heller ikke spørsmålet om å jobbe alene og føle seg utrygg.',
        featureFlag: 'module_factor_toggles',
      },
    ],
    coreNote: 'Handel-modulen gjentar ikke disse.',
    cta: { title: 'Legg handel-modulen til neste måling', text: 'Skriv inn organisasjonsnummeret. Dere er i gang på 3 minutter, uten kortopplysninger.' },
  },
}
