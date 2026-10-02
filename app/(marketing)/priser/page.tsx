import type { Metadata } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { JsonLd } from '@/components/marketing/JsonLd'
import { Tick } from '@/components/site/parts'
import { Faq } from '@/components/site/v3/pris/Faq'
import { FitBadge, FitCard, FitCta, FitSize, SizeProvider, SizeSlider } from '@/components/site/v3/pris/Size'
import { SiteTop } from '@/components/site/v3/SiteTop'
import { StartBand } from '@/components/site/v3/StartBand'
import { FaqItems } from '@/lib/marketing/blocks'
import { pageMeta } from '@/lib/marketing/meta'
import { breadcrumbs, faqPage, graph, ldLanguage, organization, software } from '@/lib/marketing/schema'
import { absolute } from '@/lib/marketing/site'
import { PLAN_SIZES } from '@/lib/site/pricing'

/**
 * Pris (D-190): design-reference/orgpuls/nettside-v3/Pris.dc.html. «Fra 265 kr i måneden. Alt
 * inkludert.», the headcount slider over the three plans, the ink band of what every plan holds, the
 * questions small businesses ask, and the start band. Desktop is the design's, value for value;
 * below 640px the decision sheet's phone rules (16px gutters, a 40/34px H1, the size row a column).
 *
 * The words are `seo.pages.priser` (the hero and the questions, which the FAQPage data repeats) and
 * `site.pris` (the rest); the prices and limits the slider computes with are lib/site/pricing, the
 * numbers billing keeps (0048).
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return pageMeta({ title: t('seo.pages.priser.title'), description: t('seo.pages.priser.description'), path: '/priser' })
}

const Plan = z.object({ name: z.string(), who: z.string(), price: z.string(), unit: z.string().optional(), items: z.array(z.string()), cta: z.string() })
const Size = z.object({ name: z.string(), range: z.string(), price: z.string() })
const Group = z.object({ t: z.string(), items: z.array(z.string()) })

/** The plan cards' buttons: the trial for the two self-serve plans, a conversation for the group (G8) */
const CTA = ['#kom-i-gang', '#kom-i-gang', '/kontakt#skriv'] as const
/** The ink band's group tiles, decorative (G-15): Måling, Resultater, Oppfølging, Dokumentasjon, Roller og hjelp */
const GLYPHS = ['◷', '▤', '✓', '§', '◉'] as const

