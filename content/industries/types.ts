/**
 * An industry page, as data (bransjesider-og-tilleggsmoduler.md § B2). The words are the
 * page's own, in bokmål, written for the Norwegian site; every statement it quotes is read
 * from the module file by its code, or from the core instrument's messages, and the build
 * fails if one is missing (content/industries/validate.ts).
 */
export type CiteKey = string // a key in the module file's `sources`, or in `extraSources`

export type MeasuredBy =
  | { kind: 'module'; itemCode: string }
  /** `alongside`: the factor's other statements the box names too ("Sammen med «…» og «…»") */
  | { kind: 'core'; factorKey: string; ordinal: number; alongside?: number[] }

export type ResultPreview = {
  /** always a fictional company, and the footnote says so */
  company: string
  caption: string
  columns: string[]
  /** a row behind a flag (an example that shows a factor switched off needs `module_factor_toggles`) */
  rows: { factorKey: string; values: (number | null)[]; featureFlag?: string }[]
  /** a sentence of the footnote that describes a flagged feature, printed first and only when it is on */
  footnoteFlagged?: { text: string; featureFlag: string }
  footnote: string
}

export type IndustryPage = {
  slug: 'bygg-og-anlegg' | 'helse-og-omsorg'
  navLabel: string
  /**
   * Live on the public site. Until then the address keeps its current landing page and this
   * one is shown only with ?forhandsvis=1, marked noindex: the page describes a module, and a
   * page may only claim what is shipped (§ 0.7). Launching needs every `law` item reviewed.
   */
  launched: boolean
  module?: { key: string; version: string }
  /** how the page names its module: "Bygg-modulen" at the start of a sentence, "bygg-modulen" inside one */
  moduleName?: { title: string; inline: string }
  seo: { title: string; description: string }
  hero: {
    pill: string
    /** use ­, a soft hyphen, in long compounds */
    h1: string
    lead: string
    thresholdNote: string
    preview?: ResultPreview
  }
  /** `text` may carry {{cite:key}} tokens */
  challengesIntro?: { title: string; text: string }
  challenges: {
    title: string
    /** plain text with {{cite:key}} tokens */
    body: string
    measuredBy: MeasuredBy
    helpline?: boolean
    featureFlag?: string
  }[]
  /** `coreAlso` continues the sentence naming the core factors: "…, og {coreAlso}." */
  moduleOverview?: { title: string; intro: string; coreAlso?: string; coreNote: string }
  loop?: {
    title: string
    steps: { title: string; text: string }[]
    example: { factorKey: string; actionType: 'workshop' | 'rutine' | 'lederpraksis'; groupLabel: string; chips: string[]; on: number }
  }
  law: { title: string; intro: string; items: { ref: string; text: string; reviewed: boolean }[] }
  /** `more`: a last sentence of the answer that describes a flagged feature */
  faq: { q: string; a: string; featureFlag?: string; more?: { text: string; featureFlag: string } }[]
  cta: { title: string; text: string }
  /** /<slug>/sporsmal, generated from the module file; its own words only */
  questionPage?: {
    crumb: string
    h1: string
    lead: string
    scaleNote: string
    countTitle: string
    countIntro: string
    segmentsTitle: string
    segmentsIntro: string
    rulesTitle: string
    rules: { title: string; text: string; featureFlag?: string }[]
    coreNote: string
    cta: { title: string; text: string }
  }
  related: IndustryPage['slug'][]
  /** list the module's other factor sources after the page's own citations (default true) */
  sourcesFromFactors?: boolean
  extraSources?: { key: string; title: string; url: string }[]
}
