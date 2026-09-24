import type { Route } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { Blocks as BlocksSchema, wordCount } from '@/lib/marketing/blocks'
import { article as articleLd, breadcrumbs, graph, organization } from '@/lib/marketing/schema'
import { landingKey, type Article } from '@/lib/marketing/site'
import { ArticleCards } from './ArticleCards'
import { Blocks } from './Blocks'
import { CtaBand } from './CtaBand'
import { JsonLd } from './JsonLd'

const Sources = z.array(z.object({ label: z.string(), url: z.string().url() }))

/** Words a minute for Norwegian non-fiction read on a screen; rounded up, never below 1. */
const WPM = 200

/**
 * An article: the answer first, the argument in the blocks, what the law says quoted and
 * cited to the page it came from, and a way on — to the landing page that answers "and how
 * do we do that", and to two neighbouring articles.
 */
export async function ArticleView({ article: a }: { article: Article }) {
  const t = await getTranslations()
  const locale = await getLocale()
  const k = `seo.articles.${a.key}`
  const blocks = BlocksSchema.parse(t.raw(`${k}.blocks`))
  const sources = Sources.parse(t.raw(`${k}.sources`))
  const words = wordCount(blocks)
  const minutes = Math.max(1, Math.ceil(words / WPM))
  const path = `/artikler/${a.slug}`
  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Oslo',
  }).format(new Date(`${a.modified}T12:00:00Z`))
  const lk = `seo.lp.${landingKey(a.landing)}`

  return (
    <article className="animate-entry">
      <JsonLd
        data={graph(
          organization(),
          articleLd({
            path,
            headline: t(`${k}.h1`),
            description: t(`${k}.description`),
            published: a.published,
            modified: a.modified,
            words,
          }),
          breadcrumbs([
            { name: t('seo.common.home'), path: '/' },
            { name: t('seo.index.crumb'), path: '/artikler' },
            { name: t(`${k}.h1`), path },
          ]),
        )}
      />

      <header className="mx-auto max-w-[1120px] px-[26px] pt-[54px]">
        <nav aria-label={t('seo.common.breadcrumb')} className="text-[12.5px] text-mut">
          <Link href="/">{t('seo.common.home')}</Link>
          <span aria-hidden="true"> / </span>
          <Link href={'/artikler' as Route}>{t('seo.index.crumb')}</Link>
        </nav>
        <h1 className="mt-[18px] max-w-[24ch] font-display text-[clamp(27px,4.6vw,46px)] font-semibold leading-[1.1] [overflow-wrap:break-word] [hyphens:auto] [text-wrap:balance]">
          {t(`${k}.h1`)}
        </h1>
        <p className="mt-[16px] max-w-[62ch] text-[17.5px] leading-[1.65] text-body [text-wrap:pretty]">{t(`${k}.lead`)}</p>
        <p className="mt-[14px] text-[12.5px] text-mut">{t('seo.common.byline', { date, minutes })}</p>
      </header>

      <div className="mx-auto max-w-[1120px] px-[26px] pt-[22px]">
        <Blocks blocks={blocks} />

        <aside className="mt-[34px] max-w-[72ch] rounded-note border border-line bg-sf px-[23px] py-[20px]">
          <span className="block text-[15.5px] font-bold">{t('seo.common.nextTitle')}</span>
          <span className="mt-[7px] block text-[14.5px] leading-[1.65] text-body">
            {t(`${lk}.description`)}{' '}
            <Link href={`/${a.landing}` as Route} className="font-semibold">
              {t('seo.common.nextLink', { page: t(`${lk}.crumb`) })}
            </Link>
          </span>
        </aside>

        <section className="mt-[34px] max-w-[72ch]" aria-labelledby="kilder">
          <h2 id="kilder" className="text-[13px] font-bold uppercase tracking-[0.1em] text-mut">
            {t('seo.common.sources')}
          </h2>
          <ul className="mt-[10px] flex list-disc flex-col gap-[5px] pl-[20px] text-[14px] leading-[1.55]">
            {sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-[12px] text-[12.5px] leading-[1.6] text-mut [text-wrap:pretty]">{t('seo.common.disclaimer')}</p>
        </section>
      </div>

      <div className="mx-auto max-w-[1120px] px-[26px] pt-[54px]">
        <span className="block text-[11px] uppercase tracking-[0.12em] text-mut">{t('seo.common.readMore')}</span>
        <ArticleCards slugs={a.related} />
      </div>

      <CtaBand title={t(`${k}.ctaTitle`)} body={t(`${k}.ctaBody`)} />
    </article>
  )
}
