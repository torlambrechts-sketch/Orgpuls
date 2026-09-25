import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { JsonLd } from '@/components/marketing/JsonLd'
import { SectionNav } from '@/components/site/SectionNav'
import { Crumbs, Eyebrow, HeroButtons, Points, SectionHead, StartBand } from '@/components/site/parts'
import { pageMeta } from '@/lib/marketing/meta'
import { breadcrumbs, graph, organization } from '@/lib/marketing/schema'
import { zip } from '@/lib/site/zip'

/**
 * Plattform (D-88): design-reference/orgpuls/nettside/Plattform.dc.html.
 *
 * Ten sections, one per part of the product, each with the design's drawing of it. The
 * drawings are illustrations of "Demo Bedrift", labelled as such, as the design labels them —
 * not screenshots and not anyone's data. Their words are messages (`site.plattform`); their
 * colours, bar lengths and the values the colours stand for are here, beside the markup
 * that draws them.
 */
export const dynamic = 'force-static'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return pageMeta({
    title: t('seo.pages.plattform.title'),
    description: t('seo.pages.plattform.description'),
    path: '/plattform',
  })
}

const SECTIONS = [
  'malinger',
  'respondent',
  'resultater',
  'segment',
  'kommentarer',
  'tiltak',
  'rapport',
  'roller',
  'oppsett',
  'assistent',
] as const

/** The heatmap's five tones, low to high, with the ink each is read in and the value it stands for. */
const HEAT = [
  { bg: '#E38258', fg: '#4A1706', v: '28' },
  { bg: '#EC9B77', fg: '#5E1F09', v: '41' },
  { bg: '#F5DC96', fg: '#5C4600', v: '58' },
  { bg: '#CFE7E4', fg: '#20431C', v: '66' },
  { bg: '#B5DAD4', fg: '#20431C', v: '78' },
] as const
const HEAT_ROWS = [[2, 2, 3, 4, 4], [2, 0, 2, 2, 3], [0, 1, 2, 4, 4], null] as const
const MINI_HEAT = [2, 2, 3, 4, 4, 2, 0, 2, 2, 3, 0, 1, 2, 4, 4] as const

const FEATURE_BARS = [
  [
    ['40%', '#F5C64A'],
    ['22%', '#A8D5D2'],
    ['22%', '#A8D5D2'],
    ['22%', '#A8D5D2'],
    ['40%', '#F5C64A'],
  ],
  [
    ['28%', '#E38258'],
    ['45%', '#EC9B77'],
    ['60%', '#F5DC96'],
    ['70%', '#CFE7E4'],
    ['85%', '#B5DAD4'],
  ],
  [
    ['60%', '#F2EAD6'],
    ['35%', '#F2EAD6'],
    ['75%', '#FBEBBE'],
    ['40%', '#F2EAD6'],
    ['55%', '#F2EAD6'],
  ],
  [
    ['100%', '#F5C64A'],
    ['100%', '#F5C64A'],
    ['100%', '#F5C64A'],
    ['100%', '#2F5D2A'],
    ['30%', '#E8DFC9'],
  ],
] as const

const TODO = [
  { c: '#D4633A', bg: '#F5C64A' },
  { c: '#F5C64A', bg: 'transparent' },
  { c: '#C4BCA8', bg: 'transparent' },
] as const

/** Årshjulet: September is the main survey, March, June and December the pulses, July the holiday. */
const BASE_MONTH = 8
const PULSE_MONTHS: readonly number[] = [2, 5, 11]
const HOLIDAY = 6

/** The factor table's six rows: index and change on last year. */
const RISK_ROWS = [
  { v: 41, d: -7 },
  { v: 44, d: -9 },
  { v: 52, d: -6 },
  { v: 58, d: -1 },
  { v: 64, d: -5 },
  { v: 71, d: -2 },
] as const
const risk = (v: number) =>
  v < 50
    ? { key: 'high', bg: '#F0B9A0', fg: '#6B240C', bar: '#D4633A' }
    : v < 66
      ? { key: 'mid', bg: '#F5DC96', fg: '#5C4600', bar: '#E0A21F' }
      : { key: 'low', bg: '#CFE7E4', fg: '#20431C', bar: '#5C9A55' }
const LIFTS = [{ lift: '+6' }, { lift: '+4' }, { lift: '+3' }] as const
const PRIO = [
  { w: '92%', bg: '#E38258' },
  { w: '74%', bg: '#EC9B77' },
  { w: '48%', bg: '#F5DC96' },
  { w: '22%', bg: '#CFE7E4' },
] as const

