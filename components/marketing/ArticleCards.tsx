import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { articleBySlug } from '@/lib/marketing/site'

/** Cards linking to articles, by slug: the article's title and lead, as the index shows them. */
export async function ArticleCards({ slugs }: { slugs: string[] }) {
  const t = await getTranslations()
  const items = slugs.map(articleBySlug).filter((a) => a !== null)
  return (
    <div className="mt-[18px] grid gap-[13px] [grid-template-columns:repeat(auto-fit,minmax(min(262px,100%),1fr))]">
      {items.map((a) => (
        <Link
          key={a.slug}
          href={`/artikler/${a.slug}` as Route}
          className="group flex flex-col gap-[8px] rounded-note border border-line bg-sf px-[23px] py-[22px] text-ink no-underline hover:border-ink hover:text-ink hover:no-underline"
        >
          <span className="text-[15.5px] font-bold leading-[1.35] [text-wrap:pretty] group-hover:underline">
            {t(`seo.articles.${a.key}.h1`)}
          </span>
          <span className="text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">
            {t(`seo.articles.${a.key}.description`)}
          </span>
          <span className="mt-auto pt-[6px] text-[12.5px] font-bold text-link">{t('seo.common.readArticle')}</span>
        </Link>
      ))}
    </div>
  )
}
