import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { JsonLd } from '@/components/marketing/JsonLd'
import { Tick } from '@/components/site/parts'
import { HeroCarousel } from '@/components/site/v3/HeroCarousel'
import { SiteTop } from '@/components/site/v3/SiteTop'
import { StartBand } from '@/components/site/v3/StartBand'
import { pageMeta } from '@/lib/marketing/meta'
import { graph, organization, software, website } from '@/lib/marketing/schema'
import { SHOTS } from '@/lib/marketing/shots'
import type { ShotId } from '@/lib/marketing/shot-ids'
import { zip } from '@/lib/site/zip'

/**
 * The front page for small and medium-sized businesses (D-190): design-reference/orgpuls/
 * nettside-v3/Forside.dc.html, with the words, links and accessibility of the v3 decision sheet.
 *
 * What it says is messages (`site.home`, and the instrument's own `factor.*` and `respond.*` for
 * the survey example); what is here is the design's layout, value for value at 1440, and the
 * colours and targets that belong to each card. Below 640px the sheet's phone rules apply (G4.2):
 * 16px gutters, smaller display sizes, and the floating cards placed under their picture below
 * 768px so they never cover it.
 *
 * Every card that shows example figures is a `<figure>` captioned «Tenkte eksempeldata.» (G3); the
 * screenshots are the design fixture's real screens (Nordvik Anlegg AS), the files in assets/produkt.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return pageMeta({ title: t('seo.home.title'), description: t('seo.home.description'), path: '/' })
}

const Str = z.string()
const Slide = z.object({ tab: Str, eyebrow: Str, title: Str, lead: Str, link: Str, caption: Str })
const Row = z.object({ t: Str, s: Str })
const Measure = z.object({ t: Str, s: Str, pill: Str })
const Trust = z.object({ tile: Str, t: Str })
const Challenge = z.object({ t: Str, p: Str, s: Str })
const Stat = z.object({ v: Str, l: Str })
const Pillar = z.object({ t: Str, d: Str })
const Role = z.object({ i: Str, t: Str, s: Str, get: z.array(Str).length(3) })

/** Where each slide's text link goes (G8), and the arrow it is drawn with */
const SLIDE_LINKS = [
  { href: '#malinger', arrow: '↓' },
  { href: '/lovkrav', arrow: '→' },
  { href: '/plattform#tiltak', arrow: '→' },
] as const
/** Slide 3's measures: the factor each belongs to, its status stripe and its pill (the design's own colours) */
const MEASURES = [
  { factor: 'mengde', stripe: 'bg-amberbar', tone: 'bg-sbg text-cautiondeep' },
  { factor: 'ytring', stripe: 'bg-amberbar', tone: 'bg-band text-cautiondeep' },
  { factor: 'rolle', stripe: 'bg-stone', tone: 'bg-track text-[#4A4339]' },
  { factor: 'leder', stripe: 'bg-greenbar', tone: 'bg-mint text-greendeep' },
] as const
/** The trust strip: each fact links to its proof (adoption 1.6) */
const TRUST = ['/sikkerhet', '/sikkerhet', '/lovkrav', '/hvorfor#forskning'] as const
/** The survey example: the option chosen for each of Ytringsklima's three statements (0 = none yet) */
const PICKED = [4, 3, 0] as const
/** «Siden sist», the design's example deltas: the factor, the signed change and its colour (G5: ±0 in mut) */
const DELTAS = [
  { factor: 'mening', v: '+4', tone: 'text-link' },
  { factor: 'kontakt', v: '±0', tone: 'text-mut' },
  { factor: 'mengde', v: '−9', tone: 'text-danger' },
] as const
/** Sløyfen's pillars: the glyph, and the middle card's yellow emphasis */
const PILLARS = [
  { glyph: '◷', card: 'border-line bg-sf', tile: 'bg-track' },
  { glyph: '▤', card: 'border-ink bg-sbg', tile: 'bg-ac' },
  { glyph: '✓', card: 'border-line bg-sf', tile: 'bg-track' },
] as const
/** The role cards: fill, and where each goes (G8) */
const ROLES = [
  { bg: 'bg-sbg', href: '/bruksomrader#uten-hr' },
  { bg: 'bg-sf', href: '/plattform#resultater' },
  { bg: 'bg-sf', href: '/bruksomrader#ett-team' },
  { bg: 'bg-mint', href: '/verneombud' },
] as const

