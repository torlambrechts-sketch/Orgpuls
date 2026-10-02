import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { JsonLd } from '@/components/marketing/JsonLd'
import { SiteTop } from '@/components/site/v3/SiteTop'
import { StartBand } from '@/components/site/v3/StartBand'
import { pageMeta } from '@/lib/marketing/meta'
import { breadcrumbs, graph, organization } from '@/lib/marketing/schema'
import { zip } from '@/lib/site/zip'

/**
 * Bruksområder (D-190): design-reference/orgpuls/nettside-v3/Bruksomrader.dc.html. The hero with an
 * index of the eight situations, then each situation beside a card of example data, then the start
 * band. The words are `site.bruksomrader` (the v3 decision sheet's, no and en); the cards' numbers,
 * colours and the Plattform sections each case links to are here, as the design's `renderVals` holds
 * them. Class lists are the design's inline styles, value for value; below 640px the sheet's phone
 * numbers (G4.2) apply.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return pageMeta({
    title: t('seo.pages.bruksomrader.title'),
    description: t('seo.pages.bruksomrader.description'),
    path: '/bruksomrader',
  })
}

/** Where each «Dette bruker dere» goes: the Plattform v3 sections (decision sheet G8) */
const USE = {
  opp: '/plattform#oppsett',
  mal: '/plattform#malinger',
  rap: '/plattform#rapport',
  res: '/plattform#resultater',
  tilt: '/plattform#tiltak',
  kom: '/plattform#kommentarer',
  rol: '/plattform#roller',
} as const
type UseKey = keyof typeof USE

type FactorId = 'ytring' | 'mengde' | 'leder' | 'rolle' | 'mening'

/** the design's mark and pill colours (`yellow`, `mint`, `sand`, `green` and the risk pair) */
const TONE = {
  yellow: 'bg-ac text-ink',
  mint: 'bg-mint text-greendeep',
  sand: 'bg-track text-[#4A4339]',
  // G5: ink, not the design's white, on the green, so the ✓ reads at 5.37:1
  green: 'bg-greenbar text-ink',
  risk: 'bg-peach2 text-dangerdeep',
  review: 'bg-sbg text-cautiondeep',
} as const
type Tone = keyof typeof TONE

/** The cards' numbers and shapes, case by case, in the design's order. The words are in the messages. */
type Shape =
  | { kind: 'rows'; ordered: boolean; marks: ({ text: string; tone: Tone; hidden?: true; done?: true } | null)[]; pills?: (Tone | null)[]; factors?: (FactorId | null)[] }
  | { kind: 'year'; tags: (null | 'pulse' | 'base' | 'holiday')[] }
  | { kind: 'trend'; factor: FactorId; values: number[]; goal: number }
  | { kind: 'heat'; cols: FactorId[]; rows: { n: number; v: (number | null)[] }[] }
  | { kind: 'bars'; factor: FactorId; values: number[] }

