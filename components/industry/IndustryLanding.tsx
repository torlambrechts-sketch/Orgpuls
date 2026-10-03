import type { Route } from 'next'
import Link from 'next/link'
import { Fragment } from 'react'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { Tick } from '@/components/site/parts'
import { SiteTop } from '@/components/site/v3/SiteTop'
import { StartBand } from '@/components/site/v3/StartBand'
import { Faq } from '@/components/site/v3/pris/Faq'
import type { IndustryLanding as Landing } from '@/content/industries/landing'
import { liveQuestionPages } from '@/content/industries'
import { moduleFacts, moduleFile } from '@/content/industries/modules'
import { ARTICLES } from '@/lib/marketing/site'
import { SHOTS } from '@/lib/marketing/shots'
import type { ShotId } from '@/lib/marketing/shot-ids'

/**
 * The industry landing page (D-207), drawn from its registry entry (content/industries/landing.ts)
 * and its messages (`site.bransje.<msg>`, `site.bransje.common`). No layout of its own exists in
 * the design, so every block is a v3 pattern, at the v3 values:
 *
 *   hero ............ Bransjer/Plattform hero in the mint band (crumbs, ink eyebrow, 56px H1, the
 *                     yellow «Prøv gratis i 15 dager →» and a text link), the Forside slide's
 *                     picture column, and Bransjer's three tiles under it
 *   tallene ......... Forside's ink band: pill, H2, four 52px figures
 *   hvorfor ......... Forside slide 2's law card (✓ rows), beside r20 cards
 *   utfordringer .... Forside's problem/solution cards (rust eyebrow, mint foot), two across, on
 *                     Bransjer's sf band
 *   slik ser det ut . Plattform's zigzag cases with a real screen in the browser frame
 *   steg ............ Forside's Sløyfen pillars
 *   anonymitet ...... ✓ rows in an r24 panel
 *   spørsmål ........ Pris' FAQ
 *   kom i gang ...... the shared start band
 *
 * Every figure carries a numbered marker to the source list at the foot (#kilde-<key>); the
 * registry, not the words, says which source, so the numbers cannot drift from the figures.
 */
const Str = z.string()
const Item = z.object({ t: Str, d: Str })
const Stat = z.object({ v: Str, l: Str })
const LawRow = z.object({ ref: Str, t: Str })
const Challenge = z.object({ t: Str, looks: Str, fig: Str, solve: Str })
const Block = z.object({ k: Str, h3: Str, ticks: z.array(Str).min(1), caption: Str })
const Qa = z.object({ q: Str, a: Str })

const COLUMN = 'mx-auto w-full max-w-[1240px] px-[56px] max-sm:px-[16px]'
const EYEBROW = 'text-[11px] font-bold uppercase tracking-[.12em]'
const H2 =
  'm-0 font-display text-[38px] font-semibold leading-[1.1] [overflow-wrap:break-word] [text-wrap:balance] max-sm:text-[30px] max-sm:leading-[1.12]'
const LEAD = 'm-0 text-[16px] leading-[1.65] text-body [text-wrap:pretty]'
const CTA =
  'items-center gap-[9px] rounded-tile border border-ink bg-ac px-[22px] text-[15.5px] font-bold text-ink no-underline hover:text-ink hover:no-underline'
const SHOT_SHADOW = 'shadow-[0_18px_40px_-28px_rgba(25,21,16,.35)]'

