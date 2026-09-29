import type { Route } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { Faq } from '@/components/start/Faq'
import type { Block, FaqItem } from '@/lib/marketing/blocks'
import { breadcrumbs, faqPage, graph, ldLanguage, organization } from '@/lib/marketing/schema'
import type { ShotId } from '@/lib/marketing/shot-ids'
import { absolute } from '@/lib/marketing/site'
import { ArticleCards } from './ArticleCards'
import { Blocks } from './Blocks'
import { CtaBand } from './CtaBand'
import { JsonLd } from './JsonLd'
import { ProductShot } from './ProductShot'
import { SignupStart } from './SignupStart'

/** A page's words, wherever they come from: messages (PageTemplate) or the CMS (0114, X-094) */
export type PageContent = {
  title: string
  description: string
  crumb: string
  kicker: string
  h1: string
  lead: string
  blocks: Block[]
  faq: FaqItem[]
  signupLabel?: string
  /** a second action in the hero: a mailto a reader can pass on */
  tip?: { label: string; href: string }
  finalTitle?: string
  finalBody?: string
}

/**
 * A public page: a hero whose H1 answers the reader's question, the page's blocks, its
 * questions if it has any, articles for the reader who wants more, and the start page's
 * closing offer. Landing pages, Plattform, Priser, Om oss, and every page made in the CMS, are
 * all this one shape; the words arrive as a PageContent.
 *
 * The hero keeps the start page's type, pill and buttons. Optional parts are drawn only when
 * the content carries them: a second action (`tip`), `faq`, the closing words.
 */
export async function PageView({
  content: c,
  crumbs = true,
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
  content: PageContent
  /** a splash page for an ad or a mailing: the hero without the trail back into the site */
  crumbs?: boolean
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
  const { blocks, faq, tip } = c
  const trail = [{ name: t('seo.common.home'), path: '/' }, ...(parent ? [parent] : []), { name: c.crumb, path }]

  return (
    <div>
      <JsonLd
        data={graph(
          organization(),
          { '@type': schemaType, url: absolute(path), name: c.title, description: c.description, inLanguage: ldLanguage(await getLocale()) },
          breadcrumbs(trail),
          ...(faq.length ? [faqPage(faq)] : []),
          ...extraSchema,
        )}
      />

      <div className="mx-auto max-w-[1120px] px-[26px] pt-[clamp(20px,4vw,54px)]">
        <div className={heroShot ? 'grid items-center gap-[36px] lg:[grid-template-columns:minmax(0,1.05fr)_minmax(0,1fr)]' : ''}>
          <div className="min-w-0">
            {crumbs ? (
              <nav aria-label={t('seo.common.breadcrumb')} className="text-[12.5px] text-mut">
                {trail.slice(0, -1).map((x) => (
                  <span key={x.path}>
                    <Link href={x.path as Route}>{x.name}</Link>
                    <span aria-hidden="true"> / </span>
                  </span>
                ))}
                <span aria-current="page">{c.crumb}</span>
              </nav>
            ) : null}
            <span
              className={`${crumbs ? 'mt-[16px] ' : ''}inline-flex items-center gap-[8px] rounded-pill bg-sbg px-[13px] py-[6px] text-[12px] font-bold`}
            >
              <span className="block h-[7px] w-[7px] rounded-pill bg-link" />
              {c.kicker}
            </span>
            <h1 className="mt-[16px] max-w-[22ch] font-display text-[clamp(28px,5vw,50px)] font-semibold leading-[1.08] [overflow-wrap:break-word] [hyphens:auto] [text-wrap:balance]">
              {c.h1}
            </h1>
            <p className="mt-[14px] max-w-[58ch] text-[16.5px] leading-[1.6] text-body [text-wrap:pretty]">{c.lead}</p>
            {plain ? null : (
              <>
                <div className="mt-[22px]">
                  <SignupStart
                    label={c.signupLabel || t('seo.signup.label')}
                    submit={t('seo.signup.submit')}
                    invalid={t('seo.signup.invalid')}
                    invalidChecksum={t('seo.signup.invalidChecksum')}
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
                href={tip.href}
                className="mt-[16px] inline-flex min-h-[48px] items-center rounded-tile border border-ink bg-transparent px-[20px] py-[10px] text-[15px] font-semibold text-ink no-underline hover:text-ink hover:no-underline"
              >
                {tip.label}
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
        title={c.finalTitle || t('start.finalTitle')}
        body={c.finalBody || t('start.finalBody')}
      />
    </div>
  )
}
