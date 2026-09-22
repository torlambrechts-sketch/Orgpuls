import { HjelpScreen, type HjelpView } from '@/components/hjelp/HjelpScreen'
import { getTranslations } from 'next-intl/server'
import { HELP_CATEGORIES, visibleArticles } from '@/lib/help/articles'
import { getCompany } from '@/lib/settings/read'

/**
 * Hjelp — the data half. Bundle lines 1057-1142.
 *
 * The only thing read from the database is `law_mode`, which decides whether the three
 * articles about the statutory framing are in the index. Everything else is the registry
 * and the message catalogue, which is what makes an article a row rather than a component.
 */
export const dynamic = 'force-dynamic'

export default async function HjelpPage() {
  const t = await getTranslations()
  const company = await getCompany()
  const articles = visibleArticles(company?.law_mode ?? true)

  const view: HjelpView = {
    articles: articles.map((a) => ({
      key: a.key,
      category: a.category,
      categoryLabel: t(`hjelp.category.${a.category}`),
      title: t(`hjelp.article.${a.key}.title`),
      lead: t(`hjelp.article.${a.key}.lead`),
      read: a.read,
    })),
    // only the categories that actually have an article in this organisation's index
    categories: HELP_CATEGORIES.filter((c) => articles.some((a) => a.category === c)).map((c) => ({
      key: c,
      label: t(`hjelp.category.${c}`),
    })),
  }

  return <HjelpScreen view={view} />
}
