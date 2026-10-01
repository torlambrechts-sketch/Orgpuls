import { describe, expect, it } from 'vitest'
import { INDUSTRIES } from '@/content/industries'
import en from '@/messages/en.json'
import no from '@/messages/no.json'

/**
 * A meta description over about 155 characters is cut off in Google's results (D-189). Every
 * page's description, in both languages: the message files' and the industry pages' own.
 */
const LIMIT = 155

function descriptions(): [string, string][] {
  const out: [string, string][] = []
  const walk = (v: unknown, path: string, lang: string) => {
    if (typeof v === 'string') {
      if (/^seo\..*\.description$|\.seoDescription$/.test(path)) out.push([`${lang}:${path}`, v])
    } else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k, lang)
  }
  walk(no, '', 'no')
  walk(en, '', 'en')
  for (const i of INDUSTRIES)
    for (const [lang, page] of [['no', i.page], ['en', i.pageEn]] as const)
      if (page) out.push([`${lang}:${i.slug}.seo.description`, page.seo.description])
  return out
}

describe('SEO descriptions', () => {
  it('finds the descriptions it checks', () => {
    expect(descriptions().length).toBeGreaterThan(40)
  })

  it('are at most 155 characters, so Google shows them whole', () => {
    const over = descriptions()
      .map(([k, v]) => [k, [...v].length] as const)
      .filter(([, n]) => n > LIMIT)
    expect(over).toEqual([])
  })
})
