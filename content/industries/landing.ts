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
 * Every source is a document someone fetched and read; docs/marketing/<msg>-sources.md records
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
  /**
   * A module in two variants (kunnskap og kontor, 0089, D-212): the page shows both, their sizes and
   * factors read from the module file, and `picks` – extended factors to weigh for a kind of business,
   * one list per `site.bransje.<msg>.variants.picks.items` entry. Absent for a module asked one way.
   */
  variants?: { picks: string[][] }
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
  {
    // D-208. English is live: modules/bygg-og-anlegg/v1.json carries the English translation (D-120)
    slug: 'bygg-og-anlegg',
    msg: 'bygg',
    live: { no: true, en: true },
    module: 'bygg-og-anlegg',
    heroShot: 'sporsmal',
    stats: {
      leadCites: ['at_kompass26'],
      items: [['at_kompass26'], ['at_kompass26'], ['noa'], ['noa']],
      noteCites: ['fafo_hms'],
    },
    why: {
      lawCites: ['lovdata_aml', 'lovdata_bhf', 'lovdata_forskrift'],
      tilsynCites: ['at_arsrapport'],
      gapCites: ['fafo_hms', 'fafo_verneombud'],
      costCites: [['noa'], ['at_kompass25'], ['fafo_dapi']],
    },
    challenges: [
      { cites: ['fafo_hms', 'at_kompass25'], module: ['sikkerhet_foran_fremdrift', 'planlegging_og_fremdrift'], core: ['mengde'] },
      { cites: ['at_kompass25', 'fafo_innleie'], module: ['samordning_pa_byggeplassen'], core: ['kontakt'] },
      { cites: ['fafo_hms'], module: ['sprak_og_beskjeder'], core: [] },
      { cites: ['at_kompass26', 'at_kompass25'], module: ['nye_og_unge'], core: [] },
      { cites: ['fafo_hms'], module: ['sikkerhet_i_laget'], core: ['ytring'] },
      { cites: ['fafo_hms', 'at_kompass25'], module: [], core: ['kollega', 'integritet'] },
      { cites: ['fafo_hms', 'noa_anlegg'], module: ['arbeidstid_og_restitusjon'], core: [] },
      { cites: ['at_kompass26', 'noa'], module: ['a_si_at_man_ikke_har_det_bra'], core: [] },
    ],
    proof: ['varmekart', 'tiltak', 'rapport'],
    faqCount: 8,
    related: [
      { key: 'sporsmal', href: '/bygg-og-anlegg/sporsmal' },
      { key: 'lovkrav', href: '/lovkrav' },
      { key: 'verneombud', href: '/verneombud' },
      { key: 'smaa', href: '/smaa-bedrifter' },
      { key: 'priser', href: '/priser' },
    ],
    articles: ['krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'anonym-medarbeiderundersokelse'],
    fetched: '2026-10-03',
    sources: [
      {
        key: 'at_kompass26',
        url: 'https://www.arbeidstilsynet.no/globalassets/rapportar/kompass/kompass-tema-nr-1.-2026-ulykker-i-bygg-og-anlegg.pdf',
        year: '2026',
      },
      { key: 'noa', url: 'https://noa.stami.no/yrker-og-naeringer/noa/bygg/', year: '2022' },
      { key: 'fafo_hms', url: 'https://www.fafo.no/images/pub/2026/20947.pdf', year: '2025' },
      { key: 'lovdata_aml', url: 'https://lovdata.no/lov/2005-06-17-62', year: '2026' },
      { key: 'lovdata_bhf', url: 'https://lovdata.no/forskrift/2009-08-03-1028', year: '2024' },
      { key: 'lovdata_forskrift', url: 'https://lovdata.no/forskrift/2011-12-06-1357', year: '2026' },
      {
        key: 'at_arsrapport',
        url: 'https://www.arbeidstilsynet.no/globalassets/rapportar/arsrapport/arsrapport-2025/arbeidstilsynets-arsrapport-2025.pdf',
        year: '2026',
      },
      { key: 'fafo_verneombud', url: 'https://www.fafo.no/images/pub/2025/20923.pdf', year: '2025' },
      {
        key: 'at_kompass25',
        url: 'https://www.arbeidstilsynet.no/globalassets/rapportar/kompass/kompass-tema-nr-1.-2025-helseproblemer-og-ulykker-i-bygg-og-anlegg.pdf',
        year: '2025',
      },
      { key: 'fafo_dapi', url: 'https://www.fafo.no/images/pub/20902.pdf', year: '2024' },
      { key: 'fafo_innleie', url: 'https://www.fafo.no/images/pub/10416.pdf', year: '2024' },
      { key: 'noa_anlegg', url: 'https://noa.stami.no/yrker-og-naeringer/noa/anlegg/', year: '2022' },
    ],
  },
  {
    // D-210. English is live: modules/helse-og-omsorg/v1.json carries the English translation (D-120)
    slug: 'helse-og-omsorg',
    msg: 'helse',
    live: { no: true, en: true },
    module: 'helse-og-omsorg',
    heroShot: 'sporsmal',
    stats: {
      leadCites: ['ssb_aku'],
      items: [['ssb_fravaer'], ['noa_sykehjem'], ['noa_hjemme'], ['ssb_aku']],
      noteCites: ['at_signal'],
    },
    why: {
      lawCites: ['lovdata_aml', 'lovdata_forskrift'],
      tilsynCites: ['at_arsrapport'],
      gapCites: ['noa_klinikk', 'fafo_verneombud'],
      costCites: [['noa_sykehjem', 'noa_hjemme'], ['fafo_mobilitet'], ['fafo_deltid']],
    },
    challenges: [
      { cites: ['noa_sykehjem', 'noa_hjemme', 'at_alene'], module: ['vold_og_trusler'], core: ['kontakt'] },
      { cites: ['noa_hjemme', 'noa_sykehjem'], module: [], core: ['emosjon', 'leder'] },
      { cites: ['at_signal'], module: ['bemanning_og_forsvarlig_omsorg', 'tid_til_kjerneoppgavene'], core: ['mengde'] },
      { cites: ['noa_sykehjem'], module: ['grenser_mot_brukere_og_parorende'], core: ['motstrid'] },
      { cites: ['noa_sykehjem'], module: ['turnus_og_hvile'], core: [] },
      { cites: ['fafo_deltid'], module: ['stilling_og_tilhorighet'], core: [] },
      { cites: ['fafo_ufaglaerte', 'noa_sykehjem'], module: ['faglig_trygghet'], core: [] },
      { cites: ['noa_sykehjem', 'noa_hjemme'], module: ['forflytning_og_tunge_loft'], core: [] },
    ],
    proof: ['varmekart', 'tiltak', 'arshjul', 'rapport'],
    faqCount: 8,
    related: [
      { key: 'sporsmal', href: '/helse-og-omsorg/sporsmal' },
      { key: 'lovkrav', href: '/lovkrav' },
      { key: 'verneombud', href: '/verneombud' },
      { key: 'smaa', href: '/smaa-bedrifter' },
      { key: 'priser', href: '/priser' },
    ],
    articles: ['krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'anonym-medarbeiderundersokelse'],
    fetched: '2026-10-03',
    sources: [
      { key: 'ssb_aku', url: 'https://www.ssb.no/statbank/table/07203/', year: '2025' },
      { key: 'ssb_fravaer', url: 'https://www.ssb.no/statbank/table/12440/', year: '2026' },
      { key: 'noa_sykehjem', url: 'https://noa.stami.no/yrker-og-naeringer/noa/sykehjem/', year: '2022' },
      { key: 'noa_hjemme', url: 'https://noa.stami.no/yrker-og-naeringer/noa/hjemmetjenesten/', year: '2022' },
      { key: 'at_signal', url: 'https://www.arbeidstilsynet.no/globalassets/rapportar/signal/signal-1-2024.pdf', year: '2024' },
      { key: 'lovdata_aml', url: 'https://lovdata.no/lov/2005-06-17-62', year: '2026' },
      { key: 'lovdata_forskrift', url: 'https://lovdata.no/forskrift/2011-12-06-1357', year: '2026' },
      {
        key: 'at_arsrapport',
        url: 'https://www.arbeidstilsynet.no/globalassets/rapportar/arsrapport/arsrapport-2025/arbeidstilsynets-arsrapport-2025.pdf',
        year: '2026',
      },
      { key: 'noa_klinikk', url: 'https://noa.stami.no/yrker-og-naeringer/noa/helseklinikker/', year: '2022' },
      { key: 'fafo_verneombud', url: 'https://www.fafo.no/images/pub/2025/20923.pdf', year: '2025' },
      { key: 'fafo_mobilitet', url: 'https://www.fafo.no/images/pub/2025/20932.pdf', year: '2025' },
      {
        key: 'fafo_deltid',
        url: 'https://www.ks.no/contentassets/b88c1738025446b68f9744059225437b/deltidsansettelser_og_barekraftig_bemanning_med_ks-logo.pdf',
        year: '2026',
      },
      { key: 'at_alene', url: 'https://www.arbeidstilsynet.no/arbeidstid-og-organisering/alenearbeid', year: '2026' },
      { key: 'fafo_ufaglaerte', url: 'https://www.fafo.no/images/pub/2025/20921_2.pdf', year: '2025' },
    ],
  },
  {
    // D-212. A module in two variants (0089, D-137): the variants block shows both, from the file.
    // English waits: modules/kunnskap-og-kontor/v1.json has no `translations.en` (D-120)
    slug: 'kunnskap-og-kontor',
    msg: 'kontor',
    live: { no: true, en: false },
    module: 'kunnskap-og-kontor',
    heroShot: 'sporsmal',
    stats: {
      leadCites: ['ssb_aku', 'noa_kontor'],
      items: [['noa_kontor'], ['fafo_koble'], ['stami_varig'], ['nav_fravaer']],
      noteCites: ['noa_kontor'],
    },
    why: {
      lawCites: ['lovdata_aml', 'lovdata_hjemmekontor', 'lovdata_forskrift'],
      tilsynCites: ['at_arsrapport'],
      gapCites: ['fafo_verneombud', 'fafo_koble'],
      costCites: [['noa_kontor'], ['stami_landskap'], ['nav_fravaer']],
    },
    challenges: [
      { cites: ['noa_kontor', 'fafo_abw'], module: ['fokus_og_avbrytelser', 'motekultur'], core: [] },
      { cites: ['noa_kontor', 'fafo_koble'], module: ['tilgjengelighet'], core: [] },
      { cites: ['fafo_koble'], module: ['arbeid_privatliv', 'restitusjon'], core: [] },
      { cites: ['abelia_hr', 'stami_hjemmekontor'], module: ['hybrid_samhandling', 'tilhorighet'], core: ['rolle', 'kollega'] },
      { cites: ['fafo_koble'], module: ['kunde_og_leveransepress'], core: ['mengde', 'motstrid'] },
      { cites: ['noa_kontor', 'noa_finans', 'ssb_ki'], module: ['ki_og_endring', 'jobbtrygghet'], core: ['medvirk'] },
      { cites: ['noa_kontor', 'at_hjemmekontor'], module: ['fysisk_arbeidsplass', 'digitale_verktoy'], core: [] },
      { cites: ['fafo_ledelse'], module: [], core: ['ytring', 'leder'] },
    ],
    variants: {
      picks: [
        ['kunde_og_leveransepress', 'tilgjengelighet', 'laering_og_utvikling'],
        ['ki_og_endring', 'digitale_verktoy', 'fokus_og_avbrytelser'],
        ['jobbtrygghet', 'overvaking_og_tillit', 'ki_og_endring'],
        ['hybrid_samhandling', 'tilhorighet', 'rettferdighet_og_karriere'],
      ],
    },
    proof: ['varmekart', 'tiltak', 'arshjul', 'rapport'],
    faqCount: 9,
    related: [
      { key: 'sporsmal', href: '/kunnskap-og-kontor/sporsmal' },
      { key: 'lovkrav', href: '/lovkrav' },
      { key: 'verneombud', href: '/verneombud' },
      { key: 'smaa', href: '/smaa-bedrifter' },
      { key: 'priser', href: '/priser' },
    ],
    articles: ['krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'anonym-medarbeiderundersokelse'],
    fetched: '2026-10-03',
    sources: [
      { key: 'ssb_aku', url: 'https://www.ssb.no/statbank/table/07203/', year: '2025' },
      { key: 'noa_kontor', url: 'https://noa.stami.no/yrker-og-naeringer/noa/kontorarbeidsplasser/', year: '2022' },
      { key: 'fafo_koble', url: 'https://www.fafo.no/images/pub/2025/20939.pdf', year: '2025' },
      { key: 'stami_varig', url: 'https://stami.no/her-skjedde-ei-varig-endring-etter-pandemien/', year: '2024' },
      {
        key: 'nav_fravaer',
        url: 'https://www.nav.no/no/nav-og-samfunn/statistikk/sykefravar-statistikk/nyheter/okt-sykefravaer-i-forste-halvar',
        year: '2026',
      },
      { key: 'lovdata_aml', url: 'https://lovdata.no/lov/2005-06-17-62', year: '2026' },
      { key: 'lovdata_hjemmekontor', url: 'https://lovdata.no/forskrift/2002-07-05-715', year: '2022' },
      { key: 'lovdata_forskrift', url: 'https://lovdata.no/forskrift/2011-12-06-1357', year: '2026' },
      {
        key: 'at_arsrapport',
        url: 'https://www.arbeidstilsynet.no/globalassets/rapportar/arsrapport/arsrapport-2025/arbeidstilsynets-arsrapport-2025.pdf',
        year: '2026',
      },
      { key: 'fafo_verneombud', url: 'https://www.fafo.no/images/pub/2025/20923.pdf', year: '2025' },
      { key: 'stami_landskap', url: 'https://stami.no/hvordan-pavirker-kontorlandskap-og-hjemmekontor-ansattes-sykefravaer/', year: '2026' },
      { key: 'fafo_abw', url: 'https://www.fafo.no/images/pub/2025/20951.pdf', year: '2025' },
      {
        key: 'abelia_hr',
        url: 'https://www.abelia.no/nyheter/2023/november/rask-teknologisk-utvikling-utfordrer-ogsa-fremtidsrettede-arbeidsgivere/',
        year: '2023',
      },
      { key: 'stami_hjemmekontor', url: 'https://stami.no/ny-kunnskap-om-hjemmekontor-arbeidsmiljo-og-helse/', year: '2024' },
      { key: 'noa_finans', url: 'https://noa.stami.no/yrker-og-naeringer/noa/bank-finans-forsikring/', year: '2022' },
      {
        key: 'ssb_ki',
        url: 'https://www.ssb.no/teknologi-og-innovasjon/informasjons-og-kommunikasjonsteknologi-ikt/statistikk/bruk-av-ikt-i-naeringslivet/artikler/bruken-av-ki-i-naeringslivet-akselererer',
        year: '2026',
      },
      { key: 'at_hjemmekontor', url: 'https://www.arbeidstilsynet.no/lonn-og-ansettelse/ansettelse/heimekontor', year: '2026' },
      { key: 'fafo_ledelse', url: 'https://www.fafo.no/images/pub/2025/Ledelsesbarometeret_hjemmekontor_og_fjernledelse.pdf', year: '2025' },
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
