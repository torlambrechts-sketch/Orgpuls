import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ButtonLink } from '@/components/ui/Button'
import { articleByKey, visibleArticles } from '@/lib/help/articles'
import { getCompany } from '@/lib/settings/read'

/**
 * One article.
 *
 * The body is four paragraphs in the message catalogue, read by key. A key that is not in
 * the registry is a 404 rather than an empty page, and an article the organisation should
 * not see — the statutory ones with law mode off — is a 404 for the same reason: it is not
 * in their index, so a link to it did not come from this product.
 */
export const dynamic = 'force-dynamic'

const PARAGRAPHS = ['p1', 'p2', 'p3', 'p4'] as const

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ artikkel: string }>
}) {
  const { artikkel } = await params
  const article = articleByKey(artikkel)
  if (!article) notFound()

  const company = await getCompany()
  if (!visibleArticles(company?.law_mode ?? true).some((a) => a.key === article.key)) notFound()

  const t = await getTranslations()

  return (
    <main className="animate-entry mx-auto max-w-[1180px] px-[16px] md:px-[28px] pb-[60px] pt-[26px]">
      <ButtonLink href="/hjelp" size="xxs" tone="ghost">
        {t('hjelp.articleBack')}
      </ButtonLink>

      <article className="mt-[16px] max-w-[680px]">
        <div className="flex flex-wrap items-baseline gap-[12px]">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-mut">
            {t(`hjelp.category.${article.category}`)}
          </span>
          <span className="text-[11.5px] text-mut">
            {t('hjelp.readMinutes', { count: article.read })}
          </span>
        </div>

        <h1 className="mt-[8px] font-display text-[34px] font-semibold leading-[1.1]">
          {t(`hjelp.article.${article.key}.title`)}
        </h1>
        <p className="mt-[9px] text-[14.5px] leading-[1.6] text-mut [text-wrap:pretty]">
          {t(`hjelp.article.${article.key}.lead`)}
        </p>

        <div className="mt-[22px] flex flex-col gap-[16px]">
          {PARAGRAPHS.map((p) => (
            <p key={p} className="m-0 text-[15px] leading-[1.7] text-body [text-wrap:pretty]">
              {t(`hjelp.article.${article.key}.body.${p}`)}
            </p>
          ))}
        </div>
      </article>
    </main>
  )
}
