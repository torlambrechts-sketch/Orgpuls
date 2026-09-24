import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Faq } from '@/components/start/Faq'
import { Blocks as BlocksSchema, FaqItems } from '@/lib/marketing/blocks'
import { breadcrumbs, faqPage, graph, organization } from '@/lib/marketing/schema'
import { absolute, LANDING_ARTICLES, landingKey, type LandingSlug } from '@/lib/marketing/site'
import { ArticleCards } from './ArticleCards'
import { Blocks } from './Blocks'
import { CtaBand } from './CtaBand'
import { JsonLd } from './JsonLd'

/**
 * A landing page: one search intent, one reader, one offer. The same shape for all four —
 * a hero whose H1 answers the search, the page's blocks, its questions, two articles for
 * the reader who wants to know more, and the start page's closing offer.
 *
 * The hero keeps the start page's type, pill and buttons; the only second action is the
 * page's own (the verneombud's e-mail to their leader), never navigation away from the offer.
 */
export async function LandingTemplate({ slug }: { slug: LandingSlug }) {
  const t = await getTranslations()
  const k = `seo.lp.${landingKey(slug)}`
  const blocks = BlocksSchema.parse(t.raw(`${k}.blocks`))
  const faq = FaqItems.parse(t.raw(`${k}.faq`))
  const path = `/${slug}`
  const tip = t.has(`${k}.tip.label`)
    ? `mailto:?subject=${encodeURIComponent(t(`${k}.tip.subject`))}&body=${encodeURIComponent(t(`${k}.tip.body`))}`
    : null

  return (
    <div className="animate-entry">
      <JsonLd
        data={graph(
          organization(),
          {
            '@type': 'WebPage',
            url: absolute(path),
            name: t(`${k}.title`),
            description: t(`${k}.description`),
            inLanguage: 'nb-NO',
          },
          breadcrumbs([
            { name: t('seo.common.home'), path: '/' },
            { name: t(`${k}.crumb`), path },
          ]),
          faqPage(faq),
        )}
      />

      <div className="mx-auto max-w-[1120px] px-[26px] pt-[54px]">
        <nav aria-label={t('seo.common.breadcrumb')} className="text-[12.5px] text-mut">
          <Link href="/">{t('seo.common.home')}</Link>
          <span aria-hidden="true"> / </span>
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
            {t(`${k}.cta`)}
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

      <div className="mx-auto max-w-[1120px] px-[26px] pt-[54px]">
        <span className="block text-[11px] uppercase tracking-[0.12em] text-mut">{t('start.faqEyebrow')}</span>
        <Faq items={faq.map((f, i) => ({ key: String(i), q: f.q, a: f.a }))} />
      </div>

      <div className="mx-auto max-w-[1120px] px-[26px] pt-[54px]">
        <span className="block text-[11px] uppercase tracking-[0.12em] text-mut">{t('seo.common.readMore')}</span>
        <ArticleCards slugs={LANDING_ARTICLES[slug]} />
      </div>

      <CtaBand title={t(`${k}.finalTitle`)} body={t(`${k}.finalBody`)} />
    </div>
  )
}