/** A section in the page column: the design's `width:100%; max-width:1240px; align-self:center` */
const COLUMN = 'w-full max-w-[1240px] self-center'
/** The bordered r24 panels (Måling og svar, the ink band, Resultater): 72 × 56, phones 48 × 18 inside the 16px gutter */
const PANEL = `${COLUMN} rounded-[24px] border border-line px-[56px] py-[72px] max-sm:mx-[16px] max-sm:w-auto max-sm:self-stretch max-sm:px-[18px] max-sm:py-[48px]`
const HEAD = 'flex flex-col items-center gap-[14px] text-center'
const H2 =
  'm-0 max-w-[24ch] font-display text-[40px] font-semibold leading-[1.1] [overflow-wrap:break-word] [text-wrap:balance] max-sm:text-[30px] max-sm:leading-[1.12]'
const LEAD = 'm-0 text-[16px] leading-[1.65] [text-wrap:pretty]'
const PILL = 'inline-block rounded-pill bg-sbg px-[13px] py-[6px] text-[12px] font-bold'
/** A floating card's shadow, as the design draws the light ones */
const FLOAT = 'shadow-[0_18px_40px_-24px_rgba(25,21,16,.45)]'
const SHOT_SHADOW = 'shadow-[0_18px_40px_-28px_rgba(25,21,16,.35)]'
/** Below 768px a floating card sits under its picture, full width (G4.2) */
const STATIC_MD = 'max-md:static max-md:mt-[13px] max-md:w-full'
/** The design's yellow 52/50px button: no hover change, as its inline colours keep it */
const CTA =
  'items-center gap-[9px] rounded-tile border border-ink bg-ac px-[24px] text-[16px] font-bold text-ink no-underline hover:text-ink hover:no-underline'

