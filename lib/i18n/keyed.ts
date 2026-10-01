/**
 * The keys mode (X-090): every message prefixed with its own path between ⟪ ⟫, so a rendered page
 * says which strings it shows and in what order. scripts/i18n/page-map.mjs crawls the public site
 * in this mode and writes lib/i18n/site-pages.json, the page map admin › Translations reviews by.
 *
 * With ORGPULS_I18N_KEYS=1, on the QA stack only; ignored on a Vercel production deployment. The
 * markers sit outside any ICU argument, so every message still parses. Without the variable this
 * returns `messages` itself.
 */
export const KEY_OPEN = '⟪'
export const KEY_CLOSE = '⟫'

type Tree = { [k: string]: unknown }

/**
 * A value the site's content blocks read as data, not as words (lib/marketing/blocks.ts): a
 * block's kind, an internal link, a picture's id, an industry's slug, a source's address. Each
 * sits in an array element. Never marked, and not a text to review or translate.
 *
 * `t` is a kind only in a `blocks` array. Elsewhere it is a card's title («Daglig leder», a
 * teaser's heading), which the page map missed while every `.N.t` counted as data (D-188).
 */
export const isStructuralPath = (path: string) => /\.blocks\.\d+\.t$|\.\d+\.(id|href|slug|url)$/.test(path)

function mark(value: unknown, path: string): unknown {
  if (typeof value === 'string') return isStructuralPath(path) ? value : `${KEY_OPEN}${path}${KEY_CLOSE}${value}`
  if (Array.isArray(value)) return value.map((v, i) => mark(v, `${path}.${i}`))
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value as Tree).map(([k, v]) => [k, mark(v, path ? `${path}.${k}` : k)]))
  return value
}

export function keyedMessages<T>(locale: string, messages: T): T {
  if (process.env.ORGPULS_I18N_KEYS !== '1' || process.env.VERCEL_ENV === 'production' || locale !== 'no') return messages
  return mark(messages, '') as T
}
