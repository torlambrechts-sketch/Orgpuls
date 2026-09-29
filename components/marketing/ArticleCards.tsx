import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { articleBySlug } from '@/lib/marketing/site'

/**
 * Cards linking to articles, by slug: the article's title and lead, as the index shows them. The
 * CMS's articles (X-094) arrive with their words, as `written`, and come first: they are the newest.
 */
export async function ArticleCards({ slugs, written = [] }: { slugs: string[]; written?: { slug: string; h1: string; description: string }[] }) {
  const t = await getTranslations()
  const items = [
    ...written.map((w) => ({ slug: w.slug, h1: w.h1, description: w.description })),
    ...slugs
      .map(articleBySlug)
      .filter((a) => a !== null)
      .map((a) => ({ slug: a.slug, h1: t(`seo.articles.${a.key}.h1`), description: t(`seo.articles.${a.key}.description`) })),
  ]
  return (
    <div className="mt-[18px] grid gap-[13px] [grid-template-columns:repeat(auto-fit,minmax(min(262px,100%),1fr))]">
      {items.map((a) => (
        <Link
          key={a.slug}
          href={`/artikler/${a.slug}` as Route}
          className="group flex flex-col gap-[8px] rounded-note border border-line bg-sf px-[23px] py-[22px] text-ink no-underline hover:border-ink hover:text-ink hover:no-underline"
        >
          <span className="text-[15.5px] font-bold leading-[1.35] [text-wrap:pretty] group-hover:underline">
            {a.h1}
          </span>
          <span className="text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">
            {a.description}
          </span>
          <span className="mt-auto pt-[6px] text-[12.5px] font-bold text-link">{t('seo.common.readArticle')}</span>
        </Link>
      ))}
    </div>
  )
}