/** The type pill's fill by kind, in the playbook's order for Ytringsklima: rutine, workshop, lederpraksis. */
const SUGGEST_BG = [{ tbg: '#CFE7E4' }, { tbg: '#FBEBBE' }, { tbg: '#F2EAD6' }] as const
const REPORT_LINES = [
  [
    ['70%', '#F5C64A'],
    ['100%', '#E8DFC9'],
    ['90%', '#E8DFC9'],
    ['60%', '#E8DFC9'],
  ],
  [
    ['100%', '#F0B9A0'],
    ['100%', '#F5DC96'],
    ['100%', '#CFE7E4'],
    ['80%', '#E8DFC9'],
    ['60%', '#E8DFC9'],
  ],
  [
    ['90%', '#E8DFC9'],
    ['100%', '#E8DFC9'],
    ['50%', '#2F5D2A'],
    ['85%', '#E8DFC9'],
  ],
  [
    ['100%', '#E8DFC9'],
    ['70%', '#E8DFC9'],
    ['100%', '#E8DFC9'],
    ['40%', '#E8DFC9'],
  ],
] as const
const SETUP_ICONS = [{ i: '§' }, { i: '⇪' }, { i: '◔' }, { i: '✎' }, { i: '◐' }, { i: '⚑' }] as const
/** Which integrations exist; the rest are drawn dashed and marked "kommer" — Entra ID among them (D-88). */
const INTEGRATIONS = [
  { soon: false },
  { soon: false },
  { soon: false },
  { soon: false },
  { soon: true },
  { soon: true },
  { soon: true },
  { soon: true },
  { soon: true },
] as const

const Str = z.string()
const Strs = z.array(z.string())
const Pair = (a: string, b: string) => z.object({ [a]: z.string(), [b]: z.string() })

