import type { IndustryPage } from './types'

/**
 * /bygg-og-anlegg beyond its landing page (D-208): the menu name, whether it is live, the module, and the
 * question page's own words (/bygg-og-anlegg/sporsmal, statements from modules/bygg-og-anlegg/v1.json).
 * The page itself is the landing template and its messages; the words only the older template
 * drew are gone, and `law` stays as the legal review's record (D-213).
 */
export const byggOgAnlegg: IndustryPage = {
  slug: 'bygg-og-anlegg',
  navLabel: 'Bygg og anlegg',
  launched: true,
  module: { key: 'bygg-og-anlegg' },
  moduleName: 'Bygg-modulen',
  law: {
    title: 'Det loven peker på',
    intro: 'Bygg-modulen gir dere dokumentasjon på kartleggingen der byggeplassen har egne krav. I rapporten ser dere hjemmelen for hver faktor.',
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
  questionPage: {
    crumb: 'Spørsmålssettet',
    h1: 'Spørsmåls\u00ADsettet for bygg og anlegg',
    lead: 'Se alle 24 påstandene bygg-modulen legger til hovedundersøkelsen – 8 faktorer med 3 påstander hver. Hver faktor har en begrunnelse fra forskning og tilsyn, en hjemmel og 3 forslag til tiltak dere kan måle på nytt i pulsen.',
    scaleNote: 'Hver person får påstandene i tilfeldig rekkefølge. Ordlyden ligger fast, så dere kan sammenligne tall fra måling til måling.',
    countTitle: 'To spørsmål som bare telles',
    countIntro: 'Noen spørsmål passer ikke i en indeks, men sier mye om det avvikssystemet ikke fanger. De vises bare som antall for hele virksomheten.',
    segmentsTitle: 'Bakgrunnsspørsmål',
    segmentsIntro: 'Valgfrie, for å se forskjell mellom byggeplass og verksted, og mellom nye og erfarne. Hovedundersøkelsen spør allerede om krenkende atferd, så det spørsmålet gjentas ikke her.',
    rulesTitle: 'Slik rapporteres svarene',
    rules: [
      { title: 'Minst 5 svar som standard', text: 'Ingen gruppe vises før minst 5 har svart. Grensen kan heves til 10. Små team kan senke den til 3; en runde beholder grensen den startet med.' },
      { title: 'Ingen regning bakover', text: 'Hvis en gruppe kan regnes ut fra totalen og de andre gruppene, holdes en gruppe til tilbake.' },
      { title: 'Ja/nei-spørsmålene', text: 'BA-T-1 og BA-T-2 vises bare som antall for hele virksomheten, aldri per prosjekt.' },
      {
        title: 'Segmenter',
        text: 'Arbeidssted og ansiennitet vises bare der grensen er nådd, og aldri kombinert med en gruppe hvis det gir færre svar enn grensen.',
        featureFlag: 'module_segments',
      },
      { title: 'Samme indeks', text: 'Hver påstand regnes om til 0–100, og faktoren er snittet av sine tre påstander.' },
      { title: 'Risikonivå', text: '65 eller mer er lav risiko, 50–64 middels og under 50 høy – det samme som i hovedundersøkelsen.' },
      { title: 'Pulsen', text: 'Når en faktor har åpne tiltak, kommer påstanden som måler tiltaket, med i neste puls.' },
      {
        title: 'Velg det som gjelder',
        text: 'Faktorer som ikke passer, kan slås av. Samordning på byggeplassen gir for eksempel lite mening i et verksted uten underentreprenører.',
        featureFlag: 'module_factor_toggles',
      },
    ],
    coreNote: 'Bygg-modulen gjentar ikke disse.',
    cta: { title: 'Legg bygg-modulen til neste måling', text: 'Skriv inn organisasjonsnummeret. Dere er i gang på 3 minutter, uten kortopplysninger.' },
  },
}
