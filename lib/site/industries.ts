import { getLocale } from 'next-intl/server'
import { hasPublicPage, INDUSTRIES, pageIn } from '@/content/industries'

/**
 * Bransjer's pages (D-129) for the header's disclosure and the footer's Bransjer column: every
 * industry in the registry whose address shows a page in the site's language, by its name in that
 * language, in the registry's order. Each address is a whole page either way — the industry page
 * once launched, its landing page before.
 */
export async function industryLinks(): Promise<{ href: string; label: string }[]> {
  const lang = (await getLocale()) === 'en' ? 'en' : 'no'
  return INDUSTRIES.flatMap((i) => {
    if (!hasPublicPage(i, lang)) return []
    const label = (pageIn(i, lang) ?? pageIn(i, 'no'))?.navLabel
    return label ? [{ href: `/${i.slug}`, label }] : []
  })
}
