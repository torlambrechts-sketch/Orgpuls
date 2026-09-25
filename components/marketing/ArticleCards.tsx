import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { articleBySlug } from '@/lib/marketing/site'
import { cardColumns } from './Blocks'

/** Cards linking to articles, by slug: the article's title and lead, across the whole width. */
export async function ArticleCards({ slugs }: { slugs: string[] }) {
  const t = await getTranslations()
  const items = slugs.map(articleBySlug).filter((a) => a !== null)
  return (
    <div className={`mt-8 grid gap-6 ${cardColumns(items.length)}`}>
      {items.map((a) => (
        <Link
          key={a.slug}
          href={`/artikler/${a.slug}` as Route}
          className="group flex flex-col gap-2 rounded-note border border-line bg-bg p-6 text-ink no-underline hover:border-ink hover:text-ink hover:no-underline"
        >
          <span className="text-mk-h3 font-bold [text-wrap:pretty] group-hover:underline">{t(`seo.articles.${a.key}.h1`)}</span>
          <span className="text-mk-card text-mut [text-wrap:pretty]">{t(`seo.articles.${a.key}.description`)}</span>
          <span className="mt-auto pt-2 text-mk-small font-bold text-link">{t('seo.common.readArticle')}</span>
        </Link>
      ))}
    </div>
  )
}
