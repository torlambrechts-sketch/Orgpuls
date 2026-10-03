import type { IndustryPage } from './types'

/**
 * /kunnskap-og-kontor beyond its landing page (D-212): the menu name, whether it is live, the module, and the
 * question page's own words (/kunnskap-og-kontor/sporsmal, statements from modules/kunnskap-og-kontor/v1.json).
 * The page itself is the landing template and its messages; the words only the older template
 * drew are gone, and `law` stays as the legal review's record (D-213).
 */
export const kunnskapOgKontor: IndustryPage = {
  slug: 'kunnskap-og-kontor',
  navLabel: 'Kunnskap og kontor',
  launched: true,
  card: { newUntil: '2026-12-27' },
  module: { key: 'kunnskap-og-kontor' },
  moduleName: 'Kontor-modulen',
  law: {
    title: 'Det loven peker på i kunnskaps- og kontorarbeid',
    intro: 'Kontor-modulen gir dere dokumentasjon på kartleggingen der kunnskapsarbeid har egne belastninger. I rapporten ser dere hjemmelen for hver faktor.',
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
  questionPage: {
    crumb: 'Spørsmålssettet',
    h1: 'Spørsmåls­settet for kunnskap og kontor',
    lead: 'Utvidet har 15 faktorer og opptil 62 påstander. Forenklet har 8 faktorer med 3 påstander hver – alle kjernepåstander som også er med i utvidet. Hver faktor har en begrunnelse fra forskning eller regelverket, en hjemmel og 3 forslag til tiltak dere kan måle på nytt i pulsen.',
    scaleNote: 'Hver person får påstandene i tilfeldig rekkefølge. Ordlyden ligger fast, så dere kan sammenligne tall fra måling til måling.',
    countTitle: 'Fire spørsmål som bare telles',
    countIntro: 'Noen spørsmål passer ikke i en indeks, men sier mye om tilgjengelighet og hjemmekontor. De vises bare som antall for hele virksomheten.',
    segmentsTitle: 'Bakgrunnsspørsmål',
    segmentsIntro: 'Valgfrie, for å se forskjell mellom arbeidsformer og hvor mye som går til kundearbeid. Lederrolle og stillingstype brukes ikke, fordi det gir for små grupper.',
    rulesTitle: 'Slik rapporteres svarene',
    rules: [
      { title: 'Minst 5 svar som standard', text: 'Ingen gruppe eller segment vises før minst 5 har svart. Grensen kan heves til 10. Små team kan senke den til 3; en runde beholder grensen den startet med.' },
      { title: 'Ingen regning bakover', text: 'Hvis en gruppe kan regnes ut fra totalen og de andre gruppene, holdes en gruppe til tilbake.' },
      { title: 'Ja/nei-spørsmålene', text: 'KK-T-1 til KK-T-4 vises bare som antall for hele virksomheten, aldri per team eller segment. «Jobber ikke fast hjemmefra» holdes utenfor andelen.' },
      { title: 'Forenklet og utvidet', text: 'Kjernepåstandene er med i begge. I utvidet regnes de åtte forenklede faktorene også ut, som sammenlignbar indeks.' },
      { title: 'Samme indeks', text: 'Hver påstand regnes om til 0–100, og faktoren er snittet av sine påstander. En faktor vises bare når alle påstandene i den er stilt.' },
      { title: 'Foreløpige terskler', text: '65 eller mer er lav risiko, 50–64 middels og under 50 høy – det samme som i hovedundersøkelsen, men merket foreløpig til modulen er validert.' },
      { title: 'Pulsen', text: 'Når en faktor har åpne tiltak, kommer påstanden som måler tiltaket, med i neste puls.' },
    ],
    coreNote: 'Kontor-modulen gjentar ikke disse.',
    cta: { title: 'Legg kontor-modulen til neste måling', text: 'Skriv inn organisasjonsnummeret. Dere er i gang på 3 minutter, uten kortopplysninger.' },
  },
}
