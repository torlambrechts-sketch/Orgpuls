import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ArticleCards } from '@/components/marketing/ArticleCards'
import { cardColumns } from '@/components/marketing/Blocks'
import { Plans } from '@/components/marketing/Plans'
import { SignupStart } from '@/components/marketing/SignupStart'
import { ProductShot } from '@/components/marketing/ProductShot'
import { Rich } from '@/components/marketing/Rich'
import { Tick } from '@/components/marketing/Tick'
import { JsonLd } from '@/components/marketing/JsonLd'
import { LawRef } from '@/components/marketing/LawRef'
import { Container, Eyebrow, H2, Section } from '@/components/marketing/Section'
import { Faq } from '@/components/start/Faq'
import { pageMeta } from '@/lib/marketing/meta'
import { faqPage, graph, organization, software, website } from '@/lib/marketing/schema'
import { ARTICLES, LANDING_PAGES, landingKey } from '@/lib/marketing/site'

/**
 * The splash page. Orgpuls_Start.dc.html lines 44-274.
 *
 * Everything here is copy, transcribed from the bundle, and it is worth being clear about
 * one thing: **the figures in the hero's mock-up are an illustration, not this
 * organisation's data.** The card is captioned "Innsikt · Nordvik Anlegg AS" exactly as
 * the design captions it, which is the same demo undertaking the fixture builds, and the
 * numbers in it are that fixture's real ones — index 61, down 3 from 64. A marketing page
 * showing the product is not the case CLAUDE.md's "never fabricate data" rule is about,
 * but the caption is what keeps the distinction visible. D-37.
 *
 * Since D-86 the page is laid out on the public site's grid (docs/landingsside-gjennomgang.md
 * 4): full-width bands that alternate base and surface, a 1280 px container, 12 columns,
 * the hero on 6 + 6, text-and-picture rows on 6 + 6, the law and the questions on 4 + 8.
 * The words, the hero card and its figures are the design's.
 *
 * Two things the design offers that are not rendered: a "Se hvordan det virker" button
 * that smooth-scrolls to an anchor, which is here as an ordinary anchor link, and the
 * "Snakk med oss" plan CTA, which in the bundle opens the sign-in screen and here opens
 * the same place.
 */
export const dynamic = 'force-static'

/**
 * The title and description a search result shows. They name what people search for —
 * medarbeiderundersøkelse, arbeidsmiljøkartlegging — which the design's "Orgpuls" alone did
 * not. D-79.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return pageMeta({ title: t('seo.home.title'), description: t('seo.home.description'), path: '/' })
}

const TRUST = ['trial', 'noCard', 'eu', 'five'] as const
const PEEK = [
  { n: 1, key: 'ytring', lift: '+6' },
  { n: 2, key: 'mengde', lift: '+4' },
  { n: 3, key: 'leder', lift: '+3' },
] as const
const PAINS = ['trend', 'early', 'monday'] as const
const STEPS = [
  { n: 1, key: 'listen', accent: false },
  { n: 2, key: 'understand', accent: false },
  { n: 3, key: 'work', accent: true },
  { n: 4, key: 'verify', accent: false },
] as const
/** What sets Orgpuls apart, each with the screen that shows it (D-86). */
const DIFFS = [
  { key: 'effect', shot: 'tiltak' },
  { key: 'five', shot: 'varmekart' },
  { key: 'twoway', shot: 'samtaler' },
] as const
/** The rest of the product, each row a screen and what it is for (D-84, D-86). */
const SHOWCASE = ['oversikt', 'sporsmal', 'arshjul'] as const
const LEGAL = ['aml31c', 'aml43', 'aml62', 'aml92'] as const
const QUOTES = ['cancel', 'export', 'eu'] as const
const FAQ = ['anonymous', 'twelve', 'inspection', 'time', 'leaving'] as const

