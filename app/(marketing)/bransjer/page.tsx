import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { industryCards } from '@/components/industry/IndustryCards'
import { JsonLd } from '@/components/marketing/JsonLd'
import { SiteTop } from '@/components/site/v3/SiteTop'
import { StartBand } from '@/components/site/v3/StartBand'
import { getIndustry, pageIn } from '@/content/industries'
import { INDUSTRY_META } from '@/content/industries/meta'
import { moduleFacts, moduleFile } from '@/content/industries/modules'
import { pageMeta } from '@/lib/marketing/meta'
import { breadcrumbs, graph, organization } from '@/lib/marketing/schema'

/**
 * /bransjer (D-125, D-190): design-reference/orgpuls/nettside-v3/Bransjer.dc.html, with the v3
 * decision sheet's words (`site.bransjer`). The hero in the mint top band, the industry modules,
 * «Samme verktøy, ulike hverdager», and the start band.
 *
 * The module cards are the industry registry's (content/industries): the industries whose address
 * shows a page in the site's language, in the registry's order, «Ny» for 90 days after launch. Each
 * card's figures are read from its module file (a module in variants prints the range from the
 * simplified to the extended set), its words are `site.bransjer.cards` by slug, and its id (the
 * footer's `/bransjer#…`) is the registry's `anchor`. A new industry is an entry there and a card in
 * the messages; nothing here changes. Only «Se … →» is a link, to the industry page, stretched over
 * the card (B-01).
 *
 * The cards lie in rows of three; a remainder leads as a row of wider cards. With the design's five,
 * that is its two (min 340px) over three (min 240px).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('seo.pages.bransjer')
  return pageMeta({ title: t('title'), description: t('description'), path: '/bransjer' })
}

/** The hero's three tiles: decorative glyphs, the words in `site.bransjer.how` */
const HOW = [
  { key: 'pastander', glyph: '＋' },
  { key: 'tiltak', glyph: '✓' },
  { key: 'hjemmel', glyph: '§' },
] as const

/** «Ulike hverdager»: each sector with the instrument's factors often worth watching there (R4: `factor.<id>.name`) */
const SECTORS = [
  { key: 'bygg', factors: ['ytring', 'mengde'] },
  { key: 'helse', factors: ['emosjon', 'leder'] },
  { key: 'handel', factors: ['rolle', 'mening'] },
  { key: 'kommune', factors: ['motstrid', 'medvirk'] },
  { key: 'teknologi', factors: ['rolle', 'mengde'] },
  { key: 'industri', factors: ['ytring', 'kollega'] },
] as const

const EYEBROW = 'text-[11px] font-bold uppercase tracking-[0.12em]'
/** Section H2 (38px; 30px on a phone, G4.2) */
const H2 = 'm-0 font-display text-[38px] font-semibold leading-[1.1] [text-wrap:balance] [overflow-wrap:break-word] max-sm:text-[30px] max-sm:leading-[1.12]'

