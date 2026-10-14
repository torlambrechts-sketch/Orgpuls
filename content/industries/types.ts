/**
 * What an industry still needs besides its landing page (content/industries/landing.ts, D-207):
 * its name in the menu, whether it is live in a language, its module, and the question page
 * (/<slug>/sporsmal), whose own words are here and whose statements are the module file's. The
 * industry page itself is the landing template and its messages (`site.bransje.<msg>`); the older
 * template and the words only it drew are gone (D-213).
 */
export type IndustryPage = {
  slug: 'bygg-og-anlegg' | 'helse-og-omsorg' | 'barnehage-og-skole' | 'kunnskap-og-kontor' | 'handel'
  navLabel: string
  /**
   * Live on the public site in this language: the menu, the cards, the sitemap and the question
   * page follow it. It is the landing registry's `live` for the same language (a unit test holds
   * the two together); before launch the question page is shown only with ?forhandsvis=1, noindex.
   */
  launched: boolean
  module?: { key: string }
  /** how the question page's pill names the module ("Bygg-modulen"); default: the module file's name */
  moduleName?: string
  /** /<slug>/sporsmal, generated from the module file; its own words only */
  questionPage?: {
    crumb: string
    /** the page's <title> and meta description, written for search (under ~60 and 160 characters) */
    metaTitle: string
    metaDescription: string
    h1: string
    lead: string
    scaleNote: string
    countTitle: string
    countIntro: string
    segmentsTitle: string
    segmentsIntro: string
    rulesTitle: string
    rules: { title: string; text: string; featureFlag?: string }[]
    /**
     * sections of the page's own after the factors (D-284): a question a factor raises that the module file
     * does not answer – the language requirement on building sites – with an anchor a search can land on
     */
    sections?: { id: string; title: string; paragraphs: string[]; source?: { label: string; url: string } }[]
    coreNote: string
    cta: { title: string; text: string }
  }
  /**
   * The start page's and /bransjer's card (innstillinger-og-forside.md § 6): «Ny» until this ISO date,
   * set to 90 days after the page is launched. The build refuses a date that is not one.
   */
  card?: { newUntil?: string }
  /**
   * The law block the older industry template printed until the landing template replaced it
   * (D-207–D-212). Published nowhere since; kept because the legal review lists every item as an
   * approved, unpublished record (lib/legal/registry.ts), and dropping it would drop that history (D-213).
   */
  law?: { title: string; intro: string; items: { ref: string; text: string; reviewed: boolean }[] }
}
