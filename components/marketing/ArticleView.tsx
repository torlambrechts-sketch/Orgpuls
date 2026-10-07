import type { Route } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { Blocks as BlocksSchema, wordCount, type Block } from '@/lib/marketing/blocks'
import { article as articleLd, breadcrumbs, graph, organization } from '@/lib/marketing/schema'
import { type Article, articleImage } from '@/lib/marketing/site'
import { TemplateTeaser } from './TemplateTeaser'
import { ArticleCards } from './ArticleCards'
import { Blocks } from './Blocks'
import { JsonLd } from './JsonLd'
import { WithAside } from './WithAside'
import { ArticleArt, FactorArt, type ArtKind } from './art/ArticleArt'

export const Sources = z.array(z.object({ label: z.string(), url: z.string().url() }))

/** Words a minute for Norwegian non-fiction read on a screen; rounded up, never below 1. */
const WPM = 200

/**
 * An article: the answer first, the argument in the blocks, what the law says quoted and
 * cited to the page it came from, and two neighbouring articles. Informational only (D-235):
 * no offer beside or under the text, no box pointing to a sales page – the site's header and
 * footer are the way to the product. The one box at the foot is the free template that goes with
 * the article (D-243): a resource for the reader, named for what it is.
 */
export async function ArticleView({ article: a }: { article: Article }) {
  const t = await getTranslations()
  const k = `seo.articles.${a.key}`
  return (
    <ArticleBody
      content={{
        h1: t(`${k}.h1`),
        description: t(`${k}.description`),
        lead: t(`${k}.lead`),
        blocks: BlocksSchema.parse(t.raw(`${k}.blocks`)),
        sources: Sources.parse(t.raw(`${k}.sources`)),
      }}
      path={`/artikler/${a.slug}`}
      published={a.published}
      modified={a.modified}
      image={articleImage(a.slug)}
      art={artFor(a.art, t)}
      related={a.related}
      template={a.template}
    />
  )
}

/** The picture beside an article's title (D-237): a drawing by kind, or a factor's own statements. */
function artFor(art: string, t: Awaited<ReturnType<typeof getTranslations>>): React.ReactNode {
  const cls = 'h-auto w-full max-w-[400px]'
  if (art.startsWith('factor:')) {
    const f = `factor.${art.slice('factor:'.length)}`
    return <FactorArt label={t(`${f}.label`)} statements={[1, 2, 3].map((n) => t(`${f}.s${n}`))} className={cls} />
  }
  return <ArticleArt kind={art as ArtKind} className={cls} />
}

export type ArticleContent = {
  h1: string
  description: string
  lead: string
  blocks: Block[]
  sources: { label: string; url: string }[]
}

/**
 * An article from its words, wherever they come from: the articles in code (ArticleView) or one
 * written in the CMS (X-094). An article without sources has no sources section.
 */
export async function ArticleBody({
  content: c,
  path,
  published,
  modified,
  image,
  art,
  related,
  template,
}: {
  content: ArticleContent
  path: string
  published: string
  modified: string
  image?: string
  /** a drawn picture beside the title, on wide screens (D-237) */
  art?: React.ReactNode
  related: string[]
  /** the free template that goes with the article, at its foot (D-243) */
  template?: string
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
            sources,
          }),
          breadcrumbs([
            { name: t('seo.common.home'), path: '/' },
            { name: t('seo.index.crumb'), path: '/artikler' },
            { name: c.h1, path },
          ]),
        )}
      />

      <header className="mx-auto grid max-w-[1120px] items-center gap-[36px] px-[26px] pt-[54px] lg:[grid-template-columns:minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="min-w-0">
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
        </div>
        {art ? (
          <div aria-hidden="true" className="hidden min-w-0 justify-center lg:flex">
            {art}
          </div>
        ) : null}
      </header>

      <div className="mx-auto max-w-[1120px] px-[26px] pt-[22px]">
        <WithAside blocks={blocks}>
          {template ? <TemplateTeaser slug={template} className="mt-[34px]" /> : null}
          {sources.length ? (
            <section className="mt-[34px]" aria-labelledby="kilder">
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
        </WithAside>
      </div>

      <div className="mx-auto max-w-[1120px] px-[26px] pb-[72px] pt-[54px]">
        <span className="block text-[11px] uppercase tracking-[0.12em] text-mut">{t('seo.common.readMore')}</span>
        <ArticleCards slugs={related} />
      </div>
    </article>
  )
}
