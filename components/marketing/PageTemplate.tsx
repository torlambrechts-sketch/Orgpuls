import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Faq } from '@/components/start/Faq'
import { Blocks as BlocksSchema, FaqItems } from '@/lib/marketing/blocks'
import { breadcrumbs, faqPage, graph, organization } from '@/lib/marketing/schema'
import { absolute } from '@/lib/marketing/site'
import { ArticleCards } from './ArticleCards'
import { Blocks } from './Blocks'
import { CtaBand } from './CtaBand'
import { JsonLd } from './JsonLd'

/**
 * A public page: a hero whose H1 answers the reader's question, the page's blocks, its
 * questions if it has any, articles for the reader who wants more, and the start page's
 * closing offer. Landing pages, Plattform, Priser, Om oss and the rest are all this one
 * shape, with their words in `messages` under the key given (`seo.lp.*`, `seo.pages.*`).
 *
 * The hero keeps the start page's type, pill and buttons. Optional parts are read only when
 * the page's messages carry them: a second action (`tip`), `faq`, `cta`, the closing words.
 */
export async function PageTemplate({
  k,
  path,
  parent,
  articles,
  schemaType = 'WebPage',
  extraSchema = [],
}: {
  /** the page's message key, e.g. `seo.pages.plattform` */
  k: string
  path: string
  /** a section the page sits under, for the breadcrumb: Bruksområder for a use case */
  parent?: { name: string; path: string }
  articles?: string[]
  schemaType?: 'WebPage' | 'AboutPage' | 'ContactPage' | 'CollectionPage'
  extraSchema?: Record<string, unknown>[]
}) {
  const t = await getTranslations()
  const blocks = BlocksSchema.parse(t.raw(`${k}.blocks`))
  const faq = t.has(`${k}.faq`) ? FaqItems.parse(t.raw(`${k}.faq`)) : []
  const tip = t.has(`${k}.tip.label`)
    ? `mailto:?subject=${encodeURIComponent(t(`${k}.tip.subject`))}&body=${encodeURIComponent(t(`${k}.tip.body`))}`
    : null
  const trail = [{ name: t('seo.common.home'), path: '/' }, ...(parent ? [parent] : []), { name: t(`${k}.crumb`), path }]

  return (
    <div className="animate-entry">
      <JsonLd
        data={graph(
          organization(),
          { '@type': schemaType, url: absolute(path), name: t(`${k}.title`), description: t(`${k}.description`), inLanguage: 'nb-NO' },
          breadcrumbs(trail),
          ...(faq.length ? [faqPage(faq)] : []),
          ...extraSchema,
        )}
      />

      <div className="mx-auto max-w-[1120px] px-[26px] pt-[54px]">
        <nav aria-label={t('seo.common.breadcrumb')} className="text-[12.5px] text-mut">
          {trail.slice(0, -1).map((c) => (
            <span key={c.path}>
              <Link href={c.path as Route}>{c.name}</Link>
              <span aria-hidden="true"> / </span>
            </span>
          ))}
          <span aria-current="page">{t(`${k}.crumb`)}</span>
        </nav>
        <span className="mt-[18px] inline-flex items-center gap-[8px] rounded-pill bg-sbg px-[13px] py-[6px] text-[12px] font-bold">
          <span className="block h-[7px] w-[7px] rounded-pill bg-link" />
          {t(`${k}.kicker`)}
        </span>
        <h1 className="mt-[19px] max-w-[22ch] font-display text-[clamp(28px,5vw,50px)] font-semibold leading-[1.08] [overflow-wrap:break-word] [hyphens:auto] [text-wrap:balance]">
          {t(`${k}.h1`)}
        </h1>
        <p className="mt-[17px] max-w-[58ch] text-[17px] leading-[1.65] text-body [text-wrap:pretty]">{t(`${k}.lead`)}</p>
        <div className="mt-[26px] flex flex-wrap gap-[10px]">
          <Link
            href="/registrer"
            className="inline-flex min-h-[50px] items-center rounded-tile border border-ink bg-ac px-[24px] py-[10px] text-[16px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
          >
            {t.has(`${k}.cta`) ? t(`${k}.cta`) : t('start.ctaFree')}
          </Link>
          {tip ? (
            <a
              href={tip}
              className="inline-flex min-h-[50px] items-center rounded-tile border border-ink bg-transparent px-[22px] py-[10px] text-[16px] font-semibold text-ink no-underline hover:text-ink hover:no-underline"
            >
              {t(`${k}.tip.label`)}
            </a>
          ) : null}
        </div>
        <p className="mt-[13px] text-[13px] text-mut">{t('seo.common.priceLine')}</p>
      </div>

      <div className="mx-auto max-w-[1120px] px-[26px] pt-[40px]">
        <Blocks blocks={blocks} />
      </div>

      {faq.length ? (
        <div className="mx-auto max-w-[1120px] px-[26px] pt-[54px]">
          <span className="block text-[11px] uppercase tracking-[0.12em] text-mut">{t('start.faqEyebrow')}</span>
          <Faq items={faq.map((f, i) => ({ key: String(i), q: f.q, a: f.a }))} />
        </div>
      ) : null}

      {articles?.length ? (
        <div className="mx-auto max-w-[1120px] px-[26px] pt-[54px]">
          <span className="block text-[11px] uppercase tracking-[0.12em] text-mut">{t('seo.common.readMore')}</span>
          <ArticleCards slugs={articles} />
        </div>
      ) : null}

      <CtaBand
        title={t.has(`${k}.finalTitle`) ? t(`${k}.finalTitle`) : t('start.finalTitle')}
        body={t.has(`${k}.finalBody`) ? t(`${k}.finalBody`) : t('start.finalBody')}
      />
    </div>
  )
}
