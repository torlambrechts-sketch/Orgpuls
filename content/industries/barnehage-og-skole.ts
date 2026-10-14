import type { IndustryPage } from './types'

/**
 * /barnehage-og-skole beyond its landing page (D-211): the menu name, whether it is live, the module, and the
 * question page's own words (/barnehage-og-skole/sporsmal, statements from modules/barnehage-og-skole/v1.json).
 * The page itself is the landing template and its messages; the words only the older template
 * drew are gone, and `law` stays as the legal review's record (D-213).
 */
export const barnehageOgSkole: IndustryPage = {
  slug: 'barnehage-og-skole',
  navLabel: 'Barnehage og skole',
  launched: true,
  module: { key: 'barnehage-og-skole' },
  moduleName: 'Barnehage- og skolemodulen',
  law: {
    title: 'Det loven peker på i barnehage og skole',
    intro: 'Barnehage- og skolemodulen gir dere dokumentasjon på kartleggingen der arbeidet med barn og elever har egne krav. I rapporten ser dere hjemmelen for hver faktor.',
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
  questionPage: {
    crumb: 'Spørsmålssettet',
    metaTitle: 'Spørsmål: arbeidsmiljøundersøkelse i barnehage og skole | Orgpuls',
    metaDescription: 'Se alle 24 påstandene modulen for barnehage og skole legger til arbeidsmiljøundersøkelsen – 8 faktorer med begrunnelse, hjemmel og forslag til tiltak.',
    h1: 'Spørsmåls­settet for barnehage og skole',
    lead: 'Se alle 24 påstandene modulen legger til hovedundersøkelsen – 8 faktorer med 3 påstander hver. Hver faktor har en begrunnelse fra forskning, tilsyn eller regelverket, en hjemmel og 3 forslag til tiltak dere kan måle på nytt i pulsen.',
    scaleNote: 'Hver person får påstandene i tilfeldig rekkefølge. Ordlyden ligger fast, så dere kan sammenligne tall fra måling til måling.',
    countTitle: 'To spørsmål som bare telles',
    countIntro: 'Noen spørsmål passer ikke i en indeks, men sier mye om det avvikssystemet ikke fanger. De vises bare som antall for hele virksomheten.',
    segmentsTitle: 'Bakgrunnsspørsmål',
    segmentsIntro:
      'Valgfrie, for å se forskjell mellom roller og stillingsstørrelser. Hovedundersøkelsen spør allerede om vold og trusler de siste 12 månedene og om krenkende atferd, så det gjentas ikke her.',
    rulesTitle: 'Slik rapporteres svarene',
    rules: [
      { title: 'Minst 5 svar som standard', text: 'Ingen gruppe eller segment vises før minst 5 har svart. Grensen kan heves til 10. Små team kan senke den til 3; en runde beholder grensen den startet med.' },
      { title: 'Ingen regning bakover', text: 'Hvis en gruppe kan regnes ut fra totalen og de andre gruppene, holdes en gruppe til tilbake.' },
      { title: 'Ja/nei-spørsmålene', text: 'BS-T-1 og BS-T-2 vises bare som antall for hele virksomheten, aldri per trinn, avdeling eller segment.' },
      {
        title: 'Segmenter',
        text: 'Rolle og stillingsstørrelse vises bare der grensen er nådd. «Leder eller administrasjon» slås sammen med nærmeste gruppe når den har færre svar enn grensen.',
        featureFlag: 'module_segments',
      },
      { title: 'Samme indeks', text: 'Hver påstand regnes om til 0–100, og faktoren er snittet av sine tre påstander.' },
      { title: 'Risikonivå', text: '65 eller mer er lav risiko, 50–64 middels og under 50 høy – det samme som i hovedundersøkelsen.' },
      // the brief § 5.1: the pilot tests that the three work alike; until then the page claims no more
      { title: 'Ordbruk', text: 'Påstandene sier «barna» i barnehagen og «elevene» i skolen. Kodene og skåringen er de samme, og piloten tester at de tre versjonene fungerer likt.' },
      { title: 'Vanskelige saker', text: 'Faktoren handler om plikter, ikke om enkeltsaker. Ikke skriv om enkeltbarn eller enkeltelever i kommentarfeltet.' },
      { title: 'Pulsen', text: 'Når en faktor har åpne tiltak, kommer påstanden som måler tiltaket, med i neste puls.' },
    ],
    coreNote: 'Barnehage- og skolemodulen gjentar ikke disse.',
    cta: { title: 'Legg barnehage- og skolemodulen til neste måling', text: 'Skriv inn organisasjonsnummeret. Dere er i gang på 3 minutter, uten kortopplysninger.' },
  },
}