export default async function SplashPage() {
  const t = await getTranslations()
  const faq = FAQ.map((k) => ({ key: k, q: t(`start.faq.${k}.q`), a: t(`start.faq.${k}.a`) }))

  /** A band's opening: the small label, the heading, and a lead if it has one. */
  const Head = ({ id, eyebrow, title, lead }: { id: string; eyebrow: string; title: string; lead?: string }) => (
    <div className="max-w-3xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <H2 id={id}>{title}</H2>
      {lead ? <p className="m-0 mt-4 max-w-prose text-mk-lead text-mut [text-wrap:pretty]">{lead}</p> : null}
    </div>
  )

  /** Words on 6 columns, the screen on the other 6, changing side row by row (4.2). */
  const Row = ({ flip, children, shot }: { flip: boolean; children: React.ReactNode; shot: React.ReactNode }) => (
    <div className="grid items-center gap-8 lg:grid-cols-12">
      <div className={`min-w-0 lg:col-span-6 ${flip ? 'lg:order-last' : ''}`}>{children}</div>
      <div className="flex min-w-0 justify-center lg:col-span-6">{shot}</div>
    </div>
  )

  return (
    <>
      <JsonLd data={graph(organization(), website(), software(t('seo.home.description')), faqPage(faq))} />

      {/* ------------------------------------------------------------ hero */}
      <section aria-labelledby="hero-title" className="w-full overflow-x-clip bg-bg pb-8 pt-4 sm:pt-8 lg:flex lg:min-h-[70svh] lg:items-center lg:py-16">
        <Container>
          <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-8">
            <div className="min-w-0 lg:col-span-6">
              <span className="hidden items-center gap-2 rounded-pill bg-sbg px-3 py-1 text-mk-small font-bold sm:inline-flex">
                <span className="block h-2 w-2 rounded-pill bg-link" />
                {t('start.kicker')}
              </span>
              {/* the headline's long compound carries a soft hyphen, so a phone breaks it rather than the page */}
              <h1
                id="hero-title"
                className="m-0 font-display text-mk-h1 font-semibold [overflow-wrap:break-word] [text-wrap:balance] sm:mt-4"
              >
                {t('start.headline')}
              </h1>
              <p className="m-0 mt-4 max-w-prose text-mk-lead text-body [text-wrap:pretty] lg:mt-6">{t('start.lead')}</p>
              <div className="mt-5 lg:mt-8">
                <SignupStart label={t('seo.signup.label')} submit={t('seo.signup.submit')} invalid={t('seo.signup.invalid')} />
              </div>
              <p className="m-0 mt-2 flex flex-wrap items-baseline gap-x-4 text-mk-small text-mut">
                <span>{t('seo.common.priceFrom')}</span>
                <a href="#how" className="inline-flex min-h-11 items-center font-semibold underline decoration-1 underline-offset-[3px]">
                  {t('start.ctaHow')}
                </a>
              </p>
              <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
                {TRUST.map((k) => (
                  <li
                    key={k}
                    className="flex items-center gap-2 rounded-pill border border-line bg-sf px-3 py-1 text-mk-small font-medium"
                  >
                    <Tick />
                    {t(`start.trust.${k}`)}
                  </li>
                ))}
              </ul>
            </div>

            {/* the design's example, the page's centre of attention; it runs into the margin (4.2) */}
            <div className="min-w-0 lg:col-span-6 lg:-mr-12">
              <div data-testid="hero-image" data-product className="overflow-hidden rounded-frame border border-line bg-sf shadow-shot">
                <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                  <span className="block h-2 w-2 rounded-pill bg-line" />
                  <span className="block h-2 w-2 rounded-pill bg-line" />
                  <span className="block h-2 w-2 rounded-pill bg-line" />
                  <span className="ml-2 text-mk-small text-mut">{t('start.mockCaption')}</span>
                </div>
                <div className="p-6 lg:p-8">
                  <span className="block text-mk-small text-mut">{t('start.mockIndexLabel')}</span>
                  <span className="mt-2 flex flex-wrap items-end gap-4">
                    <span className="font-display text-mk-h1 font-semibold !leading-[0.85]">61</span>
                    <span className="pb-2">
                      <span className="block text-mk-card font-bold text-danger">{t('start.mockDelta')}</span>
                      <span className="mt-1 block text-mk-small text-mut">{t('start.mockPrev')}</span>
                    </span>
                  </span>
                  <span className="mt-5 flex h-7 gap-1 overflow-hidden rounded-bar">
                    <span className="block flex-[4] bg-mint" />
                    <span className="block flex-[5] bg-band" />
                    <span className="block flex-[2] bg-peach2" />
                  </span>
                  <span className="mt-2 flex justify-between gap-3 text-mk-small text-mut">
                    <span>{t('start.mockBandLow')}</span>
                    <span>{t('start.mockBandMid')}</span>
                    <span>{t('start.mockBandHigh')}</span>
                  </span>

                  <span className="mt-6 block border-t border-line pt-5 text-mk-small text-mut">{t('start.mockDoThree')}</span>
                  <span className="mt-3 flex flex-col gap-2">
                    {PEEK.map((p) => (
                      <span key={p.n} className="flex items-center gap-3 rounded-btn border border-line bg-bg px-4 py-3">
                        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-pill bg-ink text-mk-small font-bold text-bg">
                          {p.n}
                        </span>
                        <span className="min-w-0 flex-1 text-mk-card font-semibold">{t(`start.peek.${p.key}`)}</span>
                        <span className="flex-none text-mk-card font-bold text-link">{p.lift}</span>
                      </span>
                    ))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------------------ pains */}
      <Section tone="surface" label="why-title">
        <Head id="why-title" eyebrow={t('start.whyEyebrow')} title={t('start.whyTitle')} />
        <div className={`mt-10 grid gap-6 ${cardColumns(PAINS.length)}`}>
          {PAINS.map((k) => (
            <div key={k} className="rounded-note border border-line bg-bg p-6">
              <h3 className="m-0 text-mk-h3 font-bold [text-wrap:pretty]">{t(`start.pain.${k}.title`)}</h3>
              <p className="m-0 mt-2 text-mk-card text-mut [text-wrap:pretty]">{t(`start.pain.${k}.body`)}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------ steps */}
      <Section id="how" label="how-title">
        <Head id="how-title" eyebrow={t('start.howEyebrow')} title={t('start.howTitle')} lead={t('start.howLead')} />
        <ol className="m-0 mt-10 grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className={`flex flex-col gap-3 rounded-note p-6 ${s.accent ? 'border-2 border-ink bg-sbg' : 'border border-line bg-sf'}`}
            >
              <span className="flex items-center gap-3">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-pill bg-ink text-mk-small font-bold text-bg">
                  {s.n}
                </span>
                <span className="text-mk-h3 font-bold">{t(`start.step.${s.key}.title`)}</span>
              </span>
              <span className="text-mk-card text-body [text-wrap:pretty]">{t(`start.step.${s.key}.body`)}</span>
              <span className="mt-auto pt-2 text-mk-small font-bold text-mut">{t(`start.step.${s.key}.time`)}</span>
            </li>
          ))}
        </ol>
      </Section>

      {/* ---------------------------------------------------------- showcase */}
      <Section tone="surface" label="showcase-title">
        <Head
          id="showcase-title"
          eyebrow={t('seo.home.showcase.eyebrow')}
          title={t('seo.home.showcase.title')}
          lead={t('seo.home.showcase.lead')}
        />
        <div className="mt-12 flex flex-col gap-16 lg:gap-24">
          {SHOWCASE.map((id, i) => (
            <Row key={id} flip={i % 2 === 1} shot={<ProductShot id={id} />}>
              <h3 className="m-0 font-display text-mk-h3 font-semibold lg:text-[2rem] lg:leading-[1.2]">
                {t(`seo.home.showcase.${id}.title`)}
              </h3>
              <p className="m-0 mt-4 max-w-prose text-mk-body text-body [text-wrap:pretty]">{t(`seo.home.showcase.${id}.body`)}</p>
              {i === 0 ? (
                <Link
                  href={'/plattform' as Route}
                  className="mt-6 inline-flex h-12 items-center rounded-tile border border-ink bg-transparent px-5 text-mk-card font-semibold text-ink no-underline hover:text-ink hover:no-underline"
                >
                  {t('seo.home.showcase.more')}
                </Link>
              ) : null}
            </Row>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------ diffs */}
      <Section label="diff-title">
        <Head id="diff-title" eyebrow={t('start.diffEyebrow')} title={t('start.diffTitle')} />
        <div className="mt-12 flex flex-col gap-16 lg:gap-24">
          {DIFFS.map((d, i) => (
            <Row key={d.key} flip={i % 2 === 0} shot={<ProductShot id={d.shot} />}>
              <h3 className="m-0 font-display text-mk-h3 font-semibold lg:text-[2rem] lg:leading-[1.2]">{t(`start.diff.${d.key}.title`)}</h3>
              <p className="m-0 mt-2 text-mk-small font-bold text-mut">{t(`start.diff.${d.key}.tag`)}</p>
              <p className="m-0 mt-4 max-w-prose text-mk-body text-body [text-wrap:pretty]">{t(`start.diff.${d.key}.body`)}</p>
            </Row>
          ))}
        </div>
      </Section>

      {/* ---------------------------------------------------------- for hvem */}
      <Section tone="surface" label="forwho-title">
        <Head id="forwho-title" eyebrow={t('seo.forWho.eyebrow')} title={t('seo.forWho.title')} />
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {LANDING_PAGES.map((slug) => (
            <Link
              key={slug}
              href={`/${slug}` as Route}
              className="group flex flex-col gap-2 rounded-note border border-line bg-bg p-6 text-ink no-underline hover:border-ink hover:text-ink hover:no-underline"
            >
              <span className="text-mk-h3 font-bold [text-wrap:pretty] group-hover:underline">{t(`seo.lp.${landingKey(slug)}.card.title`)}</span>
              <span className="text-mk-card text-mut [text-wrap:pretty]">{t(`seo.lp.${landingKey(slug)}.card.text`)}</span>
            </Link>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------- law */}
      <Section label="law-title">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-4">
            <Eyebrow>{t('start.lawEyebrow')}</Eyebrow>
            <H2 id="law-title">{t('start.lawTitle')}</H2>
            <p className="m-0 mt-4 max-w-prose text-mk-body text-body [text-wrap:pretty]">{t('start.lawBody')}</p>
            <p className="m-0 mt-3 max-w-prose text-mk-small text-mut [text-wrap:pretty]">{t('start.lawNote')}</p>
          </div>
          <div className="flex min-w-0 flex-col gap-3 lg:col-span-8">
            {LEGAL.map((k) => (
              <span
                key={k}
                className="grid items-baseline gap-4 rounded-cta border border-line bg-sf px-5 py-4 [grid-template-columns:7rem_minmax(0,1fr)]"
              >
                <LawRef text={t(`start.legal.${k}.ref`)} className="text-mk-small font-bold" />
                <span className="text-mk-body [text-wrap:pretty]">{t(`start.legal.${k}.what`)}</span>
              </span>
            ))}
          </div>
        </div>
      </Section>

      {/* ----------------------------------------------------------- quotes */}
      <Section tone="surface">
        <div className={`grid gap-6 ${cardColumns(QUOTES.length)}`}>
          {QUOTES.map((k) => (
            <div key={k} className="flex flex-col gap-2 rounded-panel border border-line bg-bg p-6">
              <span className="text-mk-small font-bold text-mut">{t(`start.quote.${k}.who`)}</span>
              <h3 className="m-0 font-display text-mk-h3 font-semibold [text-wrap:balance]">{t(`start.quote.${k}.title`)}</h3>
              <p className="m-0 text-mk-card text-body [text-wrap:pretty]">{t(`start.quote.${k}.body`)}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------ price */}
      <Section id="pris" label="price-title">
        <Head id="price-title" eyebrow={t('start.priceEyebrow')} title={t('start.priceTitle')} lead={t('start.priceLead')} />
        <Plans />
        <p className="m-0 mt-4 text-mk-small text-mut">{t('start.priceNote')}</p>
      </Section>

      {/* -------------------------------------------------------------- faq */}
      <Section tone="surface" label="faq-title">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-4">
            <H2 id="faq-title">{t('start.faqEyebrow')}</H2>
            <p className="m-0 mt-4 max-w-prose text-mk-lead text-mut [text-wrap:pretty]">
              <Rich text={t('seo.common.faqLead')} />
            </p>
          </div>
          <div className="min-w-0 lg:col-span-8">
            <Faq items={faq} />
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------- articles */}
      <Section label="articles-title">
        <Head id="articles-title" eyebrow={t('seo.home.articlesEyebrow')} title={t('seo.home.articlesTitle')} />
        <ArticleCards slugs={ARTICLES.slice(0, 3).map((a) => a.slug)} />
        <Link href={'/artikler' as Route} className="mt-4 inline-flex min-h-11 items-center text-mk-card font-semibold">
          {t('seo.home.articlesAll')}
        </Link>
      </Section>

      {/* --------------------------------------------------------- final cta */}
      <section aria-labelledby="final-title" className="w-full bg-ink py-16 text-bg lg:py-24">
        <Container>
          <div className="grid items-center gap-8 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-8">
              <h2 id="final-title" className="m-0 font-display text-mk-h2 font-semibold [text-wrap:balance]">
                {t('start.finalTitle')}
              </h2>
              <p className="m-0 mt-4 max-w-prose text-mk-lead opacity-80 [text-wrap:pretty]">{t('start.finalBody')}</p>
            </div>
            <div className="flex min-w-0 flex-col gap-3 lg:col-span-4">
              <Link
                href="/registrer"
                className="inline-flex h-14 items-center justify-center rounded-tile border border-ac bg-ac px-6 text-mk-body font-bold text-ink no-underline hover:text-ink hover:no-underline"
              >
                {t('start.ctaFree')}
              </Link>
              <Link
                href="/logg-inn"
                className="inline-flex h-12 items-center justify-center rounded-tile border border-bg/[0.35] bg-transparent px-6 text-mk-card font-semibold text-bg no-underline hover:text-bg hover:no-underline"
              >
                {t('start.ctaHaveAccount')}
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </>
  )
}
