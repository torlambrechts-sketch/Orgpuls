/**
 * The help centre's index.
 *
 * A registry, not a table. Articles are product copy — the same class of thing as every
 * other string on every other screen — so they live in `/messages` under `hjelp.article.*`
 * and this file holds only what the *index* needs to sort and filter by: a key, a
 * category and a reading time. Adding an article is a row here and a message key, which
 * is the same shape as adding a factor or an option.
 *
 * `lawOnly` mirrors the design's own rule: three of these exist to explain the statutory
 * framing, and an organisation that has switched that framing off has no use for them.
 * It is read from `organizations.law_mode`, the column migration 0021 added and that
 * nothing else in the schema consults.
 */
export const HELP_CATEGORIES = [
  'start',
  'malinger',
  'resultater',
  'anonymitet',
  'regelverk',
  'oppsett',
] as const

export type HelpCategory = (typeof HELP_CATEGORIES)[number]

export interface HelpArticle {
  key: string
  category: HelpCategory
  /** minutes, printed as "4 min" — the design's own figures */
  read: number
  lawOnly?: boolean
}

export const HELP_ARTICLES: HelpArticle[] = [
  { key: 'forsteTimen', category: 'start', read: 6 },
  { key: 'ansatteUtenHr', category: 'start', read: 4 },
  { key: 'velgTerskel', category: 'start', read: 3 },
  { key: 'grunnlinjeEllerPuls', category: 'malinger', read: 4 },
  { key: 'settOppArshjulet', category: 'malinger', read: 5 },
  { key: 'egneSporsmal', category: 'malinger', read: 3 },
  { key: 'svarprosent', category: 'malinger', read: 5 },
  { key: 'lesIndeksen', category: 'resultater', read: 6 },
  { key: 'strekIStedet', category: 'resultater', read: 3 },
  { key: 'funnTilTiltak', category: 'resultater', read: 7 },
  { key: 'hvaVilagrer', category: 'anonymitet', read: 4 },
  { key: 'svarPaKommentar', category: 'anonymitet', read: 4 },
  { key: 'gdpr', category: 'anonymitet', read: 6 },
  { key: 'hvaLovenKrever', category: 'regelverk', read: 8, lawOnly: true },
  { key: 'kontrolltiltak', category: 'regelverk', read: 5, lawOnly: true },
  { key: 'rapportTilTilsynet', category: 'regelverk', read: 4, lawOnly: true },
  { key: 'rollerOgTilgang', category: 'oppsett', read: 5 },
  { key: 'entra', category: 'oppsett', read: 5 },
  { key: 'sms', category: 'oppsett', read: 4 },
]

export const articleByKey = (key: string): HelpArticle | null =>
  HELP_ARTICLES.find((a) => a.key === key) ?? null

/** The articles this organisation should see, in the order the index prints them. */
export function visibleArticles(lawMode: boolean): HelpArticle[] {
  return HELP_ARTICLES.filter((a) => lawMode || !a.lawOnly)
}