export default async function PlattformPage() {
  const t = await getTranslations('site.plattform')
  const chrome = await getTranslations('site.chrome')
  const seo = await getTranslations('seo.pages.plattform')

  const appNav = Strs.length(6).parse(t.raw('app.nav'))
  const bands = Strs.length(3).parse(t.raw('app.bands'))
  const todo = zip(TODO, z.array(z.object({ t: Str, m: Str, cta: Str })).parse(t.raw('app.todo')))
  const features = zip(
    FEATURE_BARS.map((bars) => ({ bars })),
    z.array(z.object({ k: Str, t: Str, d: Str })).parse(t.raw('features')),
  )
  const heatCols = Strs.length(5).parse(t.raw('heat.cols'))
  const heatRows = zip(
    HEAT_ROWS.map((cells) => ({ cells })),
    Strs.parse(t.raw('heat.teams')).map((team) => ({ team })),
  )
  const heatTabs = Strs.length(4).parse(t.raw('heat.tabs'))
  const callouts = z.array(Pair('t', 'd')).length(4).parse(t.raw('callouts'))
  const months = Strs.length(12).parse(t.raw('malinger.months'))
  const cascade = z.array(Pair('who', 'when')).parse(t.raw('malinger.cascade'))
  const wheelChips = Strs.length(3).parse(t.raw('malinger.chips'))
  const options = Strs.length(5).parse(t.raw('respondent.phone.options'))
  const riskRows = zip(RISK_ROWS, z.array(Pair('l', 'law')).parse(t.raw('resultater.rows')))
  const head = Strs.length(3).parse(t.raw('resultater.head'))
  const top = zip(LIFTS, z.array(Pair('t', 'm')).parse(t.raw('resultater.top')))
  const trendLabels = Strs.length(5).parse(t.raw('resultater.trendLabels'))
  const views = z.array(Pair('t', 'd')).length(4).parse(t.raw('segment.views'))
  const prio = zip(
    PRIO,
    Strs.parse(t.raw('segment.prio')).map((l) => ({ l })),
  )
  const themes = z.array(Pair('l', 'n')).parse(t.raw('kommentarer.themes'))
  const suggest = zip(SUGGEST_BG, z.array(z.object({ type: Str, time: Str, t: Str, q: Str })).parse(t.raw('tiltak.suggest')))
  const steps = Strs.length(6).parse(t.raw('tiltak.card.steps'))
  const pages = zip(
    REPORT_LINES.map((lines) => ({ lines })),
    z.array(z.object({ k: Str, t: Str, f: Str })).parse(t.raw('rapport.pages')),
  )
  const roles = Strs.length(3).parse(t.raw('roller.roles'))
  const perms = z.array(z.object({ k: Str, c: Strs.length(3) })).parse(t.raw('roller.rows'))
  const setup = zip(SETUP_ICONS, z.array(Pair('t', 'd')).parse(t.raw('oppsett.cards')))
  const integrations = zip(
    INTEGRATIONS,
    Strs.parse(t.raw('oppsett.list')).map((l) => ({ l })),
  )
  const assistChips = Strs.parse(t.raw('assistent.chips'))

  return (
    <div>
      <JsonLd
        data={graph(
          organization(),
          breadcrumbs([
            { name: 'Orgpuls', path: '/' },
            { name: t('crumb'), path: '/plattform' },
          ]),
          { '@type': 'WebPage', name: seo('title'), description: seo('description') },
        )}
      />
      <SectionNav label={chrome('sections')} items={SECTIONS.map((id) => ({ id, label: t(`sections.${id}`) }))} />

      {/* ------------------------------------------------------------------ hero */}
      <section className="mx-auto max-w-[1120px] px-[26px] pt-[60px]">
        <Crumbs page={t('crumb')} />
        <h1 className="m-0 mt-[16px] max-w-[20ch] font-display text-[50px] font-semibold leading-[1.06] [text-wrap:balance]">
          {t('h1')}
        </h1>
        <p className="m-0 mt-[16px] max-w-[56ch] text-[17px] leading-[1.65] text-body [text-wrap:pretty]">{t('lead')}</p>
        <HeroButtons next={{ href: '/bruksomrader', label: t('next') }} />

        <div className="mt-[40px] overflow-hidden rounded-[22px] border border-line bg-sf shadow-[0_30px_60px_-36px_rgba(25,21,16,.45)]">
          <div className="flex items-center gap-[8px] border-b border-line bg-bg px-[18px] py-[11px]">
            <span className="block h-[9px] w-[9px] rounded-pill bg-line" />
            <span className="block h-[9px] w-[9px] rounded-pill bg-line" />
            <span className="block h-[9px] w-[9px] rounded-pill bg-line" />
            <span className="ml-[12px] flex min-w-0 gap-[2px] overflow-hidden">
              {appNav.map((l, i) => (
                <span
                  key={l}
                  className={`rounded-[8px] px-[10px] py-[5px] text-[11.5px] ${i === 0 ? 'bg-sbg font-bold' : 'font-medium'}`}
                >
                  {l}
                </span>
              ))}
            </span>
            <span className="ml-auto flex-none text-[11px] text-mut max-sm:hidden">{t('app.org')}</span>
          </div>
          <div className="grid gap-[16px] px-[22px] pb-[22px] pt-[20px] [grid-template-columns:minmax(0,1.1fr)_minmax(0,1fr)] max-md:[grid-template-columns:minmax(0,1fr)] max-sm:px-[14px]">
            <div className="rounded-note border border-line bg-bg px-[22px] py-[20px]">
              <span className="block text-[11px] uppercase tracking-[0.11em] text-mut">{t('app.indexLabel')}</span>
              <span className="mt-[8px] flex items-end gap-[14px]">
                <span className="font-display text-[60px] font-semibold leading-[.85]">{t('app.index')}</span>
                <span className="pb-[8px]">
                  <span className="block text-[13.5px] font-bold text-danger">{t('app.delta')}</span>
                  <span className="mt-[2px] block text-[12px] text-mut">{t('app.answered')}</span>
                </span>
              </span>
              <span className="mt-[18px] flex h-[26px] gap-[3px] overflow-hidden rounded-[8px]">
                <span className="block flex-[4] bg-mint" />
                <span className="block flex-[5] bg-band" />
                <span className="block flex-[2] bg-peach2" />
              </span>
              <span className="mt-[7px] flex justify-between text-[11px] text-mut">
                {bands.map((b) => (
                  <span key={b}>{b}</span>
                ))}
              </span>
              <span className="mt-[18px] block rounded-cta bg-sbg px-[14px] py-[12px] text-[12.5px] leading-[1.5]">
                {t('app.tuva')}
              </span>
            </div>
            <div className="flex flex-col gap-[10px]">
              <span className="block text-[11px] uppercase tracking-[0.11em] text-mut">{t('app.waiting')}</span>
              {todo.map((x) => (
                <span
                  key={x.t}
                  className="flex items-center gap-[12px] rounded-tile border border-line bg-sf px-[14px] py-[12px]"
                >
                  <span className="block w-[6px] flex-none self-stretch rounded-pill" style={{ background: x.c }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold [text-wrap:pretty]">{x.t}</span>
                    <span className="mt-[2px] block text-[11.5px] text-mut">{x.m}</span>
                  </span>
                  <span
                    className="flex h-[30px] flex-none items-center rounded-bar border border-ink px-[12px] text-[11.5px] font-bold"
                    style={{ background: x.bg }}
                  >
                    {x.cta}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-[22px] flex flex-wrap gap-[6px]">
          {SECTIONS.map((id) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-pill border border-line bg-sf px-[14px] py-[8px] text-[13px] font-semibold text-ink hover:text-ink"
            >
              {t(`sections.${id}`)}
            </a>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ what you get */}
      <section id="plattform" className="mx-auto max-w-[1120px] scroll-mt-[118px] px-[26px] pt-[56px]">
        <h2 className="m-0 max-w-[24ch] font-display text-[30px] font-semibold leading-[1.14] [text-wrap:balance]">{t('get')}</h2>
        <div className="mt-[24px] grid gap-[13px] [grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr))]">
          {features.map((f) => (
            <div key={f.k} className="flex flex-col gap-[10px] rounded-panel border border-line bg-sf p-[20px]">
              <span className="self-start rounded-pill bg-sbg px-[10px] py-[4px] text-[11px] font-bold uppercase tracking-[0.04em]">
                {f.k}
              </span>
              <span className="flex h-[40px] items-end gap-[3px]">
                {f.bars.map(([h, bg], i) => (
                  <span key={i} className="block flex-1 rounded-[4px_4px_0_0]" style={{ height: h, background: bg }} />
                ))}
              </span>
              <span className="text-[16px] font-bold leading-[1.3] [text-wrap:pretty]">{f.t}</span>
              <span className="text-[13px] leading-[1.55] text-mut [text-wrap:pretty]">{f.d}</span>
            </div>
          ))}
        </div>

        <div className="mt-[22px] grid items-start gap-[22px] [grid-template-columns:minmax(0,1fr)_340px] max-lg:[grid-template-columns:minmax(0,1fr)]">
          <div className="min-w-0 rounded-card border border-line bg-sf px-[24px] py-[22px]">
            <span className="flex flex-wrap items-baseline justify-between gap-[12px]">
              <span className="text-[16px] font-bold">{t('heat.title')}</span>
              <span className="text-[12px] text-mut">{t('heat.note')}</span>
            </span>
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t('heat.title')}>
              <div className="mt-[14px] grid min-w-[560px] gap-[4px] text-[12px] [grid-template-columns:120px_repeat(5,1fr)]">
                <span />
                {heatCols.map((c) => (
                  <span key={c} className="text-center text-mut">
                    {c}
                  </span>
                ))}
                {heatRows.map((r) => (
                  <HeatRow key={r.team} team={r.team} cells={r.cells} />
                ))}
              </div>
            </div>
            <div className="mt-[16px] flex flex-wrap gap-[8px]">
              {heatTabs.map((l, i) => (
                <span
                  key={l}
                  className={`rounded-pill px-[11px] py-[5px] text-[11.5px] ${i === 0 ? 'bg-sbg font-bold' : 'border border-line font-semibold'}`}
                >
                  {l}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-[10px]">
            {callouts.map((c, i) => (
              <div key={c.t} className="flex gap-[12px] rounded-opt border border-line bg-sf px-[16px] py-[14px]">
                <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-pill border border-ink bg-ac text-[12px] font-bold">
                  {i + 1}
                </span>
                <span>
                  <span className="block text-[14px] font-bold">{c.t}</span>
                  <span className="mt-[3px] block text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">{c.d}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- målinger */}
      <section id="malinger" className={SPLIT}>
        <div>
          <SectionHead k={t('malinger.k')} t={t('malinger.t')} d={t('malinger.d')} />
          <Points items={Strs.parse(t.raw('malinger.points'))} />
        </div>
        <div className="rounded-card border border-line bg-sf px-[24px] py-[22px]">
          <span className="flex items-baseline justify-between gap-[10px]">
            <span className="text-[15px] font-bold">{t('malinger.wheelTitle')}</span>
            <span className="text-[12px] text-mut">{t('malinger.wheelNote')}</span>
          </span>
          <div className="mt-[16px] grid grid-cols-12 gap-[5px]">
            {months.map((m, i) => {
              const base = i === BASE_MONTH
              const pulse = PULSE_MONTHS.includes(i)
              return (
                <span key={m} className="text-center">
                  <span className="block text-[10px] font-bold text-mut">{m}</span>
                  <span
                    className="mx-auto mt-[8px] block h-[22px] w-[22px] rounded-pill border-2"
                    style={{
                      background: base ? '#F5C64A' : pulse ? '#A8D5D2' : '#FFFDF6',
                      borderColor: base ? '#191510' : pulse ? '#2F5D2A' : '#E8DFC9',
                    }}
                  />
                  <span
                    className={`mt-[6px] block min-h-[13px] text-[10px] font-semibold ${base || pulse ? 'text-ink' : 'text-faint'}`}
                  >
                    {base ? t('malinger.base') : pulse ? t('malinger.pulse') : i === HOLIDAY ? t('malinger.holiday') : ''}
                  </span>
                </span>
              )
            })}
          </div>
          <div className="mt-[18px] rounded-opt border border-line bg-bg px-[16px] py-[14px]">
            <span className="block text-[11px] uppercase tracking-[0.1em] text-mut">{t('malinger.each')}</span>
            <div className="mt-[9px] flex flex-col gap-[6px]">
              {cascade.map((c) => (
                <span key={c.who} className="flex justify-between gap-[10px] text-[12.5px]">
                  <span>{c.who}</span>
                  <strong className="whitespace-nowrap">{c.when}</strong>
                </span>
              ))}
            </div>
          </div>
          <div className="mt-[14px] flex flex-wrap gap-[8px]">
            <span className="rounded-pill bg-sbg px-[11px] py-[5px] text-[11.5px] font-bold">{wheelChips[0]}</span>
            <span className="rounded-pill bg-mint px-[11px] py-[5px] text-[11.5px] font-bold text-greendeep">
              {wheelChips[1]}
            </span>
            <span className="rounded-pill border border-line px-[11px] py-[5px] text-[11.5px] font-semibold">
              {wheelChips[2]}
            </span>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- respondent */}
      <section id="respondent" className={SPLIT}>
        <div className="order-1 flex justify-center">
          <div className="w-[240px] rounded-[28px] bg-ink p-[7px]">
            <div className="overflow-hidden rounded-[22px] bg-bg">
              <div className="flex justify-between px-[15px] pb-[4px] pt-[9px] text-[10px] font-semibold text-mut">
                <span>{t('respondent.phone.time')}</span>
                <span>{t('respondent.phone.org')}</span>
              </div>
              <div className="px-[15px] pt-[6px]">
                <span className="flex items-center gap-[10px]">
                  <span className="h-[5px] flex-1 overflow-hidden rounded-pill bg-[rgba(25,21,16,.1)]">
                    <span className="block h-full w-[42%] rounded-pill bg-ac" />
                  </span>
                  <span className="text-[11px] font-semibold text-mut">{t('respondent.phone.progress')}</span>
                </span>
              </div>
              <div className="px-[15px] pb-[10px] pt-[14px]">
                <span className="inline-block rounded-pill bg-sbg px-[8px] py-[3px] text-[9.5px] font-bold uppercase tracking-[0.05em]">
                  {t('respondent.phone.factor')}
                </span>
                <span className="mt-[9px] block font-display text-[16px] font-medium leading-[1.3] [text-wrap:pretty]">
                  {t('respondent.phone.statement')}
                </span>
                <div className="mt-[11px] flex flex-col gap-[5px]">
                  {options.map((l, i) => {
                    const on = i === 3
                    return (
                      <span
                        key={l}
                        className={`flex items-center gap-[8px] rounded-bar border px-[10px] py-[7px] ${on ? 'border-ink bg-sbg' : 'border-line bg-sf'}`}
                      >
                        <span
                          className={`block h-[15px] w-[15px] flex-none rounded-pill border-2 ${on ? 'border-ink bg-ink' : 'border-rule bg-transparent'}`}
                        />
                        <span className={`text-[11px] ${on ? 'font-bold' : 'font-medium'}`}>{l}</span>
                      </span>
                    )
                  })}
                </div>
                <span className="mt-[8px] block rounded-bar border border-dashed border-rule px-[10px] py-[8px] text-[10.5px] text-mut">
                  {t('respondent.phone.more')}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-line px-[15px] pb-[13px] pt-[9px]">
                <span className="text-[11px] font-semibold text-mut">{t('respondent.phone.skip')}</span>
                <span className="flex h-[32px] items-center rounded-bar bg-ink px-[16px] text-[12px] font-bold text-bg">
                  {t('respondent.phone.next')}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="order-2">
          <SectionHead k={t('respondent.k')} t={t('respondent.t')} d={t('respondent.d')} />
          <Points items={Strs.parse(t.raw('respondent.points'))} />
        </div>
      </section>

      {/* -------------------------------------------------------------- resultater */}
      <section id="resultater" className={STACK}>
        <SectionHead k={t('resultater.k')} t={t('resultater.t')} d={t('resultater.d')} h2Max="max-w-[24ch]" pMax="max-w-[60ch]" />
        <div className="mt-[24px] grid items-start gap-[16px] [grid-template-columns:minmax(0,1.5fr)_minmax(280px,1fr)] max-md:[grid-template-columns:minmax(0,1fr)]">
          <div className="overflow-hidden rounded-card border border-line bg-sf">
            <div className="grid gap-[12px] bg-bg px-[20px] py-[12px] text-[10.5px] uppercase tracking-[0.09em] text-mut [grid-template-columns:minmax(0,1.3fr)_minmax(0,2fr)_80px]">
              <span>{head[0]}</span>
              <span>{head[1]}</span>
              <span className="text-right">{head[2]}</span>
            </div>
            {riskRows.map((r) => {
              const k = risk(r.v)
              return (
                <div
                  key={r.l}
                  className="grid items-center gap-[12px] border-t border-line px-[20px] py-[12px] [grid-template-columns:minmax(0,1.3fr)_minmax(0,2fr)_80px]"
                  style={{ background: r.v < 50 ? 'rgba(251,213,196,.3)' : 'transparent' }}
                >
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold">{r.l}</span>
                    <span className="mt-[1px] block text-[11px] text-mut">{r.law}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-[8px]">
                      <span className="text-[18px] font-bold leading-none">{r.v}</span>
                      <span
                        className={`text-[12px] font-semibold ${r.d <= -3 ? 'text-danger' : r.d >= 3 ? 'text-link' : 'text-mut'}`}
                      >
                        {(r.d > 0 ? '+' : '−') + Math.abs(r.d)}
                      </span>
                    </span>
                    <span className="mt-[6px] block h-[6px] overflow-hidden rounded-pill bg-[rgba(25,21,16,.08)]">
                      <span className="block h-full rounded-pill" style={{ width: `${r.v}%`, background: k.bar }} />
                    </span>
                  </span>
                  <span className="text-right">
                    <span
                      className="inline-block rounded-pill px-[10px] py-[4px] text-[11px] font-bold"
                      style={{ background: k.bg, color: k.fg }}
                    >
                      {t(`resultater.risk.${k.key}`)}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
          <div className="flex flex-col gap-[12px]">
            <div className="rounded-note border border-line bg-sf px-[20px] py-[18px]">
              <span className="block text-[11px] uppercase tracking-[0.1em] text-mut">{t('resultater.top3')}</span>
              <div className="mt-[10px] flex flex-col gap-[8px]">
                {top.map((x, i) => (
                  <span key={x.t} className="flex items-center gap-[10px]">
                    <span className="flex h-[24px] w-[24px] flex-none items-center justify-center rounded-pill bg-ink text-[11.5px] font-bold text-bg">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold">{x.t}</span>
                      <span className="block text-[11px] text-mut">{x.m}</span>
                    </span>
                    <span className="flex-none text-[13px] font-bold text-link">{x.lift}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-note border border-line bg-sf px-[20px] py-[18px]">
              <span className="block text-[11px] uppercase tracking-[0.1em] text-mut">{t('resultater.trend')}</span>
              <svg viewBox="0 0 240 70" width="100%" height="70" className="mt-[10px] block" aria-hidden="true">
                <polyline
                  points="0,30 60,24 120,38 180,46 240,30"
                  fill="none"
                  stroke="#191510"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <circle cx="180" cy="46" r="4.5" fill="#F5C64A" stroke="#191510" strokeWidth="1.5" />
                <circle cx="240" cy="30" r="4" fill="#2F5D2A" />
              </svg>
              <span className="mt-[2px] flex justify-between text-[10px] text-mut">
                {trendLabels.map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- fire visninger */}
      <section id="segment" className={STACK}>
        <SectionHead k={t('segment.k')} t={t('segment.t')} h2Max="max-w-[24ch]" />
        <div className="mt-[24px] grid gap-[13px] [grid-template-columns:repeat(auto-fit,minmax(min(250px,100%),1fr))]">
          {views.map((v, i) => (
            <div key={v.t} className="flex flex-col gap-[12px] rounded-panel border border-line bg-sf p-[18px]">
              <div className="h-[110px] overflow-hidden rounded-cta border border-line bg-bg p-[12px]">
                {i === 0 ? (
                  <span className="grid h-full grid-cols-5 gap-[3px]">
                    {MINI_HEAT.map((c, n) => (
                      <span key={n} className="block rounded-[4px]" style={{ background: HEAT[c].bg }} />
                    ))}
                  </span>
                ) : i === 1 ? (
                  <span className="flex h-full flex-col justify-center gap-[6px]">
                    {prio.map((b) => (
                      <span key={b.l} className="flex items-center gap-[6px]">
                        <span className="w-[44px] text-right text-[9px] text-mut">{b.l}</span>
                        <span className="h-[12px] flex-1 overflow-hidden rounded-[4px] bg-[rgba(25,21,16,.06)]">
                          <span className="block h-full rounded-[4px]" style={{ width: b.w, background: b.bg }} />
                        </span>
                      </span>
                    ))}
                  </span>
                ) : i === 2 ? (
                  <svg viewBox="0 0 200 86" width="100%" height="100%" aria-hidden="true">
                    <polyline
                      points="10,60 50,40 90,56 130,30 170,36 195,50"
                      fill="none"
                      stroke="#C4BCA8"
                      strokeWidth="2"
                      strokeDasharray="3 3"
                    />
                    <polyline
                      points="10,64 50,66 90,72 130,40 170,44 195,60"
                      fill="none"
                      stroke="#D4633A"
                      strokeWidth="2.5"
                      strokeLinejoin="round"
                    />
                    <circle cx="90" cy="72" r="4" fill="#D4633A" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 200 86" width="100%" height="100%" aria-hidden="true">
                    <polyline
                      points="10,50 60,44 110,58 160,64 195,42"
                      fill="none"
                      stroke="#191510"
                      strokeWidth="2.5"
                      strokeLinejoin="round"
                    />
                    <polyline
                      points="10,54 60,52 110,50 160,48 195,46"
                      fill="none"
                      stroke="#C4BCA8"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                    />
                    <circle cx="160" cy="64" r="4" fill="#F5C64A" stroke="#191510" strokeWidth="1.5" />
                  </svg>
                )}
              </div>
              <span>
                <span className="block text-[15.5px] font-bold">{v.t}</span>
                <span className="mt-[4px] block text-[13px] leading-[1.5] text-mut [text-wrap:pretty]">{v.d}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------- kommentarer */}
      <section id="kommentarer" className={SPLIT}>
        <div>
          <SectionHead k={t('kommentarer.k')} t={t('kommentarer.t')} d={t('kommentarer.d')} />
          <Points items={Strs.parse(t.raw('kommentarer.points'))} />
        </div>
        <div className="grid items-start gap-[12px] [grid-template-columns:150px_minmax(0,1fr)] max-sm:[grid-template-columns:minmax(0,1fr)]">
          <div className="flex flex-col gap-[6px]">
            {themes.map((x, i) => (
              <span
                key={x.l}
                className={`rounded-btn border px-[12px] py-[10px] ${i === 0 ? 'border-ink bg-sbg' : 'border-line bg-sf'}`}
              >
                <span className="block text-[12px] font-bold">{x.l}</span>
                <span className="mt-[1px] block text-[10.5px] text-mut">{x.n}</span>
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-[10px]">
            <div className="rounded-opt border border-line bg-sf px-[16px] py-[14px]">
              <span className="flex flex-wrap items-center gap-[6px]">
                <span className="rounded-pill border border-line bg-bg px-[8px] py-[2px] text-[10.5px] font-bold">
                  {t('kommentarer.c1.factor')}
                </span>
                <span className="rounded-pill bg-peach px-[8px] py-[2px] text-[10px] font-bold text-dangerdeep">
                  {t('kommentarer.c1.tone')}
                </span>
                <span className="ml-auto text-[11px] font-semibold text-danger">{t('kommentarer.c1.status')}</span>
              </span>
              <span className="mt-[8px] block text-[13.5px] leading-[1.5] [text-wrap:pretty]">{t('kommentarer.c1.text')}</span>
              <span className="mt-[10px] flex gap-[7px]">
                <span className="flex h-[34px] flex-1 items-center rounded-bar border border-line bg-bg px-[12px] text-[12px] text-faint">
                  {t('kommentarer.c1.reply')}
                </span>
                <span className="flex h-[34px] items-center rounded-bar border border-ink bg-ac px-[14px] text-[12px] font-bold">
                  {t('kommentarer.c1.send')}
                </span>
              </span>
            </div>
            <div className="rounded-opt border border-line bg-sf px-[16px] py-[14px]">
              <span className="flex flex-wrap items-center gap-[6px]">
                <span className="rounded-pill border border-line bg-bg px-[8px] py-[2px] text-[10.5px] font-bold">
                  {t('kommentarer.c2.factor')}
                </span>
                <span className="rounded-pill bg-mint px-[8px] py-[2px] text-[10px] font-bold text-greendeep">
                  {t('kommentarer.c2.tone')}
                </span>
                <span className="ml-auto text-[11px] font-semibold text-link">{t('kommentarer.c2.status')}</span>
              </span>
              <span className="mt-[8px] block text-[13.5px] leading-[1.5] [text-wrap:pretty]">{t('kommentarer.c2.text')}</span>
              <span className="mt-[9px] block rounded-bar bg-mint px-[11px] py-[9px] text-[12px] leading-[1.45]">
                <strong>{t('kommentarer.c2.youLabel')}</strong> {t('kommentarer.c2.you')}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ tiltak */}
      <section id="tiltak" className={STACK}>
        <SectionHead k={t('tiltak.k')} t={t('tiltak.t')} d={t('tiltak.d')} h2Max="max-w-[24ch]" pMax="max-w-[60ch]" />
        <div className="mt-[24px] grid gap-[13px] [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
          <div className="rounded-panel border border-line bg-sf p-[20px]">
            <span className="block text-[11px] uppercase tracking-[0.1em] text-mut">{t('tiltak.suggestTitle')}</span>
            <div className="mt-[12px] flex flex-col gap-[8px]">
              {suggest.map((s) => (
                <span key={s.t} className="rounded-cta border border-line bg-bg px-[14px] py-[12px]">
                  <span className="flex items-center gap-[6px]">
                    <span className="rounded-pill px-[8px] py-[2px] text-[10px] font-bold" style={{ background: s.tbg }}>
                      {s.type}
                    </span>
                    <span className="text-[10.5px] text-mut">{s.time}</span>
                  </span>
                  <span className="mt-[6px] block text-[13px] font-semibold [text-wrap:pretty]">{s.t}</span>
                  <span className="mt-[3px] block text-[11.5px] text-mut">{t('tiltak.measuredOn', { q: s.q })}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-panel border border-line bg-sf p-[20px]">
            <span className="flex flex-wrap justify-between gap-[8px]">
              <span className="rounded-pill bg-sbg px-[9px] py-[3px] text-[10.5px] font-bold uppercase tracking-[0.04em]">
                {t('tiltak.card.factor')}
              </span>
              <span className="rounded-pill bg-peach px-[9px] py-[3px] text-[10.5px] font-bold text-dangerdeep">
                {t('tiltak.card.late')}
              </span>
            </span>
            <span className="mt-[10px] block text-[16px] font-bold [text-wrap:pretty]">{t('tiltak.card.t')}</span>
            <span className="mt-[3px] block text-[12.5px] text-mut">{t('tiltak.card.m')}</span>
            <div className="mt-[18px] flex gap-0">
              {steps.map((l, i) => (
                <span key={l} className="flex-1 text-center">
                  <span className={`mx-[1px] block h-[6px] rounded-pill ${i <= 2 ? 'bg-ac' : 'bg-line'}`} />
                  <span className={`mt-[6px] block text-[9.5px] ${i === 2 ? 'font-bold text-ink' : 'font-medium text-mut'}`}>
                    {l}
                  </span>
                </span>
              ))}
            </div>
            <span className="mt-[16px] block rounded-cta bg-bg px-[14px] py-[12px] text-[12.5px] leading-[1.5] [text-wrap:pretty]">
              {t('tiltak.card.note')}
            </span>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- rapport */}
      <section id="rapport" className={SPLIT}>
        <div>
          <SectionHead k={t('rapport.k')} t={t('rapport.t')} d={t('rapport.d')} />
          <Points items={Strs.parse(t.raw('rapport.points'))} />
        </div>
        <div className="grid grid-cols-2 gap-[12px]">
          {pages.map((p) => (
            <div
              key={p.k}
              className="flex aspect-[1/1.3] flex-col gap-[6px] rounded-ctl border border-line bg-sf p-[14px] shadow-[0_10px_24px_-18px_rgba(25,21,16,.4)]"
            >
              <span className="text-[8.5px] uppercase tracking-[0.1em] text-mut">{p.k}</span>
              <span className="font-display text-[12.5px] font-semibold leading-[1.2]">{p.t}</span>
              <span className="mt-[4px] flex flex-col gap-[4px]">
                {p.lines.map(([w, bg], i) => (
                  <span key={i} className="block h-[5px] rounded-pill" style={{ width: w, background: bg }} />
                ))}
              </span>
              <span className="mt-auto text-[8px] text-faint">{p.f}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ roller */}
      <section id="roller" className={STACK}>
        <SectionHead k={t('roller.k')} t={t('roller.t')} d={t('roller.d')} h2Max="max-w-[24ch]" pMax="max-w-[60ch]" />
        <div className="mt-[24px] overflow-x-auto" tabIndex={0} role="region" aria-label={t('roller.t')}>
          <div className="min-w-[640px] overflow-hidden rounded-panel border border-line bg-sf">
            <div className="grid bg-bg px-[20px] py-[12px] text-[11.5px] font-bold text-mut [grid-template-columns:1.6fr_repeat(3,1fr)]">
              <span />
              {roles.map((r) => (
                <span key={r} className="text-center">
                  {r}
                </span>
              ))}
            </div>
            {perms.map((r) => (
              <div
                key={r.k}
                className="grid items-center border-t border-line px-[20px] py-[12px] text-[13px] [grid-template-columns:1.6fr_repeat(3,1fr)]"
              >
                <span className="font-semibold">{r.k}</span>
                {r.c.map((v, i) => (
                  <span
                    key={i}
                    className={`text-center text-[12px] ${v === t('roller.none') ? 'text-faint' : 'text-ink'} ${v === t('roller.yes') ? 'font-bold' : 'font-medium'}`}
                  >
                    {v}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- oppsett */}
      <section id="oppsett" className={STACK}>
        <SectionHead k={t('oppsett.k')} t={t('oppsett.t')} h2Max="max-w-[24ch]" />
        <div className="mt-[24px] grid gap-[13px] [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
          {setup.map((s) => (
            <div key={s.t} className="rounded-note border border-line bg-sf p-[18px]">
              <span className="flex h-[38px] w-[38px] items-center justify-center rounded-btn bg-sbg text-[15px] font-bold">
                {s.i}
              </span>
              <span className="mt-[12px] block text-[15px] font-bold">{s.t}</span>
              <span className="mt-[4px] block text-[13px] leading-[1.5] text-mut [text-wrap:pretty]">{s.d}</span>
            </div>
          ))}
        </div>
        <div className="mt-[16px] flex flex-wrap items-center gap-[7px]">
          <span className="mr-[4px] text-[11px] uppercase tracking-[0.09em] text-mut">{t('oppsett.integrations')}</span>
          {integrations.map((x) => (
            <span
              key={x.l}
              className={`flex items-center gap-[7px] rounded-pill border px-[13px] py-[7px] text-[12.5px] font-semibold ${
                x.soon ? 'border-dashed border-line bg-transparent text-faint' : 'border-solid border-line bg-sf text-ink'
              }`}
            >
              {x.l}
              {x.soon ? (
                <span className="rounded-pill bg-sbg px-[7px] py-[1px] text-[10px] font-bold uppercase tracking-[0.04em] text-cautiondeep">
                  {t('oppsett.soon')}
                </span>
              ) : null}
            </span>
          ))}
        </div>
        <p className="m-0 mt-[12px] max-w-[60ch] text-[12.5px] text-mut [text-wrap:pretty]">{t('oppsett.note')}</p>
      </section>

      {/* --------------------------------------------------------------- assistent */}
      <section id="assistent" className={SPLIT}>
        <div>
          <SectionHead k={t('assistent.k')} t={t('assistent.t')} d={t('assistent.d')} />
        </div>
        <div className="rounded-card bg-sbg px-[24px] py-[22px]">
          <div className="flex items-start gap-[14px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/tuva/av4.png"
              alt=""
              width={52}
              height={52}
              className="h-[52px] w-[52px] flex-none rounded-opt bg-sf object-cover"
            />
            <span>
              <span className="block text-[14px] leading-[1.6] [text-wrap:pretty]">
                <strong>{t('assistent.tuvaName')}</strong> {t('assistent.tuva')}
              </span>
              <span className="mt-[12px] inline-flex h-[34px] items-center rounded-bar border border-ink bg-sf px-[14px] text-[12.5px] font-bold">
                {t('assistent.draft')}
              </span>
            </span>
          </div>
          <div className="mt-[18px] flex flex-wrap gap-[8px] border-t border-[rgba(25,21,16,.15)] pt-[16px]">
            {assistChips.map((c) => (
              <span key={c} className="rounded-pill bg-sf px-[11px] py-[5px] text-[11.5px] font-semibold">
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      <StartBand />
    </div>
  )
}

/** A section of two halves side by side, as the design sets them. */
const SPLIT =
  'mx-auto grid max-w-[1120px] scroll-mt-[118px] items-center gap-[36px] px-[26px] pt-[56px] [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]'
/** A section of one column. */
const STACK = 'mx-auto max-w-[1120px] scroll-mt-[118px] px-[26px] pt-[56px]'

function HeatRow({ team, cells }: { team: string; cells: readonly number[] | null }) {
  return (
    <>
      <span className="flex items-center font-semibold">{team}</span>
      {(cells ?? [0, 0, 0, 0, 0]).map((c, i) =>
        cells ? (
          <span
            key={i}
            className="rounded-[7px] py-[12px] text-center font-bold"
            style={{ background: HEAT[c]!.bg, color: HEAT[c]!.fg }}
          >
            {HEAT[c]!.v}
          </span>
        ) : (
          <span key={i} className="rounded-[7px] bg-[rgba(25,21,16,.05)] py-[12px] text-center font-bold text-faint">
            —
          </span>
        ),
      )}
    </>
  )
}