const CASES: { id: string; smb?: true; uses: UseKey[]; shape: Shape }[] = [
  {
    id: 'uten-hr',
    smb: true,
    uses: ['opp'],
    shape: {
      kind: 'rows',
      ordered: true,
      marks: [{ text: '1', tone: 'yellow' }, { text: '2', tone: 'yellow' }, { text: '❝', tone: 'sand', hidden: true }],
      factors: ['ytring', 'mengde', null],
    },
  },
  {
    id: 'kartlegging',
    uses: ['mal', 'rap'],
    shape: { kind: 'year', tags: [null, null, 'pulse', null, null, 'pulse', 'holiday', null, 'base', null, null, 'pulse'] },
  },
  { id: 'puls', uses: ['mal', 'res'], shape: { kind: 'trend', factor: 'ytring', values: [48, 41, 44, 48, 53], goal: 60 } },
  {
    id: 'tilsyn',
    uses: ['rap', 'tilt'],
    shape: {
      kind: 'rows',
      ordered: true,
      marks: [
        { text: '✓', tone: 'green', done: true },
        { text: '✓', tone: 'green', done: true },
        { text: '3', tone: 'sand' },
        { text: '4', tone: 'sand' },
      ],
    },
  },
  {
    id: 'ett-team',
    uses: ['res', 'tilt'],
    shape: {
      kind: 'heat',
      cols: ['ytring', 'mengde', 'leder', 'rolle', 'mening'],
      rows: [
        { n: 8, v: [49, 51, 70, 74, 81] },
        { n: 9, v: [46, 31, 58, 59, 75] },
        { n: 8, v: [28, 47, 55, 72, 77] },
        { n: 3, v: [null, null, null, null, null] },
      ],
    },
  },
  { id: 'endring', uses: ['mal', 'res'], shape: { kind: 'bars', factor: 'rolle', values: [74, 58, 67, 49] } },
  // three bars: the design's fourth, «Blir hørt når noe skal endres», is Medvirkning's statement (claims B36)
  { id: 'ny-leder', uses: ['res', 'kom'], shape: { kind: 'bars', factor: 'leder', values: [61, 63, 68] } },
  {
    id: 'amu',
    uses: ['rol', 'rap'],
    shape: { kind: 'rows', ordered: false, marks: [null, null, null], pills: ['mint', 'mint', 'review'] },
  },
]
/** the AMU rows' marks: «§ 6-2» and «§ 9-2» in mint, «Risiko» in the risk pair; the text is the message's */
const AMU_MARK: Tone[] = ['mint', 'mint', 'risk']

const Row = z.object({ title: z.string(), sub: z.string(), mark: z.string().optional(), pill: z.string().optional() })
const Words = z.object({
  eyebrow: z.string(),
  short: z.string(),
  h: z.string(),
  p: z.string(),
  ticks: z.array(z.string()),
  caption: z.string(),
  card: z.object({
    title: z.string(),
    meta: z.string(),
    rows: z.array(Row).optional(),
    done: z.string().optional(),
    goal: z.string().optional(),
    labels: z.array(z.string()).optional(),
    sr: z.string().optional(),
    table: z.string().optional(),
    hidden: z.string().optional(),
    teams: z.array(z.object({ g: z.string(), sr: z.string() })).optional(),
    short: z.array(z.string()).optional(),
    bars: z.array(z.string()).optional(),
  }),
})
type Words = z.infer<typeof Words>

/** the factor a card's title names (`{factor}`), from the instrument's names (G2 R4) */
const cardFactor = (s: Shape): FactorId | undefined => (s.kind === 'trend' || s.kind === 'bars' ? s.factor : undefined)

const heatBg = (v: number | null) =>
  v == null ? 'bg-track' : v < 45 ? 'bg-orange' : v < 55 ? 'bg-orange2' : v < 65 ? 'bg-band' : v < 75 ? 'bg-mint' : 'bg-mint2'
const barBg = (v: number) => (v < 50 ? 'bg-rustbar' : v < 65 ? 'bg-amberbar' : 'bg-greenbar')

/** The DS Tick (18): a ✓ in a soft-mint square, at its own `line-height: normal` */
function Tick() {
  return (
    <span
      aria-hidden="true"
      className="mt-[2px] flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[6px] bg-mint text-[10px] font-bold leading-normal text-greendeep"
    >
      ✓
    </span>
  )
}

