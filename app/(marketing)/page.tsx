import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ArticleCards } from '@/components/marketing/ArticleCards'
import { Plans } from '@/components/marketing/Plans'
import { SignupStart } from '@/components/marketing/SignupStart'
import { ProductShot } from '@/components/marketing/ProductShot'
import { Tick } from '@/components/marketing/Tick'
import { JsonLd } from '@/components/marketing/JsonLd'
import { LawRef } from '@/components/marketing/LawRef'
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
const DIFFS = ['effect', 'five', 'twoway'] as const
/** The product pictures below the steps, two to a row (D-84); the wide ones are their own rows. */
const SHOWCASE_PAIRS = [
  ['varmekart', 'tiltak'],
  ['samtaler', 'arshjul'],
] as const
const LEGAL = ['aml31c', 'aml43', 'aml62', 'aml92'] as const
const QUOTES = ['cancel', 'export', 'eu'] as const
const FAQ = ['anonymous', 'twelve', 'inspection', 'time', 'leaving'] as const

export default async function SplashPage() {
  const t = await getTranslations()

  const Section = ({
    eyebrow,
    children,
  }: {
    eyebrow?: string
    children: React.ReactNode
  }) => (
    <div className="mx-auto max-w-[1120px] px-[26px] pt-[54px]">
      {eyebrow ? (
        <span className="block text-[11px] uppercase tracking-[0.12em] text-mut">{eyebrow}</span>
      ) : null}
      {children}
    </div>
  )

  /** A wide card: the words on one side, the picture on the other; they stack on a phone. */
  const ShowcaseWide = ({ id, more = false }: { id: 'oversikt' | 'sporsmal'; more?: boolean }) => (
    <div
      className={`grid items-center gap-[clamp(20px,3vw,34px)] rounded-card border border-line bg-sf p-[clamp(20px,3vw,32px)] ${
        id === 'sporsmal' ? 'md:grid-cols-2' : 'lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1.75fr)]'
      }`}
    >
      <div className={`min-w-0 ${id === 'sporsmal' ? 'md:order-last' : ''}`}>
        <h3 className="m-0 font-display text-[clamp(22px,2.8vw,27px)] font-semibold leading-[1.2] [text-wrap:balance]">
          {t(`seo.home.showcase.${id}.title`)}
        </h3>
        <p className="mt-[10px] max-w-[46ch] text-[15px] leading-[1.65] text-body [text-wrap:pretty]">
          {t(`seo.home.showcase.${id}.body`)}
        </p>
        {more ? (
          <Link
            href={'/plattform' as Route}
            className="mt-[20px] inline-flex h-[44px] items-center rounded-tile border border-ink bg-transparent px-[18px] text-[14.5px] font-semibold text-ink no-underline hover:text-ink hover:no-underline"
          >
            {t('seo.home.showcase.more')} →
          </Link>
        ) : null}
      </div>
      <div className={`flex min-w-0 ${id === 'sporsmal' ? 'justify-center' : 'justify-end'}`}>
        <ProductShot id={id} />
      </div>
    </div>
  )

  /** Two cards in a row: the words above, the picture below. */
  const ShowcasePair = ({ ids }: { ids: readonly ('varmekart' | 'tiltak' | 'samtaler' | 'arshjul')[] }) => (
    <div className="grid gap-[13px] [grid-template-columns:repeat(auto-fit,minmax(min(400px,100%),1fr))]">
      {ids.map((id) => (
        <div key={id} className="flex min-w-0 flex-col rounded-card border border-line bg-sf px-[clamp(20px,3vw,28px)] pb-[clamp(20px,3vw,28px)] pt-[24px]">
          <h3 className="m-0 text-[18px] font-bold leading-[1.3]">{t(`seo.home.showcase.${id}.title`)}</h3>
          <p className="mt-[8px] max-w-[52ch] text-[14px] leading-[1.6] text-mut [text-wrap:pretty]">{t(`seo.home.showcase.${id}.body`)}</p>
          <div className="mt-auto pt-[20px]">
            <ProductShot id={id} />
          </div>
        </div>
      ))}
    </div>
  )

  const faq = FAQ.map((k) => ({ key: k, q: t(`start.faq.${k}.q`), a: t(`start.faq.${k}.a`) }))

  return (
    <div>
      <JsonLd data={graph(organization(), website(), software(t('seo.home.description')), faqPage(faq))} />
      {/* ------------------------------------------------------------ hero */}
      <div className="mx-auto max-w-[1120px] px-[26px] pt-[clamp(20px,4vw,54px)]">
        <div className="grid items-center gap-[36px] [grid-template-columns:repeat(auto-fit,minmax(min(310px,100%),1fr))]">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-[8px] rounded-pill bg-sbg px-[13px] py-[6px] text-[12px] font-bold">
              <span className="block h-[7px] w-[7px] rounded-pill bg-link" />
              {t('start.kicker')}
            </span>
            {/* the headline's long compound carries a soft hyphen, so a phone breaks it rather than the page */}
            <h1 className="mt-[19px] max-w-[17ch] font-display text-[clamp(34px,5.4vw,52px)] font-semibold leading-[1.06] [overflow-wrap:break-word] [text-wrap:balance]">
              {t('start.headline')}
            </h1>
            <p className="mt-[17px] max-w-[52ch] text-[16.5px] leading-[1.65] text-body [text-wrap:pretty]">
              {t('start.lead')}
            </p>

            <div className="mt-[24px]">
              <SignupStart label={t('seo.signup.label')} submit={t('seo.signup.submit')} invalid={t('seo.signup.invalid')} />
            </div>
            <p className="mb-0 mt-[12px] flex flex-wrap items-baseline gap-x-[14px] gap-y-[4px] text-[13px] text-mut">
              <span>{t('seo.common.priceFrom')}</span>
              <a href="#how" className="inline-flex min-h-[44px] items-center font-semibold underline decoration-[1px] underline-offset-[3px]">
                {t('start.ctaHow')}
              </a>
            </p>

            <div className="mt-[17px] flex flex-wrap gap-[7px]">
              {TRUST.map((k) => (
                <span
                  key={k}
                  className="flex items-center gap-[7px] rounded-pill border border-line bg-sf px-[12px] py-[7px] text-[12.5px] font-medium"
                >
                  <Tick />
                  {t(`start.trust.${k}`)}
                </span>
              ))}
            </div>
          </div>

          <div className="min-w-0">
            <div
              data-product
              className="overflow-hidden rounded-[22px] border border-line bg-sf shadow-[0_18px_40px_-28px_rgba(25,21,16,.35)]"
            >
              <div className="flex items-center gap-[8px] border-b border-line px-[18px] py-[11px]">
                <span className="block h-[9px] w-[9px] rounded-pill bg-line" />
                <span className="block h-[9px] w-[9px] rounded-pill bg-line" />
                <span className="block h-[9px] w-[9px] rounded-pill bg-line" />
                <span className="ml-[6px] text-[11.5px] text-mut">{t('start.mockCaption')}</span>
              </div>
              <div className="px-[24px] pb-[24px] pt-[22px]">
                <span className="block text-[11px] uppercase tracking-[0.11em] text-mut">
                  {t('start.mockIndexLabel')}
                </span>
                <span className="mt-[8px] flex flex-wrap items-end gap-[14px]">
                  <span className="font-display text-[56px] font-semibold leading-[0.85]">61</span>
                  <span className="pb-[8px]">
                    <span className="block text-[13.5px] font-bold text-danger">
                      {t('start.mockDelta')}
                    </span>
                    <span className="mt-[2px] block text-[12px] text-mut">
                      {t('start.mockPrev')}
                    </span>
                  </span>
                </span>
                <span className="mt-[18px] flex h-[26px] gap-[3px] overflow-hidden rounded-[8px]">
                  <span className="block flex-[4] bg-mint" />
                  <span className="block flex-[5] bg-band" />
                  <span className="block flex-[2] bg-peach2" />
                </span>
                <span className="mt-[7px] flex justify-between gap-[10px] text-[11px] text-mut">
                  <span>{t('start.mockBandLow')}</span>
                  <span>{t('start.mockBandMid')}</span>
                  <span>{t('start.mockBandHigh')}</span>
                </span>

                <span className="mt-[20px] block border-t border-line pt-[18px] text-[11px] uppercase tracking-[0.11em] text-mut">
                  {t('start.mockDoThree')}
                </span>
                <span className="mt-[11px] flex flex-col gap-[7px]">
                  {PEEK.map((p) => (
                    <span
                      key={p.n}
                      className="flex items-center gap-[11px] rounded-btn border border-line bg-bg px-[13px] py-[11px]"
                    >
                      <span className="flex h-[23px] w-[23px] flex-none items-center justify-center rounded-pill bg-ink text-[11.5px] font-bold text-bg">
                        {p.n}
                      </span>
                      <span className="min-w-0 flex-1 text-[13px] font-semibold">
                        {t(`start.peek.${p.key}`)}
                      </span>
                      <span className="flex-none text-[13px] font-bold text-link">{p.lift}</span>
                    </span>
                  ))}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------ pains */}
      <Section eyebrow={t('start.whyEyebrow')}>
        <h2 className="mt-[9px] max-w-[26ch] font-display text-[clamp(26px,3.6vw,34px)] font-semibold leading-[1.14] [text-wrap:balance]">
          {t('start.whyTitle')}
        </h2>
        <div className="mt-[22px] grid gap-[13px] [grid-template-columns:repeat(auto-fit,minmax(min(255px,100%),1fr))]">
          {PAINS.map((k) => (
            <div key={k} className="rounded-note border border-line bg-sf px-[23px] py-[22px]">
              <span className="block text-[15.5px] font-bold leading-[1.35] [text-wrap:pretty]">
                {t(`start.pain.${k}.title`)}
              </span>
              <span className="mt-[8px] block text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">
                {t(`start.pain.${k}.body`)}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------ steps */}
      <div id="how" className="mx-auto max-w-[1120px] px-[26px] pt-[54px]">
        <span className="block text-[11px] uppercase tracking-[0.12em] text-mut">
          {t('start.howEyebrow')}
        </span>
        <h2 className="mt-[9px] max-w-[24ch] font-display text-[clamp(26px,3.6vw,34px)] font-semibold leading-[1.14] [text-wrap:balance]">
          {t('start.howTitle')}
        </h2>
        <p className="mt-[11px] max-w-[60ch] text-[15px] leading-[1.65] text-mut [text-wrap:pretty]">
          {t('start.howLead')}
        </p>
        <div className="mt-[24px] grid gap-[13px] [grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr))]">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className={`flex flex-col gap-[10px] rounded-note px-[23px] py-[22px] ${
                s.accent ? 'border-2 border-ink bg-sbg' : 'border border-line bg-sf'
              }`}
            >
              <span className="flex items-center gap-[10px]">
                <span className="flex h-[29px] w-[29px] flex-none items-center justify-center rounded-pill bg-ink text-[13px] font-bold text-bg">
                  {s.n}
                </span>
                <span className="text-[16px] font-bold">{t(`start.step.${s.key}.title`)}</span>
              </span>
              <span className="text-[13.5px] leading-[1.6] text-body [text-wrap:pretty]">
                {t(`start.step.${s.key}.body`)}
              </span>
              <span className="mt-auto pt-[10px] text-[12px] font-bold text-mut">
                {t(`start.step.${s.key}.time`)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ----------------------------------------------------------- product */}
      <Section eyebrow={t('seo.home.showcase.eyebrow')}>
        <h2 className="mt-[9px] max-w-[26ch] font-display text-[clamp(26px,3.6vw,34px)] font-semibold leading-[1.14] [text-wrap:balance]">
          {t('seo.home.showcase.title')}
        </h2>
        <p className="mt-[11px] max-w-[60ch] text-[15px] leading-[1.65] text-mut [text-wrap:pretty]">
          {t('seo.home.showcase.lead')}
        </p>
        <div className="mt-[24px] flex flex-col gap-[13px]">
          <ShowcaseWide id="oversikt" more />
          <ShowcasePair ids={SHOWCASE_PAIRS[0]} />
          <ShowcaseWide id="sporsmal" />
          <ShowcasePair ids={SHOWCASE_PAIRS[1]} />
        </div>
      </Section>

      {/* ---------------------------------------------------------- for hvem */}
      <Section eyebrow={t('seo.forWho.eyebrow')}>
        <h2 className="mt-[9px] max-w-[24ch] font-display text-[clamp(26px,3.6vw,34px)] font-semibold leading-[1.14] [text-wrap:balance]">
          {t('seo.forWho.title')}
        </h2>
        <div className="mt-[22px] grid gap-[13px] [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
          {LANDING_PAGES.map((slug) => (
            <Link
              key={slug}
              href={`/${slug}` as Route}
              className="group flex flex-col gap-[8px] rounded-note border border-line bg-sf px-[23px] py-[22px] text-ink no-underline hover:border-ink hover:text-ink hover:no-underline"
            >
              <span className="text-[15.5px] font-bold leading-[1.35] [text-wrap:pretty] group-hover:underline">
                {t(`seo.lp.${landingKey(slug)}.card.title`)}
              </span>
              <span className="text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">
                {t(`seo.lp.${landingKey(slug)}.card.text`)}
              </span>
            </Link>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------ diffs */}
      <Section eyebrow={t('start.diffEyebrow')}>
        <h2 className="mt-[9px] max-w-[22ch] font-display text-[clamp(26px,3.6vw,34px)] font-semibold leading-[1.14] [text-wrap:balance]">
          {t('start.diffTitle')}
        </h2>
        <div className="mt-[22px] flex flex-col gap-[12px]">
          {DIFFS.map((k) => (
            <div
              key={k}
              className="grid items-start gap-[20px] rounded-panel border border-line bg-sf px-[26px] py-[24px] [grid-template-columns:repeat(auto-fit,minmax(min(262px,100%),1fr))]"
            >
              <span className="min-w-0">
                <span className="block font-display text-[22px] font-semibold leading-[1.2] [text-wrap:balance]">
                  {t(`start.diff.${k}.title`)}
                </span>
                <span className="mt-[7px] block text-[12.5px] font-bold text-mut">
                  {t(`start.diff.${k}.tag`)}
                </span>
              </span>
              <span className="min-w-0 text-[14px] leading-[1.65] [text-wrap:pretty]">
                {t(`start.diff.${k}.body`)}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------- law */}
      <div className="mx-auto max-w-[1120px] px-[26px] pt-[54px]">
        <div className="rounded-card border border-line bg-sf p-[clamp(24px,3.4vw,34px)]">
          <div className="grid items-start gap-[26px] [grid-template-columns:repeat(auto-fit,minmax(min(272px,100%),1fr))]">
            <div className="min-w-0">
              <span className="block text-[11px] uppercase tracking-[0.12em] text-mut">
                {t('start.lawEyebrow')}
              </span>
              <h2 className="mt-[9px] max-w-[20ch] font-display text-[clamp(24px,3.2vw,30px)] font-semibold leading-[1.15] [text-wrap:balance]">
                {t('start.lawTitle')}
              </h2>
              <p className="mt-[12px] max-w-[50ch] text-[14.5px] leading-[1.65] text-body [text-wrap:pretty]">
                {t('start.lawBody')}
              </p>
              <p className="mt-[11px] max-w-[50ch] text-[13px] leading-[1.6] text-mut [text-wrap:pretty]">
                {t('start.lawNote')}
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-[9px]">
              {LEGAL.map((k) => (
                <span
                  key={k}
                  className="grid items-baseline gap-[13px] rounded-cta border border-line bg-bg px-[15px] py-[13px] [grid-template-columns:90px_minmax(0,1fr)]"
                >
                  <LawRef text={t(`start.legal.${k}.ref`)} className="text-[12px] font-bold" />
                  <span className="text-[13px] leading-[1.5] [text-wrap:pretty]">
                    {t(`start.legal.${k}.what`)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------- quotes */}
      <div className="mx-auto max-w-[1120px] px-[26px] pt-[54px]">
        <div className="grid gap-[13px] [grid-template-columns:repeat(auto-fit,minmax(min(255px,100%),1fr))]">
          {QUOTES.map((k) => (
            <div
              key={k}
              className="flex flex-col gap-[9px] rounded-panel border border-line bg-sf px-[25px] py-[24px]"
            >
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-mut">
                {t(`start.quote.${k}.who`)}
              </span>
              <span className="font-display text-[19px] font-semibold leading-[1.25] [text-wrap:balance]">
                {t(`start.quote.${k}.title`)}
              </span>
              <span className="text-[13px] leading-[1.6] text-body [text-wrap:pretty]">
                {t(`start.quote.${k}.body`)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------ price */}
      <div id="pris" />
      <Section eyebrow={t('start.priceEyebrow')}>
        <h2 className="mt-[9px] max-w-[24ch] font-display text-[clamp(26px,3.6vw,34px)] font-semibold leading-[1.14] [text-wrap:balance]">
          {t('start.priceTitle')}
        </h2>
        <p className="mt-[11px] max-w-[58ch] text-[15px] leading-[1.65] text-mut [text-wrap:pretty]">
          {t('start.priceLead')}
        </p>
        <Plans />
        <p className="mt-[13px] text-[12.5px] text-mut">{t('start.priceNote')}</p>
      </Section>

      {/* -------------------------------------------------------------- faq */}
      <Section eyebrow={t('start.faqEyebrow')}>
        <Faq items={faq} />
      </Section>

      {/* ---------------------------------------------------------- articles */}
      <Section eyebrow={t('seo.home.articlesEyebrow')}>
        <h2 className="mt-[9px] max-w-[26ch] font-display text-[clamp(26px,3.6vw,34px)] font-semibold leading-[1.14] [text-wrap:balance]">
          {t('seo.home.articlesTitle')}
        </h2>
        <ArticleCards slugs={ARTICLES.slice(0, 3).map((a) => a.slug)} />
        <Link href={'/artikler' as Route} className="mt-[6px] inline-flex min-h-[44px] items-center text-[14px] font-semibold">
          {t('seo.home.articlesAll')}
        </Link>
      </Section>

      {/* --------------------------------------------------------- final cta */}
      <div className="mx-auto max-w-[1120px] px-[26px] pt-[54px]">
        <div className="rounded-[22px] bg-ink p-[clamp(28px,4vw,44px)] text-bg">
          <div className="grid items-center gap-[26px] [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
            <div className="min-w-0">
              <h2 className="m-0 max-w-[22ch] font-display text-[clamp(25px,3.4vw,33px)] font-semibold leading-[1.14] [text-wrap:balance]">
                {t('start.finalTitle')}
              </h2>
              <p className="mt-[13px] max-w-[48ch] text-[15px] leading-[1.65] opacity-[0.78] [text-wrap:pretty]">
                {t('start.finalBody')}
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-[11px]">
              <Link
                href="/registrer"
                className="inline-flex h-[52px] items-center justify-center rounded-tile border border-ac bg-ac text-[16.5px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
              >
                {t('start.ctaFree')}
              </Link>
              <Link
                href="/logg-inn"
                className="inline-flex h-[48px] items-center justify-center rounded-tile border border-bg/[0.35] bg-transparent text-[15px] font-semibold text-bg no-underline hover:text-bg hover:no-underline"
              >
                {t('start.ctaHaveAccount')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
