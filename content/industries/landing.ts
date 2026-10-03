import type { ShotId } from '@/lib/marketing/shot-ids'
import type { PageLang } from './modules'
import type { IndustryPage } from './types'

/**
 * The industry landing page (D-207): one template (components/industry/IndustryLanding.tsx), its
 * words in the messages (`site.bransje.<msg>`, `site.bransje.common` for the labels every industry
 * shares), and this registry for what is not words — which module and which core factors measure
 * each challenge, which source backs each figure, which product pictures prove the claims.
 *
 * Moving another industry onto the template is an entry here and its messages; nothing in the
 * component changes. An industry without an entry keeps the older template (IndustryView) and its
 * content file. The messages' arrays are read in the registry's order and must be as long as the
 * registry says (the template parses them with exact lengths, and tests/unit/industry-landing
 * checks both languages), so a figure can never lose its source by drifting out of step.
 *
 * Every source is a document someone fetched and read; docs/marketing/<slug>-sources.md records
 * what each figure is, where in the source it stands, and when it was fetched. The page numbers the
 * sources in this order.
 */
export type LandingSource = { key: string; url: string; year: string }

export type LandingChallenge = {
  /** sources for the figure line (`fig`) */
  cites: string[]
  /** the module's factors that measure it (`site.bransje.<msg>.moduleFactors.<id>`) */
  module: string[]
  /** the core instrument's factors that measure it (`factor.<id>.label`) */
  core: string[]
}

export type IndustryLanding = {
  slug: IndustryPage['slug']
  /** its messages: `site.bransje.<msg>` */
  msg: string
  /**
   * Live in a language. Off, the address shows it only with ?forhandsvis=1, marked noindex. The
   * English page waits for the module file's English translation, as every English industry page
   * does (validate.ts: the page quotes what an English respondent is asked).
   */
  live: Record<PageLang, boolean>
  module: string
  /** the hero's picture: a real screen (assets/produkt) */
  heroShot: ShotId
  stats: { leadCites: string[]; items: string[][]; noteCites: string[] }
  why: { lawCites: string[]; tilsynCites: string[]; gapCites: string[]; costCites: string[][] }
  challenges: LandingChallenge[]
  /** `site.bransje.<msg>.proof.blocks`, one picture each */
  proof: ShotId[]
  faqCount: number
  /** «Les videre»: a message key under `related` and where it goes; an article by its slug */
  related: { key: string; href: string }[]
  articles: string[]
  sources: LandingSource[]
  /** the date the sources were fetched, for the line over the list */
  fetched: string
}

export const LANDINGS: IndustryLanding[] = [
  {
    slug: 'handel',
    msg: 'handel',
    live: { no: true, en: false },
    module: 'handel',
    heroShot: 'sporsmal',
    stats: {
      leadCites: ['ssb', 'at_tilsyn'],
      items: [['fafo'], ['fafo'], ['stami'], ['ssb']],
      noteCites: ['fafo'],
    },
    why: {
      lawCites: ['lovdata_aml', 'lovdata_forskrift'],
      tilsynCites: ['at_tilsyn'],
      gapCites: ['fafo_verneombud'],
      costCites: [['stami'], ['at_vold'], ['fafo_senior']],
    },
    challenges: [
      { cites: ['fafo', 'at_kompass'], module: ['sikkerhet_tyveri_trusler'], core: [] },
      { cites: ['fafo'], module: ['alene_pa_vakt'], core: [] },
      { cites: ['stami'], module: ['grenser_mot_kunder'], core: ['emosjon'] },
      { cites: ['at_vold', 'lovdata_forskrift'], module: ['bemanning_og_tempo'], core: ['mengde'] },
      { cites: ['fafo', 'fafo_merarbeid'], module: ['vaktplan'], core: ['medvirk'] },
      { cites: ['ssb', 'fafo'], module: ['opplaering', 'stilling_og_tilhorighet'], core: [] },
      { cites: ['stami'], module: ['fysisk_arbeid'], core: [] },
      { cites: ['fafo'], module: ['grenser_mot_kunder'], core: ['integritet'] },
    ],
    proof: ['tiltak', 'rapport'],
    faqCount: 8,
    related: [
      { key: 'sporsmal', href: '/handel/sporsmal' },
      { key: 'lovkrav', href: '/lovkrav' },
      { key: 'smaa', href: '/smaa-bedrifter' },
      { key: 'priser', href: '/priser' },
    ],
    articles: ['krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'anonym-medarbeiderundersokelse'],
    fetched: '2026-10-03',
    sources: [
      { key: 'fafo', url: 'https://www.fafo.no/images/pub/10411.pdf', year: '2024' },
      { key: 'fafo_merarbeid', url: 'https://www.fafo.no/images/pub/2026/20961_1.pdf', year: '2026' },
      { key: 'fafo_verneombud', url: 'https://www.fafo.no/images/pub/2025/20923.pdf', year: '2025' },
      { key: 'fafo_senior', url: 'https://www.fafo.no/images/pub/2023/Faktaflak-07-varehandelen.pdf', year: '2023' },
      { key: 'stami', url: 'https://noa.stami.no/yrker-og-naeringer/noa/varehandel/', year: '2022' },
      { key: 'ssb', url: 'https://www.ssb.no/statbank/table/07203/', year: '2025' },
      {
        key: 'at_tilsyn',
        url: 'https://kommunikasjon.ntb.no/pressemelding/18977009/arbeidstilsynet-forer-tilsyn-med-varehandel?publisherId=14974413&lang=no',
        year: '2026',
      },
      { key: 'at_vold', url: 'https://www.arbeidstilsynet.no/arbeidsmiljo/vold-og-trusler/', year: '2026' },
      {
        key: 'at_kompass',
        url: 'https://www.arbeidstilsynet.no/globalassets/rapportar/kompass/kompass-tema-nr-4.-2026-dodsfall-og-personskader-som-folge-av-vold-og-trusler-i-norsk-landbasert-arbeidsliv.pdf',
        year: '2026',
      },
      { key: 'lovdata_forskrift', url: 'https://lovdata.no/forskrift/2011-12-06-1357', year: '2026' },
      { key: 'lovdata_aml', url: 'https://lovdata.no/lov/2005-06-17-62', year: '2026' },
    ],
  },
]

export const landingFor = (slug: string): IndustryLanding | null => LANDINGS.find((l) => l.slug === slug) ?? null

/** Every source key a landing cites, in the order the page meets them */
export function citedKeys(l: IndustryLanding): string[] {
  return [
    ...l.stats.leadCites,
    ...l.stats.items.flat(),
    ...l.stats.noteCites,
    ...l.why.lawCites,
    ...l.why.tilsynCites,
    ...l.why.gapCites,
    ...l.why.costCites.flat(),
    ...l.challenges.flatMap((c) => c.cites),
  ]
}