export default async function PrisPage() {
  const t = await getTranslations('site.pris')
  const seo = await getTranslations('seo')
  const chrome = await getTranslations('site.chrome')

  const plans = z.array(Plan).length(PLAN_SIZES.length).parse(t.raw('plans'))
  const sizes = z.array(Size).length(PLAN_SIZES.length).parse(t.raw('included.sizes'))
  const groups = z.array(Group).length(GLYPHS.length).parse(t.raw('included.groups'))
  const faq = FaqItems.parse(seo.raw('pages.priser.faq'))
  const crumb = seo('pages.priser.crumb')

  return (
    <SizeProvider>
      <JsonLd
        data={graph(
          organization(),
          {
            '@type': 'WebPage',
            url: absolute('/priser'),
            name: seo('pages.priser.title'),
            description: seo('pages.priser.description'),
            inLanguage: ldLanguage(await getLocale()),
          },
          breadcrumbs([
            { name: seo('common.home'), path: '/' },
            { name: crumb, path: '/priser' },
          ]),
          // the questions below, word for word
          faqPage(faq),
          software(seo('home.description')),
        )}
      />

      <SiteTop>
        <section
          data-screen-label="Hero"
          className="w-full max-w-[1240px] self-center px-[56px] pt-[40px] motion-safe:animate-[ht-in_.25s_ease_both] max-sm:px-0 max-sm:pt-[32px]"
        >
          {/* G-21 */}
          <nav aria-label={chrome('crumbs')} className="text-[13px] text-body">
            <ol className="m-0 flex list-none gap-[8px] p-0">
              <li>
                <Link href="/" className="text-body hover:text-body">
                  Orgpuls
                </Link>
              </li>
              <li aria-current="page" className="flex gap-[8px]">
                <span aria-hidden="true">›</span>
                <span>{crumb}</span>
              </li>
            </ol>
          </nav>
          <div className="mt-[22px] grid items-end gap-x-[48px] gap-y-[24px] [grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr))]">
            <div>
              <span className="inline-block rounded-bar bg-ink px-[12px] py-[7px] text-[11px] font-bold uppercase tracking-[.12em] text-bg">
                {seo('pages.priser.kicker')}
              </span>
              <h1 className="m-0 mt-[22px] font-display text-[56px] font-semibold leading-[1.04] tracking-[-.01em] [overflow-wrap:break-word] [text-wrap:balance] max-sm:text-[40px] max-sm:leading-[1.08] max-[359px]:text-[34px]">
                {seo('pages.priser.h1')}
              </h1>
            </div>
            <div>
              <p className="m-0 max-w-[50ch] text-[17px] leading-[1.65] text-body [text-wrap:pretty]">{seo('pages.priser.lead')}</p>
            </div>
          </div>

          <SizeSlider
            w={{
              label: t('size.label'),
              number: t('size.number'),
              valuetext: t.raw('size.valuetext') as string,
              valuetextGroup: t.raw('size.valuetextGroup') as string,
              readout: t.raw('size.readout') as string,
              readoutGroup: t.raw('size.readoutGroup') as string,
              plans: plans.map((p) => p.name),
            }}
          />

          <ul className="m-0 mt-[13px] grid list-none items-stretch gap-[13px] p-0 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
            {plans.map((p, i) => (
              <FitCard key={p.name} i={i}>
                <div className="flex flex-wrap items-center justify-between gap-[10px]">
                  {/* R-04 */}
                  <h2 id={`plan-${i}`} className="m-0 text-[17px] font-bold">
                    {p.name}
                  </h2>
                  <FitBadge i={i} label={t('fits')} />
                </div>
                <span className="text-[13px] text-mut">{p.who}</span>
                <span className="flex flex-wrap items-baseline gap-[7px]">
                  <span className="font-display text-[40px] font-semibold leading-none">{p.price}</span>
                  <span className="text-[13px] text-mut">{p.unit ?? ''}</span>
                </span>
                <ul className="m-0 mt-[4px] flex flex-1 list-none flex-col gap-[8px] p-0">
                  {p.items.map((it) => (
                    <li key={it} className="flex items-start gap-[9px] text-[13.5px] leading-[1.5] [text-wrap:pretty]">
                      <Tick size={16} />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
                <FitCta i={i} href={CTA[i]!} describedBy={`plan-${i}`}>
                  {p.cta}
                </FitCta>
              </FitCard>
            ))}
          </ul>
          <p className="m-0 mt-[14px] text-[12.5px] text-body">{t('footnote')}</p>
        </section>
      </SiteTop>

      <section
        data-screen-label="Inkludert"
        className="mx-auto w-full max-w-[1240px] px-[18px] pb-[24px] pt-[72px] max-sm:px-[16px] max-sm:pt-[48px]"
      >
        <div className="rounded-[24px] bg-ink px-[40px] pb-[44px] pt-[56px] text-bg max-sm:px-[18px] max-sm:pb-[32px] max-sm:pt-[40px]">
          <div className="grid items-end gap-x-[56px] gap-y-[28px] [grid-template-columns:repeat(auto-fit,minmax(min(380px,100%),1fr))]">
            <div>
              <span className="inline-flex items-center gap-[7px] rounded-pill bg-ac px-[13px] py-[6px] text-[12px] font-bold text-ink">
                <span aria-hidden="true">✓</span> {t('included.eyebrow')}
              </span>
              <h2 className="m-0 mt-[18px] max-w-[20ch] font-display text-[42px] font-semibold leading-[1.08] [text-wrap:balance] max-sm:text-[30px] max-sm:leading-[1.12]">
                {t('included.title')}
              </h2>
            </div>
            <p className="m-0 max-w-[46ch] text-[16px] leading-[1.65] opacity-80 [text-wrap:pretty]">{t('included.lead')}</p>
          </div>

          {/* R-05 */}
          <ul className="m-0 mt-[40px] grid list-none grid-cols-3 overflow-hidden rounded-[16px] border border-[rgba(252,246,233,.22)] p-0 max-sm:grid-cols-1">
            {sizes.map((z, i) => (
              <FitSize key={z.name} i={i} sr={t('fitsSr')}>
                <span className="text-[11px] font-bold uppercase tracking-[.12em] opacity-75">{z.name}</span>
                <span className="font-display text-[24px] font-semibold leading-[1.1] tabular-nums">{z.range}</span>
                <span className="text-[13px] opacity-85">{z.price}</span>
              </FitSize>
            ))}
          </ul>

          {/* R-06 */}
          <div className="mt-[44px] grid gap-x-[20px] gap-y-[28px] [grid-template-columns:repeat(auto-fit,minmax(min(140px,100%),1fr))] max-sm:grid-cols-1">
            {groups.map((g, i) => (
              <div key={g.t} className="flex flex-col gap-[12px] border-t border-[rgba(252,246,233,.22)] pt-[16px]">
                <div className="flex items-center gap-[9px]">
                  <span
                    aria-hidden="true"
                    className="flex h-[28px] w-[28px] items-center justify-center rounded-bar bg-[rgba(252,246,233,.12)] text-[14px]"
                  >
                    {GLYPHS[i]}
                  </span>
                  <h3 className="m-0 text-[15px] font-bold">{g.t}</h3>
                </div>
                <ul className="m-0 flex list-none flex-col gap-[12px] p-0">
                  {g.items.map((it) => (
                    <li key={it} className="flex items-start gap-[9px] text-[13.5px] leading-[1.5] [text-wrap:pretty]">
                      <span aria-hidden="true" className="flex-none font-bold text-ac">
                        ✓
                      </span>
                      <span className="opacity-[.88]">{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        data-screen-label="Spørsmål"
        className="mx-auto grid w-full max-w-[1240px] items-start gap-x-[64px] gap-y-[24px] px-[56px] pb-[24px] pt-[56px] [grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))] max-sm:px-[16px] max-sm:pt-[40px]"
      >
        <div>
          <span className="text-[11px] font-bold uppercase tracking-[.12em] text-mut">{t('faq.eyebrow')}</span>
          <h2 className="m-0 mt-[12px] max-w-[18ch] font-display text-[38px] font-semibold leading-[1.1] [text-wrap:balance] max-sm:text-[30px] max-sm:leading-[1.12]">
            {t('faq.title')}
          </h2>
        </div>
        {/* R-07 */}
        <Faq items={faq} />
      </section>

      <StartBand />
    </SizeProvider>
  )
}
