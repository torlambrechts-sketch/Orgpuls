import 'server-only'
import { getTranslations } from 'next-intl/server'
import type { CmsLocale } from '@/lib/cms/content'
import type { DesignedPage } from '@/lib/cms/designed'

/**
 * A designed page's title and description as a reader gets them now, in each language (X-094):
 * the messages with the admin's approved overrides applied, as the page's own generateMetadata
 * reads them, or an industry page's content file. Null where the page has none in that language.
 */
export type DesignedMeta = Record<CmsLocale, { title: string; description: string } | null>

export async function catalogues() {
  const [no, en] = await Promise.all([getTranslations({ locale: 'no' }), getTranslations({ locale: 'en' })])
  return { no, en }
}
type Catalogues = Awaited<ReturnType<typeof catalogues>>

export function designedMeta(p: DesignedPage, t: Catalogues): DesignedMeta {
  if (p.industry) return p.industry
  const one = (lang: CmsLocale) => {
    const tr = t[lang]
    if (!p.title || !p.description || !tr.has(p.title) || !tr.has(p.description)) return null
    return { title: `${tr(p.title)}${p.suffix ?? ''}`, description: tr(p.description) }
  }
  return { no: one('no'), en: one('en') }
}