export default async function BransjerPage() {
  const [t, tc, tf, newLabel] = await Promise.all([
    getTranslations('site.bransjer'),
    getTranslations('site.chrome'),
    getTranslations('factor'),
    getTranslations('site.home.industries').then((x) => x('new')),
  ])
  const lang = (await getLocale()) === 'en' ? 'en' : 'no'
  const cards = (await industryCards()).map((c) => {
    const page = pageIn(getIndustry(c.slug), lang) ?? pageIn(getIndustry(c.slug), 'no')
    const facts = page?.module ? moduleFacts(moduleFile(page.module.key, lang)) : null
    return { ...c, facts, anchor: INDUSTRY_META.find((m) => m.slug === c.slug)?.anchor ?? c.slug }
  })
  const lead = cards.length % 3
  const span = (i: number) => (i >= lead ? 'lg:col-span-2' : lead === 1 ? 'sm:col-span-2 lg:col-span-6' : 'lg:col-span-3')

  return (
    <>
      <JsonLd
        data={graph(
          organization(),
          breadcrumbs([
            { name: 'Orgpuls', path: '/' },
            { name: t('crumb'), path: '/bransjer' },
          ]),
        )}
      />
      <SiteTop>
        <section
          data-screen-label="Hero"
          className="w-full max-w-[1240px] self-center px-[56px] pt-[40px] motion-safe:[animation:ht-in_.25s_ease_both] max-sm:px-0 max-sm:pt-[32px]"
        >
          <nav aria-label={tc('crumbs')}>
            <ol className="m-0 flex list-none gap-[8px] p-0 text-[13px] text-body">
              <li>
                <Link href="/" className="text-body hover:text-body">
                  Orgpuls
                </Link>
              </li>
              <li aria-current="page" className="flex gap-[8px]">
                <span aria-hidden="true">›</span>
                {t('crumb')}
              </li>
            </ol>
          </nav>
          <div className="mt-[22px] grid items-end gap-x-[48px] gap-y-[24px] [grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr))]">
            <div>
              <span className={`inline-block rounded-[9px] bg-ink px-[12px] py-[7px] text-bg ${EYEBROW}`}>{t('crumb')}</span>
              <h1 className="m-0 mt-[22px] font-display text-[56px] font-semibold leading-[1.04] tracking-[-0.01em] [text-wrap:balance] [overflow-wrap:break-word] max-sm:text-[40px] max-sm:leading-[1.08] max-[359px]:text-[34px]">
                {t('h1')}
              </h1>
            </div>
            <div>
              <p className="m-0 max-w-[50ch] text-[17px] leading-[1.65] text-body [text-wrap:pretty]">{t('lead')}</p>
              <div className="mt-[22px] flex flex-wrap items-center gap-x-[26px] gap-y-[10px]">
                <a
                  href="#kom-i-gang"
                  className="flex min-h-[50px] items-center gap-[9px] rounded-[13px] border border-ink bg-ac px-[22px] text-[15.5px] font-bold text-ink hover:text-ink"
                >
                  {tc('trial')} <span aria-hidden="true">→</span>
                </a>
                <a href="#moduler" className="text-[15.5px] font-bold">
                  {t('toModules')} <span aria-hidden="true">↓</span>
                </a>
              </div>
            </div>
          </div>
          <ul className="m-0 mt-[44px] grid list-none gap-[10px] p-0 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
            {HOW.map((w) => (
              <li key={w.key} className="flex items-start gap-[12px] rounded-note border border-line bg-sf px-[16px] py-[14px]">
                <span
                  aria-hidden="true"
                  className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-pill bg-track text-[13px] font-bold"
                >
                  {w.glyph}
                </span>
                <span>
                  <span className="block text-[14.5px] font-bold">{t(`how.${w.key}.t`)}</span>
                  <span className="mt-[2px] block text-[12.5px] leading-[1.45] text-body [text-wrap:pretty]">{t(`how.${w.key}.d`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </SiteTop>

      <section
        id="moduler"
        data-screen-label="Bransjemoduler"
        className="mx-auto w-full max-w-[1240px] scroll-mt-[24px] px-[56px] pb-[56px] pt-[72px] max-sm:px-[16px] max-sm:pb-[40px] max-sm:pt-[48px]"
      >
        <div className="flex flex-col gap-[12px]">
          <span className={`${EYEBROW} text-mut`}>{t('modules.k')}</span>
          <h2 className={`${H2} max-w-[26ch]`}>{t('modules.title', { count: cards.length })}</h2>
        </div>
        <ul className="m-0 mt-[32px] grid list-none grid-cols-1 gap-[13px] p-0 sm:grid-cols-2 lg:grid-cols-6">
          {cards.map((c, i) => (
            <li
              key={c.slug}
              id={c.anchor}
              className={`relative flex scroll-mt-[24px] flex-col gap-[12px] rounded-card border border-line bg-sf px-[24px] pb-[22px] pt-[24px] ${span(i)}`}
            >
              <span className="flex items-center justify-between gap-[10px]">
                <span className={`${EYEBROW} text-mut`}>{c.k}</span>
                {c.isNew ? <span className="rounded-pill bg-ac px-[10px] py-[3px] text-[11.5px] font-bold">{newLabel}</span> : null}
              </span>
              <h3 className="m-0 font-display text-[28px] font-semibold leading-[1.1] [overflow-wrap:break-word] max-sm:text-[24px]">{c.t}</h3>
              <ul aria-label={t('modules.topics')} className="m-0 flex list-none flex-wrap gap-[6px] p-0">
                {c.topics.map((tp) => (
                  <li key={tp} className="rounded-pill border border-line bg-bg px-[11px] py-[5px] text-[12.5px] font-semibold">
                    {tp}
                  </li>
                ))}
              </ul>
              {c.extra ? <p className="m-0 text-[13.5px] leading-[1.5] text-body">{c.extra}</p> : null}
              <span className="mt-auto flex flex-wrap items-center justify-between gap-x-[14px] gap-y-[8px] border-t border-line pt-[14px]">
                {c.facts ? <span className="text-[12.5px] tabular-nums text-mut">{t('facts', c.facts)}</span> : null}
                <Link
                  href={`/${c.slug}` as Route}
                  className="text-[14px] font-bold text-link after:absolute after:inset-0 after:rounded-card after:content-['']"
                >
                  {c.cta} <span aria-hidden="true">→</span>
                </Link>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section data-screen-label="Ulike hverdager" className="border-y border-line bg-sf">
        <div className="mx-auto grid max-w-[1240px] items-start gap-x-[64px] gap-y-[40px] px-[56px] py-[72px] [grid-template-columns:repeat(auto-fit,minmax(min(380px,100%),1fr))] max-sm:px-[16px] max-sm:py-[48px]">
          <div>
            <span className={`${EYEBROW} text-mut`}>{t('other.k')}</span>
            <h2 className={`${H2} mt-[12px] max-w-[20ch]`}>{t('other.title')}</h2>
            <p className="m-0 mt-[14px] max-w-[46ch] text-[16px] leading-[1.65] text-body [text-wrap:pretty]">{t('other.p')}</p>
            <p className="m-0 mt-[14px] max-w-[46ch] text-[14.5px] leading-[1.65] text-body [text-wrap:pretty]">
              {t.rich('other.d', {
                link: (chunks) => (
                  <Link href="/bruksomrader" className="underline underline-offset-2">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </div>
          <ul className="m-0 flex list-none flex-col p-0">
            {SECTORS.map((s) => (
              <li
                key={s.key}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-[18px] gap-y-[6px] border-t border-line py-[18px] max-sm:grid-cols-1"
              >
                <h3 className="m-0 text-[16px] font-bold">{t(`other.sectors.${s.key}.t`)}</h3>
                <span className="sr-only">{t('other.factors')}</span>
                <ul className="m-0 flex list-none flex-wrap justify-end gap-[6px] p-0 max-sm:justify-start">
                  {s.factors.map((f) => (
                    <li key={f} className="rounded-pill bg-sbg px-[10px] py-[4px] text-[12px] font-bold text-cautiondeep">
                      {tf(`${f}.name`)}
                    </li>
                  ))}
                </ul>
                <p className="col-span-full m-0 max-w-[60ch] text-[14px] leading-[1.55] text-body [text-wrap:pretty]">{t(`other.sectors.${s.key}.d`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <StartBand />
    </>
  )
}