export async function IndustryLanding({ landing, lang }: { landing: Landing; lang: 'no' | 'en' }) {
  const [t, common, chrome, all] = await Promise.all([
    getTranslations(`site.bransje.${landing.msg}`),
    getTranslations('site.bransje.common'),
    getTranslations('site.chrome'),
    getTranslations(),
  ])
  const facts = moduleFacts(moduleFile(landing.module, lang))
  const fmt = (s: string) => s.replace('{factors}', facts.factors).replace('{statements}', facts.statements).replace('{minutes}', facts.minutes)

  const tiles = z.array(Item).length(3).parse(t.raw('hero.tiles'))
  const stats = z.array(Stat).length(landing.stats.items.length).parse(t.raw('stats.items'))
  const law = z.array(LawRow).min(1).parse(t.raw('why.law.rows'))
  const cost = z.array(Str).length(landing.why.costCites.length).parse(t.raw('why.cost.items'))
  const challenges = z.array(Challenge).length(landing.challenges.length).parse(t.raw('challenges.items'))
  const blocks = z.array(Block).length(landing.proof.length).parse(t.raw('proof.blocks'))
  const steps = z.array(Item).min(3).parse(t.raw('steps.items'))
  const trust = z.array(Item).min(1).parse(t.raw('trust.items'))
  const faq = z.array(Qa).length(landing.faqCount).parse(t.raw('faq.items'))
  const moduleNames = z.record(Str, Str).parse(t.raw('moduleFactors'))

  const number = new Map(landing.sources.map((s, i) => [s.key, i + 1]))
  const cites = (keys: string[], tone: 'ink' | 'cream' = 'ink') =>
    keys.length ? (
      <sup className="ml-[2px] whitespace-nowrap leading-none">
        {keys.map((k, j) => (
          <Fragment key={k}>
            {j ? ',' : null}
            <a
              href={`#kilde-${k}`}
              aria-label={common('sourceMark', { n: number.get(k) ?? 0 })}
              className={`px-[1px] text-[11px] font-bold no-underline hover:underline ${tone === 'cream' ? 'text-bg hover:text-bg' : 'text-link'}`}
            >
              {number.get(k)}
            </a>
          </Fragment>
        ))}
      </sup>
    ) : null

  const articles = landing.articles.flatMap((slug) => {
    const a = ARTICLES.find((x) => x.slug === slug)
    return a ? [{ href: `/artikler/${slug}`, label: all(`seo.articles.${a.key}.h1`) }] : []
  })
  // the question page exists in a language only where the industry's page there is launched (D-118);
  // it is drawn from the content file, so an English one follows from the module's translation (D-120)
  const questionPage = liveQuestionPages(lang).includes(landing.slug)
  const related = [...landing.related.map((r) => ({ href: r.href, label: t(`related.${r.key}`) })), ...articles]
    .filter((r) => questionPage || r.href !== `/${landing.slug}/sporsmal`)
  const hero = SHOTS[landing.heroShot].img

  return (
    <>
      {/* ------------------------------------------------------------------ hero */}
      <SiteTop>
        <section
          data-screen-label="Hero"
          className="w-full max-w-[1240px] self-center px-[56px] pt-[40px] motion-safe:[animation:ht-in_.25s_ease_both] max-sm:px-0 max-sm:pt-[32px]"
        >
          <nav aria-label={chrome('crumbs')}>
            <ol className="m-0 flex list-none flex-wrap gap-[8px] p-0 text-[13px] text-body">
              <li>
                <Link href="/" className="text-body hover:text-body">
                  Orgpuls
                </Link>
              </li>
              <li className="flex gap-[8px]">
                <span aria-hidden="true">›</span>
                <Link href="/bransjer" className="text-body hover:text-body">
                  {all('seo.pages.bransjer.crumb')}
                </Link>
              </li>
              <li aria-current="page" className="flex gap-[8px]">
                <span aria-hidden="true">›</span>
                {t('nav')}
              </li>
            </ol>
          </nav>
          <div className="mt-[22px] grid items-center gap-x-[56px] gap-y-[32px] [grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr))]">
            <div className="min-w-0 max-w-[620px]">
              <span className={`inline-block rounded-bar bg-ink px-[12px] py-[7px] text-bg ${EYEBROW}`}>{t('hero.k')}</span>
              <h1 className="m-0 mt-[22px] font-display text-[56px] font-semibold leading-[1.04] tracking-[-.01em] [hyphens:manual] [overflow-wrap:break-word] [text-wrap:balance] max-sm:text-[40px] max-sm:leading-[1.08] max-[359px]:text-[34px]">
                {t('hero.h1')}
              </h1>
              <p className="m-0 mt-[20px] max-w-[52ch] text-[17px] leading-[1.65] text-body [text-wrap:pretty]">{t('hero.lead')}</p>
              <div className="mt-[26px] flex flex-wrap items-center gap-x-[26px] gap-y-[12px]">
                <a href="#kom-i-gang" className={`flex min-h-[50px] ${CTA}`}>
                  {chrome('trial')} <span aria-hidden="true">→</span>
                </a>
                {questionPage ? (
                  <Link href={`/${landing.slug}/sporsmal` as Route} className="text-[15.5px] font-bold hover:no-underline">
                    {t('hero.secondary')} <span aria-hidden="true">→</span>
                  </Link>
                ) : (
                  <Link href="/demo" className="text-[15.5px] font-bold hover:no-underline">
                    {chrome('demo')} <span aria-hidden="true">→</span>
                  </Link>
                )}
              </div>
              <p className="m-0 mt-[16px] text-[13px] text-mut">{all('site.home.risk')}</p>
            </div>
            <figure className="m-0 min-w-0" aria-labelledby="hero-shot-title">
              <div className={`mx-auto max-w-[420px] rounded-card border border-line bg-sf px-[24px] py-[22px] ${SHOT_SHADOW} max-sm:px-[16px] max-sm:py-[18px]`}>
                <div className="mb-[16px] flex flex-wrap items-baseline justify-between gap-x-[12px] gap-y-[6px]">
                  <span id="hero-shot-title" className="text-[15px] font-bold">
                    {t('hero.figure.title')}
                  </span>
                  <span className="text-[12.5px] text-mut">{fmt(t.raw('hero.figure.meta') as string)}</span>
                </div>
                <div className="mx-auto max-w-[300px] overflow-hidden rounded-[13px] border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element -- eager and sized, as the v3 pages draw shots (D-190 §21) */}
                  <img
                    src={hero.src}
                    width={hero.width}
                    height={hero.height}
                    alt={all(`seo.shots.${landing.heroShot}.alt`)}
                    fetchPriority="high"
                    className="block h-auto w-full"
                  />
                </div>
              </div>
              <figcaption className="mx-auto mt-[14px] max-w-[420px] text-[14px] leading-[1.6] text-body [text-wrap:pretty]">
                <strong className="text-greendeep">{t('hero.figure.caption')}</strong> {common('realShot')}
              </figcaption>
            </figure>
          </div>
          <ul className="m-0 mt-[44px] grid list-none gap-[10px] p-0 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
            {tiles.map((w, i) => (
              <li key={w.t} className="flex items-start gap-[12px] rounded-note border border-line bg-sf px-[16px] py-[14px]">
                <span
                  aria-hidden="true"
                  className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-pill bg-track text-[13px] font-bold"
                >
                  {['＋', '◷', '§'][i]}
                </span>
                <span>
                  <span className="block text-[14.5px] font-bold">{fmt(w.t)}</span>
                  <span className="mt-[2px] block text-[12.5px] leading-[1.45] text-body [text-wrap:pretty]">{fmt(w.d)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </SiteTop>

      <div className="flex flex-col gap-[18px] px-[18px] pt-[18px] max-sm:px-0">
        {/* ------------------------------------------------------------ the figures */}
        <section
          id="tallene"
          data-screen-label="Tallene"
          aria-labelledby="tallene-h"
          className="w-full max-w-[1240px] self-center rounded-[24px] border border-line bg-ink px-[56px] py-[72px] text-bg max-sm:mx-[16px] max-sm:w-auto max-sm:self-stretch max-sm:px-[18px] max-sm:py-[48px]"
        >
          <div className="flex flex-col items-center gap-[14px] text-center">
            <span className="inline-flex items-center gap-[7px] rounded-pill bg-ac px-[13px] py-[6px] text-[12px] font-bold text-ink">
              <span aria-hidden="true">▤</span> {t('stats.k')}
            </span>
            <h2 id="tallene-h" className={`${H2} max-w-[24ch]`}>
              {t('stats.title')}
            </h2>
            <p className="m-0 max-w-[58ch] text-[16px] leading-[1.65] opacity-[.78] [text-wrap:pretty]">
              {t('stats.lead')}
              {cites(landing.stats.leadCites, 'cream')}
            </p>
          </div>
          <ul className="m-0 mt-[52px] grid list-none gap-[13px] p-0 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
            {stats.map((s, i) => (
              <li key={s.v + s.l} className="px-[12px] py-[10px] text-center">
                <span className="block font-display text-[52px] font-semibold leading-none tabular-nums max-sm:text-[44px]">{s.v}</span>{' '}
                <span className="mx-auto mt-[12px] block max-w-[24ch] text-[15px] leading-[1.5] [text-wrap:balance]">
                  <span className="opacity-[.78]">{s.l}</span>
                  {cites(landing.stats.items[i] ?? [], 'cream')}
                </span>
              </li>
            ))}
          </ul>
          <div className="mx-auto mt-[56px] grid max-w-[980px] items-center gap-x-[48px] gap-y-[24px] border-t border-[rgba(252,246,233,.22)] pt-[40px] [grid-template-columns:repeat(auto-fit,minmax(min(380px,100%),1fr))]">
            <div>
              <h3 className="m-0 max-w-[20ch] font-display text-[30px] font-semibold leading-[1.12] [text-wrap:balance] max-sm:text-[26px]">{t('stats.h3')}</h3>
              <p className="m-0 mt-[14px] max-w-[46ch] text-[15.5px] leading-[1.65] opacity-[.78] [text-wrap:pretty]">
                {t('stats.note')}
                {cites(landing.stats.noteCites, 'cream')}
              </p>
            </div>
            <div>
              <p className="m-0 max-w-[46ch] text-[15.5px] leading-[1.65] opacity-[.78] [text-wrap:pretty]">{t('stats.text')}</p>
              <a href="#kom-i-gang" className={`mt-[22px] inline-flex min-h-[50px] focus-visible:outline-bg ${CTA}`}>
                {chrome('getStarted')} <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        </section>
      </div>

      {/* ------------------------------------------------------------------ why */}
      <section id="hvorfor" data-screen-label="Hvorfor" aria-labelledby="hvorfor-h" className={`${COLUMN} pb-[24px] pt-[72px] max-sm:pt-[48px]`}>
        <span className={`${EYEBROW} text-mut`}>{t('why.k')}</span>
        <h2 id="hvorfor-h" className={`${H2} mt-[12px] max-w-[24ch]`}>
          {t('why.title')}
        </h2>
        <p className={`${LEAD} mt-[14px] max-w-[62ch]`}>{t('why.lead')}</p>
        <div className="mt-[36px] grid items-start gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr))]">
          <div className={`rounded-card border border-line bg-sf p-[24px] ${SHOT_SHADOW} max-sm:px-[16px] max-sm:py-[18px]`}>
            <div className="mb-[16px] flex flex-wrap items-center justify-between gap-[12px]">
              <h3 className="m-0 text-[15px] font-bold">
                {t('why.law.title')}
                {cites(landing.why.lawCites)}
              </h3>
              <span className="rounded-pill bg-mint px-[11px] py-[4px] text-[12px] font-bold text-greendeep">{t('why.law.pill')}</span>
            </div>
            <ul className="m-0 flex list-none flex-col gap-[10px] p-0">
              {law.map((r) => (
                <li key={r.ref} className="flex items-start gap-[14px] rounded-row border border-line bg-bg px-[18px] py-[15px]">
                  <span
                    aria-hidden="true"
                    className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-pill bg-greenbar text-[13px] font-bold text-sf"
                  >
                    §
                  </span>
                  <span>
                    <span className="block whitespace-nowrap text-[15px] font-bold">{r.ref}</span>
                    <span className="mt-[3px] block text-[13.5px] leading-[1.5] text-body [text-wrap:pretty]">{r.t}</span>
                  </span>
                </li>
              ))}
            </ul>
            <Link href="/lovkrav" className="mt-[18px] inline-block text-[14.5px] font-bold hover:no-underline">
              {t('why.law.link')} <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="flex flex-col gap-[13px]">
            <div className="rounded-card border border-ink bg-sbg px-[24px] py-[22px] max-sm:px-[16px] max-sm:py-[18px]">
              <h3 className="m-0 font-display text-[22px] font-semibold leading-[1.2] [text-wrap:balance]">{t('why.tilsyn.t')}</h3>
              <p className="m-0 mt-[8px] text-[14.5px] leading-[1.6] text-body [text-wrap:pretty]">
                {t('why.tilsyn.p')}
                {cites(landing.why.tilsynCites)}
              </p>
              <p className="m-0 mt-[10px] flex items-start gap-[10px] text-[14px] font-semibold leading-[1.5]">
                <Tick />
                <span>{t('why.tilsyn.d')}</span>
              </p>
            </div>
            <div className="rounded-card border border-line bg-sf px-[24px] py-[22px] max-sm:px-[16px] max-sm:py-[18px]">
              <h3 className="m-0 font-display text-[22px] font-semibold leading-[1.2] [text-wrap:balance]">{t('why.gap.t')}</h3>
              <p className="m-0 mt-[8px] text-[14.5px] leading-[1.6] text-body [text-wrap:pretty]">
                {t('why.gap.p')}
                {cites(landing.why.gapCites)}
              </p>
            </div>
            <div className="rounded-card border border-line bg-sf px-[24px] py-[22px] max-sm:px-[16px] max-sm:py-[18px]">
              <h3 className="m-0 font-display text-[22px] font-semibold leading-[1.2] [text-wrap:balance]">{t('why.cost.t')}</h3>
              <ul className="m-0 mt-[10px] flex list-none flex-col gap-[10px] p-0">
                {cost.map((c, i) => (
                  <li key={c} className="flex items-start gap-[10px] text-[14.5px] leading-[1.55] text-body [text-wrap:pretty]">
                    <span aria-hidden="true" className="mt-[8px] h-[6px] w-[6px] flex-none rounded-pill bg-rustbar" />
                    <span>
                      {c}
                      {cites(landing.why.costCites[i] ?? [])}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- challenges */}
      <section
        id="utfordringer"
        data-screen-label="Utfordringer"
        aria-labelledby="utfordringer-h"
        className="mt-[48px] border-y border-line bg-sf"
      >
        <div className={`${COLUMN} py-[72px] max-sm:py-[48px]`}>
          <span className={`${EYEBROW} text-mut`}>{t('challenges.k')}</span>
          <h2 id="utfordringer-h" className={`${H2} mt-[12px] max-w-[24ch]`}>
            {t('challenges.title')}
          </h2>
          <p className={`${LEAD} mt-[14px] max-w-[62ch]`}>{t('challenges.lead')}</p>
          <ol className="m-0 mt-[40px] grid list-none gap-[13px] p-0 [grid-template-columns:repeat(auto-fit,minmax(min(460px,100%),1fr))]">
            {challenges.map((c, i) => {
              const reg = landing.challenges[i]!
              const measures = [
                ...reg.module.map((id) => ({ id, label: moduleNames[id] ?? id, tag: t('moduleTag'), tone: 'bg-ac text-ink' })),
                ...reg.core.map((id) => ({ id, label: all(`factor.${id}.label`), tag: common('coreTag'), tone: 'bg-track text-ink' })),
              ]
              return (
                <li key={c.t} className="flex flex-col overflow-hidden rounded-card border border-line bg-bg">
                  <div className="flex flex-1 flex-col gap-[10px] px-[24px] pb-[20px] pt-[22px] max-sm:px-[16px]">
                    <div className="flex items-center gap-[10px]">
                      <span
                        aria-hidden="true"
                        className="flex h-[28px] w-[28px] flex-none items-center justify-center rounded-pill bg-ink text-[12.5px] font-bold text-bg"
                      >
                        {i + 1}
                      </span>
                      <span className={`${EYEBROW} text-danger`}>{common('problem')}</span>
                    </div>
                    <h3 className="m-0 font-display text-[24px] font-semibold leading-[1.15] [text-wrap:balance] max-sm:text-[22px]">{c.t}</h3>
                    <p className="m-0 text-[14.5px] leading-[1.6] text-body [text-wrap:pretty]">{c.looks}</p>
                    <p className="m-0 border-l-[3px] border-rustbar pl-[12px] text-[14px] font-semibold leading-[1.55] text-ink [text-wrap:pretty]">
                      {c.fig}
                      {cites(reg.cites)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-[8px] border-t border-line bg-mint px-[24px] pb-[20px] pt-[16px] max-sm:px-[16px]">
                    <span className={`${EYEBROW} text-greendeep`}>{common('solution')}</span>
                    <p className="m-0 text-[14.5px] leading-[1.6] text-greendeep [text-wrap:pretty]">{c.solve}</p>
                    <div className="mt-[4px] flex flex-wrap items-center gap-[6px]">
                      <span className="text-[12px] font-bold text-greendeep">{common('measured')}</span>
                      <ul className="m-0 flex list-none flex-wrap gap-[6px] p-0">
                        {measures.map((m) => (
                          <li key={m.tag + m.id} className={`rounded-pill px-[10px] py-[4px] text-[12px] font-bold ${m.tone}`}>
                            {m.label}
                            <span className="font-semibold"> · {m.tag}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
          <p className="m-0 mt-[24px] text-[14px] text-body">
            <span className="tabular-nums">{fmt(common.raw('facts') as string)}</span>
            {questionPage ? (
              <>
                {' · '}
                <Link href={`/${landing.slug}/sporsmal` as Route} className="font-bold">
                  {t('related.sporsmal')} <span aria-hidden="true">→</span>
                </Link>
              </>
            ) : null}
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------- the proof */}
      <section id="slik-ser-det-ut" data-screen-label="Slik ser det ut" aria-labelledby="proof-h">
        <div className={`${COLUMN} pt-[72px] max-sm:pt-[48px]`}>
          <span className={`${EYEBROW} text-mut`}>{t('proof.k')}</span>
          <h2 id="proof-h" className={`${H2} mt-[12px] max-w-[24ch]`}>
            {t('proof.title')}
          </h2>
          <p className={`${LEAD} mt-[14px] max-w-[62ch]`}>{t('proof.lead')}</p>
        </div>
        {blocks.map((b, i) => {
          const shot = landing.proof[i]!
          return (
            <div key={b.h3} className={`border-b border-line ${i % 2 ? 'bg-sf' : 'bg-bg'}`}>
              <div
                className={`mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-[64px] gap-y-[32px] px-[56px] py-[56px] max-sm:px-[16px] max-sm:py-[40px] ${
                  i % 2 ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                <div className="min-w-0 flex-[1_1_340px]">
                  <span className={`${EYEBROW} text-mut`}>{b.k}</span>
                  <h3 className="m-0 mt-[12px] max-w-[22ch] font-display text-[30px] font-semibold leading-[1.12] [text-wrap:balance] max-sm:text-[26px]">
                    {b.h3}
                  </h3>
                  <ul className="m-0 mt-[18px] flex list-none flex-col gap-[10px] p-0">
                    {b.ticks.map((tick) => (
                      <li key={tick} className="flex items-start gap-[10px] text-[15px] leading-[1.55] text-body [text-wrap:pretty]">
                        <Tick />
                        <span>{tick}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <figure className="m-0 min-w-0 flex-[1_1_480px]">
                  <BrowserFrame id={shot} bar={all(`seo.shots.${shot}.screen`)} alt={all(`seo.shots.${shot}.alt`)} />
                  <figcaption className="mt-[14px] text-[14px] leading-[1.6] text-body [text-wrap:pretty]">
                    <strong className="text-greendeep">{b.caption}</strong> {common('realShot')}
                  </figcaption>
                </figure>
              </div>
            </div>
          )
        })}
      </section>

      {/* ----------------------------------------------------------------- steps */}
      <section id="kom-i-gang-steg" data-screen-label="Steg" aria-labelledby="steg-h" className={`${COLUMN} pt-[72px] max-sm:pt-[48px]`}>
        <div className="flex flex-col items-center gap-[14px] text-center">
          <span className="inline-block rounded-pill bg-sbg px-[13px] py-[6px] text-[12px] font-bold">{t('steps.k')}</span>
          <h2 id="steg-h" className={`${H2} max-w-[24ch]`}>
            {t('steps.title')}
          </h2>
        </div>
        <ol className="m-0 mt-[40px] grid list-none gap-[13px] p-0 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
          {steps.map((s, i) => (
            <li
              key={s.t}
              className={`flex flex-col gap-[12px] rounded-card border p-[26px] max-sm:px-[18px] max-sm:py-[22px] ${i === 0 ? 'border-ink bg-sbg' : 'border-line bg-sf'}`}
            >
              <span
                aria-hidden="true"
                className={`flex h-[44px] w-[44px] items-center justify-center rounded-tile font-display text-[19px] font-semibold text-ink ${i === 0 ? 'bg-ac' : 'bg-track'}`}
              >
                {i + 1}
              </span>
              <h3 className="m-0 mt-[4px] font-display text-[22px] font-semibold leading-[1.15] [text-wrap:balance]">{s.t}</h3>
              <p className="m-0 text-[14.5px] leading-[1.6] text-body [text-wrap:pretty]">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------------------------------------- anonymity */}
      <section id="anonymitet" data-screen-label="Anonymitet" aria-labelledby="anonymitet-h" className={`${COLUMN} pt-[56px] max-sm:pt-[40px]`}>
        <div className="grid items-start gap-x-[56px] gap-y-[28px] rounded-[24px] border border-line bg-sf px-[40px] py-[44px] [grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))] max-sm:px-[18px] max-sm:py-[28px]">
          <div>
            <span className={`${EYEBROW} text-mut`}>{t('trust.k')}</span>
            <h2 id="anonymitet-h" className={`${H2} mt-[12px] max-w-[18ch]`}>
              {t('trust.title')}
            </h2>
            <p className={`${LEAD} mt-[14px] max-w-[46ch]`}>{t('trust.lead')}</p>
            <Link href="/sikkerhet" className="mt-[18px] inline-block text-[14.5px] font-bold hover:no-underline">
              {t('trust.link')} <span aria-hidden="true">→</span>
            </Link>
          </div>
          <ul className="m-0 flex list-none flex-col p-0">
            {trust.map((x) => (
              <li key={x.t} className="flex items-start gap-[12px] border-t border-line py-[16px] first:border-t-0 first:pt-0">
                <Tick />
                <span>
                  <span className="block text-[15px] font-bold">{x.t}</span>
                  <span className="mt-[3px] block text-[14px] leading-[1.55] text-body [text-wrap:pretty]">{x.d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------------------- faq */}
      <section
        id="sporsmal-og-svar"
        data-screen-label="Spørsmål"
        aria-labelledby="faq-h"
        className={`${COLUMN} grid items-start gap-x-[64px] gap-y-[24px] pb-[8px] pt-[72px] [grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))] max-sm:pt-[48px]`}
      >
        <div>
          <span className={`${EYEBROW} text-mut`}>{t('faq.k')}</span>
          <h2 id="faq-h" className={`${H2} mt-[12px] max-w-[18ch]`}>
            {t('faq.title')}
          </h2>
        </div>
        <Faq items={faq} />
      </section>

      <StartBand />

      {/* ------------------------------------------------- read on, and the sources */}
      <section data-screen-label="Kilder" className={`${COLUMN} pb-[56px] max-sm:pb-[40px]`}>
        <div className="grid items-start gap-x-[64px] gap-y-[32px] border-t border-line pt-[40px] [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
          <nav aria-labelledby="les-videre">
            <h2 id="les-videre" className="m-0 text-[15px] font-bold">
              {common('related')}
            </h2>
            <ul className="m-0 mt-[12px] flex list-none flex-col gap-[8px] p-0">
              {related.map((r) => (
                <li key={r.href}>
                  <Link href={r.href as Route} className="text-[14.5px] font-bold">
                    {r.label} <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="lg:col-span-1">
            <h2 id="kilder" className="m-0 text-[15px] font-bold">
              {common('sources')}
            </h2>
            <p className="m-0 mt-[6px] text-[13px] text-mut">
              {common('sourcesLead', { date: new Date(`${landing.fetched}T12:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'nb-NO', { day: 'numeric', month: 'long', year: 'numeric' }) })}
            </p>
            <ol className="m-0 mt-[12px] pl-[20px] text-[13.5px] leading-[1.5] text-body">
              {landing.sources.map((s) => {
                const title = t(`sources.${s.key}`)
                return (
                  <li key={s.key} id={`kilde-${s.key}`} className="my-[10px] scroll-mt-[24px] [overflow-wrap:anywhere]">
                    <a href={s.url} rel="noopener" className="text-link">
                      {title}
                    </a>
                    {/* the year, unless the title already names it */}
                    {title.includes(s.year) ? null : <span className="text-mut"> ({s.year})</span>}
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      </section>
    </>
  )
}

/** A screen from the app in the v3 browser window (Forside's frame): three dots and the screen's name, both decoration */
function BrowserFrame({ id, bar, alt }: { id: ShotId; bar: string; alt: string }) {
  const { img } = SHOTS[id]
  return (
    <div className={`overflow-hidden rounded-panel border border-line bg-sf ${SHOT_SHADOW}`}>
      <div aria-hidden="true" className="flex h-[36px] items-center gap-[7px] border-b border-line px-[14px]">
        <span className="h-[9px] w-[9px] rounded-pill bg-line" />
        <span className="h-[9px] w-[9px] rounded-pill bg-line" />
        <span className="h-[9px] w-[9px] rounded-pill bg-line" />
        <span className="ml-[12px] text-[11.5px] text-mut">{bar}</span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- eager and sized, as the v3 pages draw shots (D-190 §21) */}
      <img src={img.src} width={img.width} height={img.height} alt={alt} className="block h-auto w-full" />
    </div>
  )
}