export default async function StartPage() {
  const t = await getTranslations('site.home')
  const chrome = await getTranslations('site.chrome')
  const factor = await getTranslations('factor')
  const respond = await getTranslations('respond')
  const seo = await getTranslations('seo')

  const slides = z.array(Slide).length(3).parse(t.raw('slides'))
  const law = z.array(Row).length(4).parse(t.raw('law.rows'))
  const measures = zip(MEASURES, z.array(Measure).parse(t.raw('measures.rows')))
  const trust = zip(
    TRUST.map((href) => ({ href })),
    z.array(Trust).parse(t.raw('trust')),
  )
  const challenges = z.array(Challenge).length(4).parse(t.raw('challenges.cards'))
  const points = z.array(Str).length(4).parse(t.raw('survey.points'))
  const stats = z.array(Stat).length(4).parse(t.raw('band.stats'))
  const pillars = zip(PILLARS, z.array(Pillar).parse(t.raw('loop.pillars')))
  const roles = zip(ROLES, z.array(Role).parse(t.raw('roles.cards')))
  const example = t('example')

  const left = (i: number) => {
    const s = slides[i]!
    const link = SLIDE_LINKS[i]!
    const linkClass = 'text-[16px] font-bold text-link no-underline'
    const linkBody = (
      <>
        {s.link} <span aria-hidden="true">{link.arrow}</span>
      </>
    )
    return (
      <div className="max-w-[580px]">
        <span className="inline-block rounded-bar bg-ink px-[12px] py-[7px] text-[11px] font-bold uppercase tracking-[.12em] text-bg">
          {keep(s.eyebrow)}
        </span>
        <h2 className="m-0 mt-[22px] font-display text-[60px] font-semibold leading-[1.04] tracking-[-.01em] [overflow-wrap:break-word] [text-wrap:balance] max-sm:text-[40px] max-sm:leading-[1.08] max-[359px]:text-[34px]">
          {s.title}
        </h2>
        <p className="m-0 mt-[20px] max-w-[50ch] text-[17.5px] leading-[1.65] text-body [text-wrap:pretty]">{s.lead}</p>
        <div className="mt-[28px] flex flex-wrap items-center gap-x-[28px] gap-y-[10px]">
          <a href="#kom-i-gang" className={`flex min-h-[52px] ${CTA}`}>
            {chrome('trial')} <span aria-hidden="true">→</span>
          </a>
          {link.href.startsWith('#') ? (
            <a href={link.href} className={linkClass}>
              {linkBody}
            </a>
          ) : (
            <Link href={link.href as Route} className={linkClass}>
              {linkBody}
            </Link>
          )}
        </div>
        <p className="m-0 mt-[18px] text-[13px] text-mut">{t('risk')}</p>
      </div>
    )
  }
  const caption = (text: string, cls = 'mt-[16px]') => (
    <figcaption className={`${cls} text-[14px] leading-[1.6] text-body`}>
      <strong className="text-greendeep">{text}</strong> {example}
    </figcaption>
  )
  const card = 'rounded-card border border-line bg-sf p-[24px] max-sm:px-[16px] max-sm:py-[18px]'
  const grid = 'grid items-center gap-[48px] [grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr))] motion-safe:animate-[ht-in_.25s_ease_both]'

  const panels = [
    <div key="s1" className={grid}>
      {left(0)}
      <figure className="m-0">
        <BrowserFrame id="oversikt" bar={t('bar.oversikt')} alt={seo('shots.oversikt.alt')} priority />
        {caption(slides[0]!.caption)}
      </figure>
    </div>,
    <div key="s2" className={grid}>
      {left(1)}
      <figure className="m-0" aria-labelledby="hero-law-title">
        <div className={`${card} ${SHOT_SHADOW}`}>
          <div className="mb-[16px] flex items-center justify-between gap-[12px]">
            <span id="hero-law-title" className="text-[15px] font-bold">
              {t('law.title')}
            </span>
            <span className="rounded-pill bg-mint px-[11px] py-[4px] text-[12px] font-bold text-greendeep">{t('law.pill')}</span>
          </div>
          <ul className="m-0 flex list-none flex-col gap-[10px] p-0">
            {law.map((r) => (
              <li key={r.t} className="flex items-start gap-[14px] rounded-row border border-line bg-bg px-[18px] py-[15px]">
                <span
                  aria-hidden="true"
                  className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-pill bg-greenbar text-[13px] font-bold text-sf"
                >
                  ✓
                </span>
                <span>
                  <span className="block text-[15px] font-bold">
                    {r.t}
                    <span className="sr-only">, {t('done')}</span>
                  </span>
                  <span className="mt-[3px] block text-[13.5px] leading-[1.5] text-body">{keep(r.s)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        {caption(slides[1]!.caption)}
      </figure>
    </div>,
    <div key="s3" className={grid}>
      {left(2)}
      <figure className="m-0" aria-labelledby="hero-measures-title">
        <div className={`${card} ${SHOT_SHADOW}`}>
          <div className="mb-[16px] flex items-center justify-between gap-[12px]">
            <span id="hero-measures-title" className="text-[15px] font-bold">
              {t('measures.title')}
            </span>
            <span className="text-[12.5px] text-mut">{t('measures.meta')}</span>
          </div>
          <ul className="m-0 flex list-none flex-col gap-[10px] p-0">
            {measures.map((m) => (
              <li key={m.t} className="flex items-center gap-[14px] rounded-row border border-line bg-bg py-[14px] pl-[14px] pr-[18px]">
                <span aria-hidden="true" className={`w-[7px] flex-none self-stretch rounded-pill ${m.stripe}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold">{m.t}</span>
                  <span className="mt-[3px] block text-[13px] text-body">{m.s.replace('{factor}', factor(`${m.factor}.name`))}</span>
                </span>
                <span className={`flex-none rounded-pill px-[11px] py-[4px] text-[12px] font-bold ${m.tone}`}>{m.pill}</span>
              </li>
            ))}
          </ul>
        </div>
        {caption(slides[2]!.caption)}
      </figure>
    </div>,
  ]

  return (
    <>
      <JsonLd data={graph(organization(), website(await getLocale()), software(seo('home.description')))} />
      <SiteTop bottom={8}>
        <h1 className="sr-only">{t('h1')}</h1>
        <HeroCarousel
          panels={panels}
          tabs={slides.map((s) => s.tab)}
          label={t('carousel.label')}
          roledescription={t('carousel.roledescription')}
          tablist={t('carousel.tablist')}
          prev={t('carousel.prev')}
          next={t('carousel.next')}
          announce={slides.map((s, i) => t('carousel.announce', { n: i + 1, label: s.tab }))}
        />
      </SiteTop>

      {/* Tillit: four facts, each a link to its proof */}
      <div data-screen-label="Tillit" className="border-b border-line bg-sf">
        <ul
          aria-label={chrome('trust.label')}
          className="m-0 mx-auto grid max-w-[1240px] list-none gap-x-[24px] gap-y-[14px] px-[56px] py-[22px] [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))] max-sm:px-[16px]"
        >
          {trust.map((x) => (
            <li key={x.t} className="flex">
              <Link
                href={x.href as Route}
                className="group flex items-center gap-[12px] text-[14.5px] font-bold text-ink no-underline hover:text-linkhover hover:no-underline"
              >
                <span
                  aria-hidden="true"
                  className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-bar bg-mint text-[12px] font-bold text-greendeep"
                >
                  {x.tile}
                </span>
                <span className="group-hover:underline">{keep(x.t)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-[18px] px-[18px] pb-[18px] pt-[18px] max-sm:px-0">
        <section
          id="utfordringer"
          data-screen-label="Utfordringer"
          className={`${COLUMN} px-[56px] pb-[40px] pt-[56px] max-sm:px-[16px] max-sm:pb-[32px] max-sm:pt-[40px]`}
        >
          <div className={HEAD}>
            <span className={PILL}>{t('challenges.k')}</span>
            <h2 className={H2}>{t('challenges.title')}</h2>
            <p className={`${LEAD} max-w-[58ch] text-body`}>{keep(t('challenges.lead'))}</p>
          </div>
          <ul className="m-0 mt-[44px] grid list-none gap-[13px] p-0 [grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))] max-sm:grid-cols-1">
            {challenges.map((c) => (
              <li key={c.t} className="flex flex-col overflow-hidden rounded-card border border-line bg-sf">
                <div className="flex flex-col gap-[8px] px-[22px] pb-[18px] pt-[22px]">
                  <span className="text-[11px] font-bold uppercase tracking-[.12em] text-danger">{t('challenges.problem')}</span>
                  <h3 className="m-0 font-display text-[22px] font-semibold leading-[1.15] [text-wrap:balance]">{c.t}</h3>
                  <p className="m-0 text-[14px] leading-[1.55] text-body [text-wrap:pretty]">{c.p}</p>
                </div>
                <div className="mt-auto flex flex-col gap-[6px] border-t border-line bg-mint px-[22px] pb-[20px] pt-[16px]">
                  <span className="text-[11px] font-bold uppercase tracking-[.12em] text-greendeep">{t('challenges.solution')}</span>
                  <p className="m-0 text-[14px] leading-[1.55] text-greendeep [text-wrap:pretty]">{keep(c.s)}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section id="malinger" data-screen-label="Måling og svar" className={`${PANEL} bg-sf`}>
          <div className={HEAD}>
            <span className={`${PILL} inline-flex items-center gap-[7px]`}>
              <span aria-hidden="true">◷</span> {t('survey.k')}
            </span>
            <h2 className={`${H2} max-w-[22ch]`}>{t('survey.title')}</h2>
            <p className={`${LEAD} max-w-[60ch] text-body`}>{t('survey.lead')}</p>
          </div>
          <div className="mt-[56px] grid items-center gap-[56px] [grid-template-columns:repeat(auto-fit,minmax(min(380px,100%),1fr))]">
            <figure className="m-0">
              <div className="relative pb-[40px] pr-[40px] max-md:p-0">
                <div
                  role="img"
                  aria-label={t('survey.mock')}
                  className="max-w-[420px] rounded-card border border-line bg-bg p-[26px] max-sm:px-[16px] max-sm:py-[18px]"
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-x-[12px] gap-y-[4px]">
                    <span className="text-[11px] font-bold uppercase tracking-[.11em] text-mut">
                      {factor('ytring.name')} · <span className="whitespace-nowrap">{respond('progress', { n: 4, total: 15 })}</span>
                    </span>
                    <span className="whitespace-nowrap text-[12px] text-mut">{respond('timeLeft', { minutes: 3 })}</span>
                  </span>
                  <span className="mt-[10px] block h-[6px] rounded-bar bg-track">
                    <span className="block h-full w-[27%] rounded-bar bg-ink" />
                  </span>
                  <span className="mt-[22px] flex flex-col gap-[18px]">
                    {PICKED.map((picked, i) => (
                      <span key={i} className="block">
                        <span className="block font-display text-[17px] font-semibold leading-[1.3] [text-wrap:pretty]">
                          {factor(`ytring.s${i + 1}`)}
                        </span>
                        <span className="mt-[10px] grid grid-cols-5 gap-[6px]">
                          {[1, 2, 3, 4, 5].map((o) => (
                            <span
                              key={o}
                              className={`flex h-[38px] items-center justify-center rounded-opt border text-[14px] ${
                                o === picked ? 'border-ink bg-sbg font-bold' : 'border-line bg-sf font-medium'
                              }`}
                            >
                              {o}
                            </span>
                          ))}
                        </span>
                      </span>
                    ))}
                  </span>
                  <span className="mt-[20px] block rounded-opt border border-dashed border-rule px-[14px] py-[12px] text-[13px] text-mut">
                    {respond('commentPrompt')}
                  </span>
                </div>
                <div
                  className={`absolute bottom-0 right-0 w-[250px] rounded-note border border-line bg-mint px-[18px] py-[16px] ${FLOAT} ${STATIC_MD}`}
                >
                  <span className="block text-[14px] font-bold text-greendeep">{t('survey.note.t')}</span>
                  <span className="mt-[6px] block text-[13px] leading-[1.5] text-greendeep [text-wrap:pretty]">{t('survey.note.d')}</span>
                </div>
              </div>
              {caption(t('survey.caption'))}
            </figure>
            <div>
              <h3 className="m-0 max-w-[24ch] font-display text-[28px] font-semibold leading-[1.15] [text-wrap:balance] max-sm:text-[24px]">
                {t('survey.h3')}
              </h3>
              <ul className="m-0 mt-[22px] flex list-none flex-col gap-[13px] p-0">
                {points.map((p) => (
                  <li key={p} className="flex items-start gap-[10px] text-[15px] leading-[1.55] text-body [text-wrap:pretty]">
                    <Tick size={18} />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
              <Link href="/artikler/medarbeiderundersokelse-sporsmal" className="mt-[24px] inline-block text-[14.5px] font-bold">
                {t('survey.link')} <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </section>

        <section id="hvorfor" data-screen-label="Ink band" className={`${PANEL} bg-ink text-bg`}>
          <div className={HEAD}>
            <span className="inline-flex items-center gap-[7px] rounded-pill bg-ac px-[13px] py-[6px] text-[12px] font-bold text-ink">
              <span aria-hidden="true">✓</span> {t('band.k')}
            </span>
            <h2 className={H2}>{t('band.title')}</h2>
            <p className={`${LEAD} max-w-[58ch] opacity-[.78]`}>{t('band.lead')}</p>
          </div>
          <ul className="m-0 mt-[52px] grid list-none gap-[13px] p-0 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
            {stats.map((s) => (
              <li key={s.v} className="px-[12px] py-[10px] text-center">
                <span className="block font-display text-[52px] font-semibold leading-none tabular-nums max-sm:text-[44px]">{s.v}</span>{' '}
                <span className="mx-auto mt-[12px] block max-w-[22ch] text-[15px] leading-[1.5] opacity-[.78] [text-wrap:balance]">{keep(s.l)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-[72px] grid items-center gap-[56px] [grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr))]">
            <figure className="m-0">
              <div className="relative pb-[30px] max-md:pb-0">
                <div className="overflow-hidden rounded-panel border border-line bg-sf">
                  <Shot id="varmekart" alt={seo('shots.varmekart.alt')} />
                </div>
                <div
                  className={`absolute bottom-0 right-[-18px] w-[270px] rounded-note border border-ink bg-sf px-[18px] py-[16px] text-ink shadow-[0_34px_80px_rgba(25,21,16,.3)] ${STATIC_MD}`}
                >
                  <span className="block text-[11px] font-bold uppercase tracking-[.11em] text-mut">{t('band.callout.head')}</span>
                  <span className="mt-[6px] flex items-baseline gap-[10px]">
                    <span className="font-display text-[30px] font-semibold">{t('band.callout.value')}</span>
                    <span className="text-[13.5px] font-bold">{factor('ytring.name')}</span>
                  </span>
                  <span className="mt-[4px] block text-[12.5px] leading-[1.5] text-body">{t('band.callout.text')}</span>
                </div>
              </div>
              {/* G3: on ink the caption is cream; greendeep would fail contrast */}
              <figcaption className="mt-[16px] text-[14px] leading-[1.6] text-bg">
                <strong className="text-bg">{t('band.caption')}</strong> <span className="opacity-[.78]">{example}</span>
              </figcaption>
            </figure>
            <div>
              <h3 className="m-0 max-w-[20ch] font-display text-[36px] font-semibold leading-[1.12] [text-wrap:balance] max-sm:text-[28px]">
                {t('band.h3')}
              </h3>
              <p className="m-0 mt-[16px] max-w-[46ch] text-[16px] leading-[1.65] opacity-[.78] [text-wrap:pretty]">{t('band.text')}</p>
              <a href="#kom-i-gang" className={`mt-[26px] inline-flex min-h-[50px] focus-visible:outline-bg ${CTA}`}>
                {chrome('getStarted')} <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        </section>

        <section id="resultater" data-screen-label="Resultater" className={`${PANEL} bg-sf`}>
          <div className={HEAD}>
            <h2 className={H2}>{t('results.title')}</h2>
            <p className={`${LEAD} max-w-[58ch] text-body`}>{t('results.lead')}</p>
          </div>
          <figure className="m-0 mx-auto mt-[48px] max-w-[900px]">
            <div className="relative pb-[30px] max-md:pb-0">
              <BrowserFrame id="resultater" bar={t('bar.resultater')} alt={seo('shots.resultater.alt')} />
              <div className={`absolute bottom-0 left-[-44px] w-[250px] rounded-note border border-ink bg-sf px-[18px] py-[16px] ${FLOAT} ${STATIC_MD}`}>
                <span className="block text-[14px] font-bold">{t('results.since')}</span>
                <ul className="m-0 mt-[10px] flex list-none flex-col gap-[8px] p-0">
                  {DELTAS.map((d) => (
                    <li key={d.factor} className="flex justify-between gap-[10px] text-[13px]">
                      <span>{factor(`${d.factor}.name`)}</span>
                      <span className={`font-bold tabular-nums ${d.tone}`}>{d.v}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={`absolute right-[-44px] top-[70px] w-[230px] rounded-note border border-line bg-sbg px-[18px] py-[16px] ${FLOAT} ${STATIC_MD}`}>
                <span className="block text-[11px] font-bold uppercase tracking-[.11em] text-cautiondeep">{t('results.index.label')}</span>
                <span className="mt-[6px] flex items-baseline gap-[9px]">
                  <span className="font-display text-[44px] font-semibold leading-[.9]">{t('results.index.value')}</span>
                  <span className="text-[13px] font-bold text-danger">{t('results.index.delta')}</span>
                </span>
                <span className="mt-[6px] block text-[12.5px] text-cautiondeep">{t('results.index.meta')}</span>
              </div>
            </div>
            {caption(t('results.caption'))}
          </figure>
        </section>

        <section
          id="sloyfen"
          data-screen-label="Sløyfen"
          className={`${COLUMN} px-[56px] pb-[24px] pt-[56px] max-sm:px-[16px] max-sm:pt-[40px]`}
        >
          <div className={HEAD}>
            <h2 className={H2}>{t('loop.title')}</h2>
            <p className={`${LEAD} max-w-[58ch] text-body`}>{t('loop.lead')}</p>
          </div>
          {/* F-16: the yellow middle card is emphasis only */}
          <ul className="m-0 mt-[44px] grid list-none gap-[13px] p-0 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
            {pillars.map((p) => (
              <li key={p.t} className={`flex min-h-[230px] flex-col gap-[12px] rounded-card border p-[26px] ${p.card}`}>
                <span aria-hidden="true" className={`flex h-[44px] w-[44px] items-center justify-center rounded-tile text-[19px] text-ink ${p.tile}`}>
                  {p.glyph}
                </span>
                <h3 className="m-0 mt-[6px] font-display text-[26px] font-semibold leading-[1.15]">{p.t}</h3>
                <p className="m-0 text-[14.5px] leading-[1.6] text-body [text-wrap:pretty]">{p.d}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="roller" data-screen-label="Roller" className={`${COLUMN} px-[56px] pt-[40px] max-sm:px-[16px] max-sm:pt-[32px]`}>
          <div className={HEAD}>
            <span className={PILL}>{t('roles.k')}</span>
            <h2 className={H2}>{t('roles.title')}</h2>
            <p className={`${LEAD} max-w-[56ch] text-body`}>{t('roles.lead')}</p>
          </div>
          <ul className="m-0 mt-[40px] grid list-none gap-[13px] p-0 [grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))] max-sm:grid-cols-1">
            {roles.map((r, i) => (
              // F-15: only «Se hva du får» is a link; its hit area covers the card, and the ring is drawn on the card
              <li
                key={r.t}
                className={`relative flex min-h-[290px] flex-col gap-[12px] rounded-card border border-line px-[20px] py-[22px] text-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${r.bg}`}
              >
                <span
                  aria-hidden="true"
                  className="flex h-[44px] w-[44px] items-center justify-center rounded-tile bg-ink font-display text-[19px] font-semibold text-bg"
                >
                  {r.i}
                </span>
                <div>
                  <h3 id={`rolle-${i}`} className="m-0 text-[18px] font-bold">
                    {r.t}
                  </h3>
                  <p className="m-0 mt-[3px] text-[13px] text-mut">{r.s}</p>
                </div>
                <ul className="m-0 flex flex-1 list-none flex-col gap-[7px] p-0">
                  {r.get.map((g) => (
                    <li key={g} className="flex gap-[8px] text-[13.5px] leading-[1.45] [text-wrap:pretty]">
                      <Tick size={16} />
                      {g}
                    </li>
                  ))}
                </ul>
                <Link
                  href={r.href as Route}
                  aria-describedby={`rolle-${i}`}
                  className="flex min-h-[42px] items-center justify-center rounded-btn border border-ink bg-sf text-[13.5px] font-bold text-ink no-underline after:absolute after:inset-0 after:rounded-card after:content-[''] hover:text-ink hover:no-underline focus-visible:outline-none"
                >
                  {t('roles.cta')}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <StartBand variant="front" />
      </div>
    </>
  )
}

/**
 * «§ 4-3» kept on one line: the sheet joins § and the number with U+00A0 (T2), but a browser still
 * breaks after the hyphen («§ 4-» / «3»). The text is the message's, byte for byte; only the break goes.
 */
function keep(text: string) {
  const parts = text.split(/(§\u00a0[\d-]+)/)
  return parts.length === 1
    ? text
    : parts.map((p, i) =>
        i % 2 ? (
          <span key={i} className="whitespace-nowrap">
            {p}
          </span>
        ) : (
          p
        ),
      )
}

/** A product screenshot at its own pixels, scaled by the browser as the design scales it (G-18: alt, width and height) */
function Shot({ id, alt, priority = false }: { id: ShotId; alt: string; priority?: boolean }) {
  const { img } = SHOTS[id]
  // the design's own <img>: the file as captured, eager and decoded with the page, so a reader who
  // jumps to #resultater (or a full-page capture) gets the picture, never a blank frame
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={img.src}
      width={img.width}
      height={img.height}
      alt={alt}
      fetchPriority={priority ? 'high' : undefined}
      className="block h-auto w-full"
    />
  )
}

/** A screenshot in the design's browser window: three dots and the address, both decoration (G-15) */
async function BrowserFrame({ id, bar, alt, priority = false }: { id: ShotId; bar: string; alt: string; priority?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-panel border border-line bg-sf ${SHOT_SHADOW}`}>
      <div aria-hidden="true" className="flex h-[36px] items-center gap-[7px] border-b border-line px-[14px]">
        <span className="h-[9px] w-[9px] rounded-pill bg-line" />
        <span className="h-[9px] w-[9px] rounded-pill bg-line" />
        <span className="h-[9px] w-[9px] rounded-pill bg-line" />
        <span className="ml-[12px] text-[11.5px] text-mut">{bar}</span>
      </div>
      <Shot id={id} alt={alt} priority={priority} />
    </div>
  )
}