export default async function BruksomraderPage() {
  const t = await getTranslations('site.bruksomrader')
  const chrome = await getTranslations('site.chrome')
  const story = await getTranslations('site.story')
  const factor = await getTranslations('factor')

  const cases = zip(
    CASES,
    z.array(Words).parse(t.raw('sections')).map((w) => ({ w })),
  )
  const months = z.array(z.string()).length(12).parse(story.raw('months'))
  const tag = { pulse: story('pulse'), base: story('base'), holiday: story('holiday') }
  const name = (f: FactorId) => factor(`${f}.name`)
  const fill = (s: string, f: FactorId | null | undefined) => (f ? s.replace('{factor}', name(f)) : s)

  return (
    <>
      <JsonLd
        data={graph(
          organization(),
          breadcrumbs([
            { name: 'Orgpuls', path: '/' },
            { name: t('crumb'), path: '/bruksomrader' },
          ]),
        )}
      />
      <SiteTop>
        <section
          data-screen-label="Hero"
          className="w-full max-w-[1240px] animate-entry self-center px-[56px] pt-[40px] max-sm:px-0 max-sm:pt-[32px]"
        >
          <nav aria-label={chrome('crumbs')} className="text-[13px] text-body">
            <ol className="m-0 flex list-none gap-[8px] p-0">
              <li className="flex gap-[8px]">
                <Link href="/" className="text-body hover:text-body">
                  Orgpuls
                </Link>
                <span aria-hidden="true">›</span>
              </li>
              <li aria-current="page">{t('crumb')}</li>
            </ol>
          </nav>
          <div className="mt-[22px] grid items-end gap-x-[48px] gap-y-[24px] [grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr))]">
            <div>
              <span className="inline-block rounded-[9px] bg-ink px-[12px] py-[7px] text-[11px] font-bold uppercase tracking-[.12em] text-bg">
                {t('eyebrow')}
              </span>
              <h1 className="m-0 mt-[22px] font-display text-[56px] font-semibold leading-[1.04] tracking-[-.01em] [overflow-wrap:break-word] [text-wrap:balance] max-sm:text-[40px] max-sm:leading-[1.08] max-[359px]:text-[34px]">
                {t('h1')}
              </h1>
            </div>
            <div>
              <p className="m-0 max-w-[50ch] text-[17px] leading-[1.65] text-body [text-wrap:pretty]">{t('lead')}</p>
              <div className="mt-[22px] flex flex-wrap items-center gap-x-[26px] gap-y-[10px]">
                <a
                  href="#kom-i-gang"
                  className="flex min-h-[50px] items-center gap-[9px] rounded-[13px] border focus-visible:rounded-[13px] border-ink bg-ac px-[22px] text-[15.5px] font-bold text-ink hover:text-ink hover:no-underline"
                >
                  {chrome('trial')} <span aria-hidden="true">→</span>
                </a>
                <Link href="/plattform" className="text-[15.5px] font-bold hover:no-underline">
                  {t('next')} <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </div>
          <ul className="m-0 mt-[44px] grid list-none gap-[10px] p-0 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
            {cases.map((c, i) => (
              <li key={c.id} className="flex">
                <a
                  href={`#${c.id}`}
                  className={`flex flex-1 items-start gap-[12px] rounded-[16px] border focus-visible:rounded-[16px] px-[16px] py-[14px] text-ink hover:text-ink hover:no-underline ${
                    c.smb ? 'border-ink bg-sbg' : 'border-line bg-sf'
                  }`}
                >
                  <span
                    className={`flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-[13px] font-bold ${
                      c.smb ? 'bg-ac' : 'bg-track'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-bold">{c.w.eyebrow}</span>
                    <span className="mt-[2px] block text-[12.5px] leading-[1.45] text-body [text-wrap:pretty]">{c.w.short}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </SiteTop>

      <div className="flex flex-col">
        {cases.map((c, i) => (
          <Case
            key={c.id}
            index={i}
            id={c.id}
            w={c.w}
            uses={c.uses.map((u) => ({ href: USE[u], label: t(`use.${u}`) }))}
            usesLabel={t('usesLabel')}
            example={t('example')}
            title={fill(c.w.card.title, cardFactor(c.shape))}
          >
            <Card c={c} months={months} tag={tag} name={name} abbr={(f) => factor(`${f}.abbr`)} fill={fill} />
          </Case>
        ))}
      </div>

      <StartBand />
    </>
  )
}

/**
 * One situation: the text on one side, the card on the other, alternating (`row-reverse` on every
 * other one, and the surface with it). The DOM order is always text, then card, so a phone stacks
 * them in reading order and a screen reader meets the heading first (P-02).
 */
function Case({
  index,
  id,
  w,
  uses,
  usesLabel,
  example,
  title,
  children,
}: {
  index: number
  id: string
  w: Words
  title: string
  uses: { href: string; label: string }[]
  usesLabel: string
  example: string
  children: React.ReactNode
}) {
  const odd = index % 2 === 1
  return (
    <section
      id={id}
      aria-labelledby={`${id}-h`}
      data-screen-label={w.eyebrow}
      className={`border-b border-line ${odd ? 'bg-sf' : 'bg-bg'}`}
    >
      <div
        className={`mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-[64px] gap-y-[40px] px-[56px] py-[72px] max-sm:px-[16px] max-sm:py-[48px] ${
          odd ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        <div className="min-w-0 flex-[1_1_380px]">
          <span className="flex items-center gap-[10px]">
            <span
              aria-hidden="true"
              className="flex h-[28px] w-[28px] items-center justify-center rounded-full bg-ink text-[12.5px] font-bold text-bg"
            >
              {index + 1}
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[.12em] text-mut">{w.eyebrow}</span>
          </span>
          <h2
            id={`${id}-h`}
            className="m-0 mt-[16px] max-w-[22ch] font-display text-[38px] font-semibold leading-[1.1] [overflow-wrap:break-word] [text-wrap:balance] max-sm:text-[30px] max-sm:leading-[1.12]"
          >
            {w.h}
          </h2>
          <p className="m-0 mt-[14px] max-w-[52ch] text-[16px] leading-[1.65] text-body [text-wrap:pretty]">{w.p}</p>
          <ul className="m-0 mt-[20px] flex list-none flex-col gap-[10px] p-0">
            {w.ticks.map((tick) => (
              <li key={tick} className="flex items-start gap-[10px] text-[14.5px] leading-[1.5] [text-wrap:pretty]">
                <Tick />
                <span>{tick}</span>
              </li>
            ))}
          </ul>
          <div className="mt-[22px] flex flex-wrap items-center gap-x-[18px] gap-y-[8px]">
            <span id={`${id}-uses`} className="text-[11px] font-bold uppercase tracking-[.12em] text-mut">
              {usesLabel}
            </span>
            {/* the links wrap beside the label as the design's do; the list keeps its role (U-02) */}
            <ul role="list" aria-labelledby={`${id}-uses`} className="contents">
              {uses.map((u) => (
                <li key={u.href} className="list-none">
                  <Link href={u.href as Route} className="text-[14px] font-bold hover:no-underline">
                    {u.label} <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <figure aria-labelledby={`${id}-card`} className="m-0 min-w-0 flex-[1_1_420px]">
          <div className="rounded-[20px] border border-line bg-sf px-[24px] py-[22px] shadow-[0_18px_40px_-28px_rgba(25,21,16,.35)] max-sm:px-[16px] max-sm:py-[18px]">
            <div className="mb-[16px] flex flex-wrap items-baseline justify-between gap-x-[12px] gap-y-[6px]">
              <span id={`${id}-card`} className="text-[15px] font-bold">
                {title}
              </span>
              <span className="text-[12.5px] text-mut">{w.card.meta}</span>
            </div>
            {children}
          </div>
          <figcaption className="m-0 mt-[14px] text-[14px] leading-[1.6] text-body [text-wrap:pretty]">
            <strong className="text-greendeep">{w.caption}</strong> {example}
          </figcaption>
        </figure>
      </div>
    </section>
  )
}

/**
 * A case's card body, one renderer per shape (G-17): nothing in it is focusable. Rows are a list
 * (an `<ol>` where the marks number them); the year wheel is an `<ol>`; the trend chart is hidden
 * from a screen reader, which reads the same figures as a sentence; the heat map is an ARIA table;
 * bars are a list read «label – value», each bar hidden.
 */
function Card({
  c,
  months,
  tag,
  name,
  abbr,
  fill,
}: {
  c: (typeof CASES)[number] & { w: Words }
  months: string[]
  tag: Record<'pulse' | 'base' | 'holiday', string>
  name: (f: FactorId) => string
  abbr: (f: FactorId) => string
  fill: (s: string, f: FactorId | null | undefined) => string
}) {
  const s = c.shape
  const card = c.w.card

  if (s.kind === 'rows') {
    const rows = zip(
      s.marks.map((m, j) => ({ m, factor: s.factors?.[j] ?? null, pillTone: s.pills?.[j] ?? null, amu: AMU_MARK[j] ?? 'mint' })),
      z.array(Row).parse(card.rows),
    )
    const List = s.ordered ? 'ol' : 'ul'
    return (
      <List role="list" className="m-0 flex list-none flex-col gap-[9px] p-0">
        {rows.map((r) => {
          const mark = r.m ?? { text: r.mark ?? '', tone: r.amu, hidden: undefined, done: undefined }
          const pill = r.pillTone
          return (
            <li
              key={r.title}
              className={`flex items-center gap-x-[13px] rounded-[15px] border border-line bg-bg px-[16px] py-[13px] ${pill ? 'max-sm:grid max-sm:grid-cols-[auto_minmax(0,1fr)] max-sm:gap-y-[8px]' : ''}`}
            >
              <span
                aria-hidden={mark.hidden || mark.done ? 'true' : undefined}
                className={`box-border flex h-[30px] min-w-[30px] flex-none items-center justify-center rounded-full px-[6px] text-[12px] font-bold ${TONE[mark.tone]}`}
              >
                {mark.text}
              </span>
              {mark.done ? <span className="sr-only">{card.done}</span> : null}
              {/* below 640px a pill takes its own line under the text (a grid there), so the title keeps its width */}
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-bold [text-wrap:pretty]">{r.title}</span>
                <span className="mt-[2px] block text-[12.5px] text-body">{fill(r.sub, r.factor)}</span>
              </span>
              {pill ? (
                <span className={`flex-none rounded-full px-[10px] py-[4px] text-[11.5px] font-bold max-sm:col-start-2 max-sm:justify-self-start ${TONE[pill]}`}>{r.pill ?? ''}</span>
              ) : null}
            </li>
          )
        })}
      </List>
    )
  }

  if (s.kind === 'year') {
    return (
      <ol role="list" className="m-0 grid list-none grid-cols-6 gap-[7px] p-0 max-sm:grid-cols-4">
        {months.map((m, j) => {
          const k = s.tags[j] ?? null
          return (
            <li
              key={m}
              className={`flex min-h-[66px] flex-col justify-between gap-[6px] rounded-[13px] border px-[10px] py-[9px] ${
                k === 'base'
                  ? 'border-ink bg-sbg'
                  : k === 'pulse'
                    ? 'border-line bg-pulse'
                    : k === 'holiday'
                      ? 'border-line bg-track'
                      : 'border-line bg-bg'
              }`}
            >
              <span className="text-[12.5px] font-bold">{m}</span>
              {/* G5: «Ferie» in mut, not the design's faint */}
              <span className={`text-[11px] font-bold ${k === 'base' ? 'text-cautiondeep' : k === 'pulse' ? 'text-greendeep' : 'text-mut'}`}>
                {k ? tag[k] : ''}
              </span>
            </li>
          )
        })}
      </ol>
    )
  }

  if (s.kind === 'trend') {
    const bars = zip(
      s.values.map((v) => ({ v })),
      z.array(z.string()).parse(card.labels).map((l) => ({ l })),
    )
    return (
      <>
        <div aria-hidden="true">
          <div className="relative flex h-[200px] items-end gap-[12px] border-b border-line">
            <span className="absolute inset-x-0 border-t-[1.5px] border-dashed border-ink opacity-50" style={{ bottom: s.goal * 2 }} />
            {/* hidden below 640px: the meta line already says «stiplet linje = mål 60» (G4.2) */}
            <span className="absolute right-0 text-[11px] font-bold text-mut max-sm:hidden" style={{ bottom: s.goal * 2 + 4 }}>
              {card.goal}
            </span>
            {bars.map(({ v, l }, j) => (
              <span key={l} className="flex h-full flex-1 flex-col items-center justify-end gap-[6px]">
                <span className="font-display text-[18px] font-semibold tabular-nums">{v}</span>
                <span className={`w-full max-w-[56px] rounded-t-[9px] ${j < 2 ? 'bg-stone' : 'bg-sage'}`} style={{ height: Math.round(v * 2) }} />
              </span>
            ))}
          </div>
          <div className="mt-[8px] flex gap-[12px]">
            {bars.map(({ l }) => (
              <span key={l} className="flex-1 text-center text-[11.5px] text-mut">
                {l}
              </span>
            ))}
          </div>
        </div>
        <p className="sr-only">{card.sr}</p>
      </>
    )
  }

  if (s.kind === 'heat') {
    const rows = zip(s.rows, z.array(z.object({ g: z.string(), sr: z.string() })).parse(card.teams))
    const short = z.array(z.string()).length(s.cols.length).parse(card.short)
    const grid =
      'grid gap-[6px] [grid-template-columns:minmax(92px,1.3fr)_repeat(5,minmax(0,1fr))] max-sm:gap-[4px] max-sm:[grid-template-columns:minmax(64px,1fr)_repeat(5,minmax(0,1fr))]'
    return (
      <div role="table" aria-label={card.table} className="flex flex-col gap-[6px] max-sm:gap-[4px]">
        <div role="row" className={grid}>
          <span role="cell" />
          {s.cols.map((f, j) => (
            <span key={f} role="columnheader" aria-label={name(f)} className="text-center text-[11px] font-bold text-mut max-sm:text-[10px]">
              {/* below 360px the heads would collide: the sheet's three-letter forms (G4.2) */}
              <span className="max-[359px]:hidden">{abbr(f)}</span>
              <span className="hidden max-[359px]:inline">{short[j] ?? abbr(f)}</span>
            </span>
          ))}
        </div>
        {rows.map((r) => (
          <div key={r.g} role="row" className={`${grid} items-center`}>
            <span role="rowheader" className="text-[13px] font-bold">
              <span aria-hidden="true">
                {r.g} <span className="font-normal text-mut max-sm:block">· {r.n}</span>
              </span>
              <span className="sr-only">{r.sr}</span>
            </span>
            {r.v.map((v, k) => (
              <span
                key={k}
                role="cell"
                className={`flex h-[38px] items-center justify-center rounded-[9px] text-[13.5px] font-bold tabular-nums ${heatBg(v)}`}
              >
                {v == null ? (
                  <>
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">{card.hidden}</span>
                  </>
                ) : (
                  v
                )}
              </span>
            ))}
          </div>
        ))}
      </div>
    )
  }

  const bars = zip(
    s.values.map((v) => ({ v })),
    z.array(z.string()).parse(card.bars).map((l) => ({ l })),
  )
  return (
    <ul role="list" className="m-0 flex list-none flex-col gap-[14px] p-0">
      {bars.map(({ v, l }) => (
        <li key={l}>
          <span className="flex justify-between gap-[12px] text-[13.5px]">
            <span>{l}</span>
            <span className="sr-only"> – </span>
            <span className="font-bold tabular-nums">{v}</span>
          </span>
          <span aria-hidden="true" className="mt-[6px] block h-[8px] overflow-hidden rounded-[9px] bg-track">
            <span className={`block h-full rounded-[9px] ${barBg(v)}`} style={{ width: `${v}%` }} />
          </span>
        </li>
      ))}
    </ul>
  )
}
