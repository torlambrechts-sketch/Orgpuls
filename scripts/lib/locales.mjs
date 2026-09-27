import { readFileSync } from 'node:fs'

/**
 * The locale registry (lib/i18n/locales.ts) for the plain-Node scripts, which cannot import
 * TypeScript: each entry's fields read from the source, so the scripts and the app cannot
 * disagree about which languages exist.
 */
export function localeRegistry() {
  const src = readFileSync(new URL('../../lib/i18n/locales.ts', import.meta.url), 'utf8')
  const body = src.match(/LOCALE_REGISTRY = \[([\s\S]*?)\] as const/)?.[1]
  if (!body) throw new Error('lib/i18n/locales.ts changed shape; update scripts/lib/locales.mjs')
  return [...body.matchAll(/\{([^}]*)\}/g)].map(([, e]) => ({
    code: e.match(/code: '([^']+)'/)?.[1],
    bcp47: e.match(/bcp47: '([^']+)'/)?.[1],
    platform: /platform: true/.test(e),
    survey: /survey: true/.test(e),
  }))
}
