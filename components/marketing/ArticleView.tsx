import type { Route } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { Blocks as BlocksSchema, wordCount, type Block } from '@/lib/marketing/blocks'
import { article as articleLd, breadcrumbs, graph, organization } from '@/lib/marketing/schema'
import { landingKey, type Article, articleImage } from '@/lib/marketing/site'
import { ArticleCards } from './ArticleCards'
import { Blocks } from './Blocks'
import { CtaBand } from './CtaBand'
import { JsonLd } from './JsonLd'

export const Sources = z.array(z.object({ label: z.string(), url: z.string().url() }))

/** Words a minute for Norwegian non-fiction read on a screen; rounded up, never below 1. */
const WPM = 200

/**
 * An article: the answer first, the argument in the blocks, what the law says quoted and
 * cited to the page it came from, and a way on — to the landing page that answers "and how
 * do we do that", and to two neighbouring articles.
 */
export async function ArticleView({ article: a }: { article: Article }) {
  const t = await getTranslations()
  const k = `seo.articles.${a.key}`
  const lk = `seo.lp.${landingKey(a.landing)}`
  return (
    <ArticleBody
      content={{
        h1: t(`${k}.h1`),
        description: t(`${k}.description`),
        lead: t(`${k}.lead`),
        blocks: BlocksSchema.parse(t.raw(`${k}.blocks`)),
        sources: Sources.parse(t.raw(`${k}.sources`)),
        ctaTitle: t(`${k}.ctaTitle`),
        ctaBody: t(`${k}.ctaBody`),
      }}
      path={`/artikler/${a.slug}`}
      published={a.published}
      modified={a.modified}
      image={articleImage(a.slug)}
      next={{ text: t(`${lk}.description`), href: `/${a.landing}`, page: t(`${lk}.crumb`) }}
      related={a.related}
    />
  )
}

export type ArticleContent = {
  h1: string
  description: string
  lead: string
  blocks: Block[]
  sources: { label: string; url: string }[]
  ctaTitle: string
  ctaBody: string
}

/**
 * An article from its words, wherever they come from: the articles in code (ArticleView) or one
 * written in the CMS (X-094). `next` is the landing page that answers «how do we do that»; an
 * article without one has no such box, and one without sources no sources section.
 */
export async function ArticleBody({
  content: c,
  path,
  published,
  modified,
  image,
  next,
  related,
}: {
  content: ArticleContent
  path: string
  published: string
  modified: string
  image?: string
  next: { text: string; href: string; page: string } | null
  related: string[]
}) {
  const t = await getTranslations()
  const locale = await getLocale()
  const blocks = c.blocks
  const sources = c.sources
  const words = wordCount(blocks)
  const minutes = Math.max(1, Math.ceil(words / WPM))
  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Oslo',
  }).format(new Date(`${modified.slice(0, 10)}T12:00:00Z`))

  return (
    <article>
      <JsonLd
        data={graph(
          organization(),
          articleLd({
            path,
            headline: c.h1,
            description: c.description,
            published,
            modified,
            words,
            image,
            locale,
          }),
          breadcrumbs([
            { name: t('seo.common.home'), path: '/' },
            { name: t('seo.index.crumb'), path: '/artikler' },
            { name: c.h1, path },
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
          {c.h1}
        </h1>
        <p className="mt-[16px] max-w-[62ch] text-[17.5px] leading-[1.65] text-body [text-wrap:pretty]">{c.lead}</p>
        <p className="mt-[14px] text-[12.5px] text-mut">{t('seo.common.byline', { date, minutes })}</p>
      </header>

      <div className="mx-auto max-w-[1120px] px-[26px] pt-[22px]">
        <Blocks blocks={blocks} />

        {next ? (
          <aside className="mt-[34px] max-w-[72ch] rounded-note border border-line bg-sf px-[23px] py-[20px]">
            <span className="block text-[15.5px] font-bold">{t('seo.common.nextTitle')}</span>
            <span className="mt-[7px] block text-[14.5px] leading-[1.65] text-body">
              {next.text}{' '}
              <Link href={next.href as Route} className="font-semibold">
                {t('seo.common.nextLink', { page: next.page })}
              </Link>
            </span>
          </aside>
        ) : null}

        {sources.length ? (
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
        ) : null}
      </div>

      <div className="mx-auto max-w-[1120px] px-[26px] pt-[54px]">
        <span className="block text-[11px] uppercase tracking-[0.12em] text-mut">{t('seo.common.readMore')}</span>
        <ArticleCards slugs={related} />
      </div>

      <CtaBand title={c.ctaTitle} body={c.ctaBody} />
    </article>
  )
}
