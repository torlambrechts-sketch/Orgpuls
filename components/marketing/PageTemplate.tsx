import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Faq } from '@/components/start/Faq'
import { Blocks as BlocksSchema, FaqItems } from '@/lib/marketing/blocks'
import { breadcrumbs, faqPage, graph, organization } from '@/lib/marketing/schema'
import type { ShotId } from '@/lib/marketing/shot-ids'
import { absolute } from '@/lib/marketing/site'
import { ArticleCards } from './ArticleCards'
import { Blocks } from './Blocks'
import { CtaBand } from './CtaBand'
import { JsonLd } from './JsonLd'
import { ProductShot } from './ProductShot'
import { SignupStart } from './SignupStart'

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
  heroShot,
  related,
  schemaType = 'WebPage',
  extraSchema = [],
  children,
  plain = false,
}: {
  /** the page's message key, e.g. `seo.pages.plattform` */
  k: string
  path: string
  /** a section the page sits under, for the breadcrumb: Bruksområder for a use case */
  parent?: { name: string; path: string }
  articles?: string[]
  /** a picture of the product beside the hero's words (D-85) */
  heroShot?: ShotId
  /** other pages for the same reader, as link cards before the articles */
  related?: { href: string; title: string; text: string }[]
  schemaType?: 'WebPage' | 'AboutPage' | 'ContactPage' | 'CollectionPage'
  extraSchema?: Record<string, unknown>[]
  /** a page's own section after its blocks: the contact form on /kontakt (D-95) */
  children?: React.ReactNode
  /** a document page (the privacy statement, D-104): no signup field or price line in the hero */
  plain?: boolean
}) {
  const t = await getTranslations()
  const blocks = BlocksSchema.parse(t.raw(`${k}.blocks`))
  const faq = t.has(`${k}.faq`) ? FaqItems.parse(t.raw(`${k}.faq`)) : []
  const tip = t.has(`${k}.tip.label`)
    ? `mailto:?subject=${encodeURIComponent(t(`${k}.tip.subject`))}&body=${encodeURIComponent(t(`${k}.tip.body`))}`
    : null
  const trail = [{ name: t('seo.common.home'), path: '/' }, ...(parent ? [parent] : []), { name: t(`${k}.crumb`), path }]

  return (
    <div>
      <JsonLd
        data={graph(
          organization(),
          { '@type': schemaType, url: absolute(path), name: t(`${k}.title`), description: t(`${k}.description`), inLanguage: 'nb-NO' },
          breadcrumbs(trail),
          ...(faq.length ? [faqPage(faq)] : []),
          ...extraSchema,
        )}
      />

      <div className="mx-auto max-w-[1120px] px-[26px] pt-[clamp(20px,4vw,54px)]">
        <div className={heroShot ? 'grid items-center gap-[36px] lg:[grid-template-columns:minmax(0,1.05fr)_minmax(0,1fr)]' : ''}>
          <div className="min-w-0">
            <nav aria-label={t('seo.common.breadcrumb')} className="text-[12.5px] text-mut">
              {trail.slice(0, -1).map((c) => (
                <span key={c.path}>
                  <Link href={c.path as Route}>{c.name}</Link>
                  <span aria-hidden="true"> / </span>
                </span>
              ))}
              <span aria-current="page">{t(`${k}.crumb`)}</span>
            </nav>
            <span className="mt-[16px] inline-flex items-center gap-[8px] rounded-pill bg-sbg px-[13px] py-[6px] text-[12px] font-bold">
              <span className="block h-[7px] w-[7px] rounded-pill bg-link" />
              {t(`${k}.kicker`)}
            </span>
            <h1 className="mt-[16px] max-w-[22ch] font-display text-[clamp(28px,5vw,50px)] font-semibold leading-[1.08] [overflow-wrap:break-word] [hyphens:auto] [text-wrap:balance]">
              {t(`${k}.h1`)}
            </h1>
            <p className="mt-[14px] max-w-[58ch] text-[16.5px] leading-[1.6] text-body [text-wrap:pretty]">{t(`${k}.lead`)}</p>
            {plain ? null : (
              <>
                <div className="mt-[22px]">
                  <SignupStart
                    label={t.has(`${k}.signupLabel`) ? t(`${k}.signupLabel`) : t('seo.signup.label')}
                    submit={t('seo.signup.submit')}
                    invalid={t('seo.signup.invalid')}
                  />
                </div>
                <p className="mb-0 mt-[12px] text-[13px] leading-[1.6] text-mut">
                  <span className="block">{t('seo.common.priceLine')}</span>
                  <span className="block">{t('seo.common.anonymity')}</span>
                </p>
              </>
            )}
            {tip ? (
              <a
                href={tip}
                className="mt-[16px] inline-flex min-h-[48px] items-center rounded-tile border border-ink bg-transparent px-[20px] py-[10px] text-[15px] font-semibold text-ink no-underline hover:text-ink hover:no-underline"
              >
                {t(`${k}.tip.label`)}
              </a>
            ) : null}
          </div>
          {heroShot ? (
            <div className="flex min-w-0 justify-center lg:justify-end">
              <ProductShot id={heroShot} priority />
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto max-w-[1120px] px-[26px] pt-[40px]">
        <Blocks blocks={blocks} />
      </div>

      {children}

      {faq.length ? (
        <div className="mx-auto max-w-[1120px] px-[26px] pt-[54px]">
          <span className="block text-[11px] uppercase tracking-[0.12em] text-mut">{t('start.faqEyebrow')}</span>
          <Faq items={faq.map((f, i) => ({ key: String(i), q: f.q, a: f.a }))} />
        </div>
      ) : null}

      {related?.length ? (
        <div className="mx-auto max-w-[1120px] px-[26px] pt-[54px]">
          <h2 className="m-0 font-display text-[clamp(23px,3vw,29px)] font-semibold leading-[1.18]">{t('seo.common.related')}</h2>
          <div className="mt-[16px]">
            <Blocks blocks={[{ t: 'links', items: related }]} />
          </div>
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
