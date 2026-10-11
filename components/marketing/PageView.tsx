import type { Route } from 'next'
import Link from '@/components/site/SitePaths'
import { getLocale, getTranslations } from 'next-intl/server'
import { Faq } from '@/components/start/Faq'
import type { Block, FaqItem } from '@/lib/marketing/blocks'
import { breadcrumbs, faqPage, graph, ldLanguage, ORGPULS_LD, organization, siteLd } from '@/lib/marketing/schema'
import type { ShotId } from '@/lib/marketing/shot-ids'
import { ArticleCards } from './ArticleCards'
import { Blocks } from './Blocks'
import { TrustStrip } from '@/components/site/parts'
import { CtaBand } from './CtaBand'
import { JsonLd } from './JsonLd'
import { ProductShot } from './ProductShot'
import { SignupStart } from './SignupStart'
import { TemplateTeaser } from './TemplateTeaser'
import { WithAside } from './WithAside'
import { ownSite, serves } from '@/lib/site/own'

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
  plain: plainProp = false,
  informational = false,
  heroArt,
  heroAside,
  template,
  extra,
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
  /** an informational page (D-236): as `plain`, and no offer beside the text or at the end */
  informational?: boolean
  /** a drawn picture beside an informational page's hero (D-237), where a product shot would sell */
  heroArt?: React.ReactNode
  /** what stands beside the hero on every width: a template's download form (D-241) */
  heroAside?: React.ReactNode
  /** the free template that belongs with the page, under its blocks (D-243) */
  template?: string
  /** a page's own tool under its blocks, before the template: the verneombud's «Tips ledelsen» (D-246) */
  extra?: React.ReactNode
}) {
  const t = await getTranslations()
  const plain = plainProp || informational
  const { blocks, faq } = c
  const tip = informational ? undefined : c.tip
  const trail = [{ name: t('seo.common.home'), path: '/' }, ...(parent ? [parent] : []), { name: c.crumb, path }]
  // the site the page is on (D-270): its addresses, and the pages it serves (Empvibe's has its own articles, D-278; no templates on a site of its own)
  const ld = await siteLd()
  const own = await ownSite()

  return (
    <div>
      <JsonLd
        data={graph(
          organization(ld),
          { '@type': schemaType, url: ld.absolute(path), name: c.title, description: c.description, inLanguage: ld === ORGPULS_LD ? ldLanguage(await getLocale()) : 'en-GB' },
          breadcrumbs(trail, ld),
          ...(faq.length ? [faqPage(faq)] : []),
          ...extraSchema,
        )}
      />

      <div className="mx-auto max-w-[1120px] px-[26px] pt-[clamp(20px,4vw,54px)]">
        {/* without a product shot the signup sits in a card on the right, so the hero uses the width (D-233) */}
        <div
          className={
            heroAside
              ? 'grid items-start gap-[36px] lg:[grid-template-columns:minmax(0,1.2fr)_minmax(0,1fr)]'
              : heroShot || heroArt
                ? 'grid items-center gap-[36px] lg:[grid-template-columns:minmax(0,1.05fr)_minmax(0,1fr)]'
                : plain
                  ? ''
                  : 'grid items-end gap-[36px] lg:[grid-template-columns:minmax(0,1.2fr)_minmax(0,1fr)]'
          }
        >
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
            <h1 className="mt-[16px] max-w-[24ch] font-display text-[clamp(28px,5vw,50px)] font-semibold leading-[1.08] [overflow-wrap:break-word] [hyphens:auto] [text-wrap:balance]">
              {c.h1}
            </h1>
            <p className="mt-[14px] max-w-[58ch] text-[16.5px] leading-[1.6] text-body [text-wrap:pretty]">{c.lead}</p>
            {plain || !(heroShot || heroArt) ? null : (
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
                {/* the two lines above say where answers are stored and what a group needs */}
                <TrustStrip items={['qps', 'law']} className="mt-[16px]" />
              </>
            )}
            {tip ? (
              <Link
                href={tip.href as Route}
                className="mt-[16px] inline-flex min-h-[48px] items-center rounded-tile border border-ink bg-transparent px-[20px] py-[10px] text-[15px] font-semibold text-ink no-underline hover:text-ink hover:no-underline"
              >
                {tip.label}
              </Link>
            ) : null}
          </div>
          {heroAside ? (
            <div className="min-w-0">{heroAside}</div>
          ) : heroArt ? (
            <div aria-hidden="true" className="hidden min-w-0 justify-center lg:flex">
              {heroArt}
            </div>
          ) : heroShot ? (
            <div className="flex min-w-0 justify-center lg:justify-end">
              <ProductShot id={heroShot} priority />
            </div>
          ) : plain ? null : (
            <div className="min-w-0 rounded-note border border-line bg-sf px-[24px] py-[22px] shadow-[0_18px_40px_-28px_rgba(25,21,16,.35)]">
              <SignupStart
                label={c.signupLabel || t('seo.signup.label')}
                submit={t('seo.signup.submit')}
                invalid={t('seo.signup.invalid')}
                invalidChecksum={t('seo.signup.invalidChecksum')}
              />
              <p className="mb-0 mt-[12px] text-[13px] leading-[1.6] text-mut">
                <span className="block">{t('seo.common.priceLine')}</span>
                <span className="block">{t('seo.common.anonymity')}</span>
              </p>
              <TrustStrip items={['qps', 'law']} className="mt-[16px]" />
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-[1120px] px-[26px] pt-[40px]">
        <WithAside
          blocks={blocks}
          cta={
            plain
              ? undefined
              : {
                  title: c.finalTitle || t('start.finalTitle'),
                  body: c.finalBody || t('start.finalBody'),
                }
          }
        >
          {extra}
          {template && serves(own, '/maler') ? <TemplateTeaser slug={template} className="mt-[34px]" /> : null}
        </WithAside>
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

      {articles?.length && serves(own, '/artikler') ? (
        <div className="mx-auto max-w-[1120px] px-[26px] pt-[54px]">
          <span className="block text-[11px] uppercase tracking-[0.12em] text-mut">{t('seo.common.readMore')}</span>
          <ArticleCards slugs={articles} />
        </div>
      ) : null}

      {informational ? (
        <div className="pb-[72px]" />
      ) : (
        <CtaBand title={c.finalTitle || t('start.finalTitle')} body={c.finalBody || t('start.finalBody')} />
      )}
    </div>
  )
}
