import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { JsonLd } from '@/components/marketing/JsonLd'
import { Tick } from '@/components/site/parts'
import { SiteTop } from '@/components/site/v3/SiteTop'
import { StartBand } from '@/components/site/v3/StartBand'
import { pageMeta } from '@/lib/marketing/meta'
import { breadcrumbs, graph, organization } from '@/lib/marketing/schema'
import { zip } from '@/lib/site/zip'
import sporsmal from '@/assets/produkt/sporsmal.webp'

/**
 * Plattform (D-190): design-reference/orgpuls/nettside-v3/Plattform.dc.html.
 *
 * The hero, with four index cards into the page, then the design's eight parts of the product in
 * its order, each a text column and an example card side by side, the direction and the ground
 * alternating. A card is a `<figure>` captioned «Tenkte eksempeldata.»: its figures are invented,
 * as the design labels them. Words are messages (`site.plattform`, copy from the v3 decision
 * sheet); factor names are the instrument's own (`factor.<id>.name`). The colours each row is
 * drawn in, and the targets of the links, are here beside the markup that draws them.
 *
 * The text column comes first in the DOM in every section; `flex-row-reverse` only moves the card
 * to the left on screen (P-02). Below 640px the sections keep 16px to the screen's edge, the H1 is
 * 40px (34px below 360px), the H2s 30px, the cards pad 18px 16px and the year wheel is 4 × 3
 * (decision sheet G4.2).
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return pageMeta({
    title: t('seo.pages.plattform.title'),
    description: t('seo.pages.plattform.description'),
    path: '/plattform',
  })
}

type Ink = { bg: string; fg: string }
/** The design's mark and pill pairs (`red`, `ylw`, `mintP`, `yellow`, `sand`, `green`) */
const RED: Ink = { bg: 'bg-peach2', fg: 'text-dangerdeep' }
const YLW: Ink = { bg: 'bg-sbg', fg: 'text-cautiondeep' }
const MINT: Ink = { bg: 'bg-mint', fg: 'text-greendeep' }
const YELLOW: Ink = { bg: 'bg-ac', fg: 'text-ink' }
const SAND: Ink = { bg: 'bg-track', fg: 'text-[#4A4339]' }
/** green with cream glyphs; a digit on it is ink, which passes 4.5:1 where cream does not (G5) */
const GREEN: Ink = { bg: 'bg-greenbar', fg: 'text-sf' }
const GREEN_DIGIT: Ink = { bg: 'bg-greenbar', fg: 'text-ink' }
const ROLE: Ink = { bg: 'bg-ink', fg: 'text-bg' }

/** Where each section's «Les mer» goes (decision sheet G8) */
const USE: Record<CaseId, string> = {
  malinger: '/bruksomrader#kartlegging',
  respondent: '/artikler/medarbeiderundersokelse-sporsmal',
  resultater: '/bruksomrader#ett-team',
  kommentarer: '/bruksomrader#ny-leder',
  tiltak: '/bruksomrader#puls',
  rapport: '/bruksomrader#tilsyn',
  roller: '/bruksomrader#amu',
  oppsett: '/bruksomrader#uten-hr',
}
const CASES = ['malinger', 'respondent', 'resultater', 'kommentarer', 'tiltak', 'rapport', 'roller', 'oppsett'] as const
type CaseId = (typeof CASES)[number]

/** The hero's four index cards: the section each opens, its glyph, and whether it is the yellow one */
const INDEX = [
  { id: 'malinger', glyph: '◷', hot: false },
  { id: 'resultater', glyph: '▤', hot: false },
  { id: 'kommentarer', glyph: '❝', hot: false },
  { id: 'tiltak', glyph: '✓', hot: true },
] as const

/** Årshjulet 2026: pulses in March, June and December, the holiday in July, the main survey in September */
const MONTH_TAG: Record<number, 'pulse' | 'holiday' | 'main'> = { 2: 'pulse', 5: 'pulse', 6: 'holiday', 8: 'main', 11: 'pulse' }
const MONTH_STYLE = {
  none: 'border-line bg-bg',
  pulse: 'border-line bg-pulse',
  holiday: 'border-line bg-track',
  main: 'border-ink bg-sbg',
} as const
/** «Ferie» is mut, not the design's faint, which fails 4.5:1 (G5) */
const TAG_INK = { pulse: 'text-greendeep', holiday: 'text-mut', main: 'text-cautiondeep' } as const

/** Resultater: the factor of each row, and its risk colour */
const RESULT_ROWS = [
  { factor: 'ytring', ink: RED },
  { factor: 'mengde', ink: RED },
  { factor: 'motstrid', ink: YLW },
  { factor: 'leder', ink: YLW },
  { factor: 'rolle', ink: MINT },
] as const
const COMMENT_ROWS = [
  { factor: 'ytring', ink: RED },
  { factor: 'mening', ink: MINT },
] as const
/** The suggestions' kinds: rutine, workshop, lederpraksis */
const MEASURE_ROWS = [
  { mark: 'R', ink: YELLOW },
  { mark: 'W', ink: SAND },
  { mark: 'L', ink: SAND },
] as const
/** The report's sections 1 and 3 drawn green (done), 4 and 5 sand */
const REPORT_INK = [{ ink: GREEN_DIGIT }, { ink: GREEN_DIGIT }, { ink: SAND }, { ink: SAND }] as const
const SETUP_ROWS = [
  { glyph: '§', ink: GREEN, pillInk: MINT },
  { glyph: '⇪', ink: GREEN, pillInk: MINT },
  { glyph: '◐', ink: GREEN, pillInk: MINT },
  { glyph: '⇄', ink: SAND, pillInk: YLW },
] as const

const Str = z.string()
const Head = z.object({ title: Str, meta: Str })
const CaseText = z.object({
  eyebrow: Str,
  h: Str,
  p: Str,
  ticks: z.array(Str).min(1),
  use: Str,
  caption: Str,
  card: Head,
})

export default async function PlattformPage() {
  const t = await getTranslations('site.plattform')
  const all = await getTranslations()
  const chrome = await getTranslations('site.chrome')
  const seo = await getTranslations('seo.pages.plattform')

  const text = Object.fromEntries(CASES.map((id) => [id, CaseText.parse(t.raw(id))])) as Record<
    CaseId,
    z.infer<typeof CaseText>
  >
  const index = zip(INDEX, z.array(z.object({ t: Str, d: Str })).parse(t.raw('index')))
  const months = z.array(Str).length(12).parse(t.raw('malinger.months'))
  const resultRows = zip(RESULT_ROWS, z.array(z.object({ mark: Str, sub: Str, pill: Str })).parse(t.raw('resultater.rows')))
  const commentRows = zip(COMMENT_ROWS, z.array(z.object({ title: Str, sub: Str, pill: Str })).parse(t.raw('kommentarer.rows')))
  const measureRows = zip(MEASURE_ROWS, z.array(z.object({ title: Str, sub: Str })).parse(t.raw('tiltak.rows')))
  const reportRows = zip(REPORT_INK, z.array(z.object({ mark: Str, title: Str, sub: Str })).parse(t.raw('rapport.rows')))
  const roleRows = z.array(z.object({ mark: Str, title: Str, sub: Str, pill: Str })).length(3).parse(t.raw('roller.rows'))
  const setupRows = zip(SETUP_ROWS, z.array(z.object({ title: Str, sub: Str, pill: Str })).parse(t.raw('oppsett.rows')))
  const factor = (id: string) => all(`factor.${id}.name`)

  /** each section's card body; the head, frame and caption are the same for all eight */
  const body: Record<CaseId, React.ReactNode> = {
    malinger: (
      <ol className="m-0 grid list-none grid-cols-6 gap-[7px] p-0 max-sm:grid-cols-4">
        {months.map((m, i) => {
          const tag = MONTH_TAG[i]
          return (
            <li
              key={m}
              className={`flex min-h-[66px] flex-col justify-between gap-[6px] rounded-tile border px-[10px] py-[9px] ${MONTH_STYLE[tag ?? 'none']}`}
            >
              <span className="text-[12.5px] font-bold">{m}</span>
              {tag ? <span className={`text-[11px] font-bold ${TAG_INK[tag]}`}>{t(`malinger.tags.${tag}`)}</span> : null}
            </li>
          )
        })}
      </ol>
    ),
    // the respondent flow as an employee meets it on a phone: a real screen of the demo
    // organisation's main survey (scripts/marketing/product-shots.mjs), framed as the design frames it
    respondent: (
      <div className="-mx-[8px] -my-[6px] overflow-hidden rounded-[13px] border border-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- eager and sized, as the design draws it (D-190 §21) */}
        <img
          src={sporsmal.src}
          width={sporsmal.width}
          height={sporsmal.height}
          alt={all('seo.shots.sporsmal.alt')}
          className="block h-auto w-full"
        />
      </div>
    ),
    resultater: (
      <Rows
        rows={resultRows.map((r) => ({
          mark: r.mark,
          markInk: r.ink,
          title: factor(r.factor),
          sub: r.sub,
          pill: r.pill,
          pillInk: r.ink,
        }))}
      />
    ),
    kommentarer: (
      <Rows
        rows={commentRows.map((r) => ({
          mark: '❝',
          decorative: true,
          markInk: r.ink,
          title: r.title,
          sub: r.sub.replace('{factor}', factor(r.factor)),
          pill: r.pill,
          pillInk: r.ink,
        }))}
      />
    ),
    tiltak: (
      <Rows
        rows={measureRows.map((r) => ({
          mark: r.mark,
          decorative: true,
          markInk: r.ink,
          title: r.title,
          sub: r.sub,
          pill: t('tiltak.pill'),
          pillInk: YLW,
        }))}
      />
    ),
    rapport: (
      <Rows
        ordered
        rows={reportRows.map((r) => ({ mark: r.mark, markInk: r.ink, title: r.title, sub: r.sub }))}
      />
    ),
    roller: (
      <Rows
        rows={roleRows.map((r) => ({
          mark: r.mark,
          decorative: true,
          markInk: ROLE,
          title: r.title,
          sub: r.sub,
          pill: r.pill,
          pillInk: SAND,
        }))}
      />
    ),
    oppsett: (
      <Rows
        rows={setupRows.map((r) => ({
          mark: r.glyph,
          decorative: true,
          markInk: r.ink,
          title: r.title,
          sub: r.sub,
          pill: r.pill,
          pillInk: r.pillInk,
        }))}
      />
    ),
  }
  const cardTitle: Partial<Record<CaseId, string>> = {
    tiltak: text.tiltak.card.title.replace('{factor}', factor('ytring').toLocaleLowerCase()),
  }

  return (
    <>
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
      <SiteTop>
        <section
          data-screen-label="Hero"
          className="w-full max-w-[1240px] animate-entry self-center px-[56px] pt-[40px] max-sm:px-0 max-sm:pt-[32px]"
        >
          <nav aria-label={chrome('crumbs')}>
            <ol className="m-0 flex list-none flex-wrap gap-[8px] p-0 text-[13px] text-body">
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
              <span className="inline-block rounded-bar bg-ink px-[12px] py-[7px] text-[11px] font-bold uppercase tracking-[.12em] text-bg">
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
                  className="flex min-h-[50px] items-center gap-[9px] rounded-tile border border-ink bg-ac px-[22px] text-[15.5px] font-bold text-ink hover:text-ink hover:no-underline"
                >
                  {chrome('trial')} <span aria-hidden="true">→</span>
                </a>
                <Link href="/bruksomrader" className="text-[15.5px] font-bold hover:no-underline">
                  {t('next')} <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </div>
          <ul className="m-0 mt-[44px] grid list-none gap-[10px] p-0 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
            {index.map((c) => (
              <li key={c.id}>
                <a
                  href={`#${c.id}`}
                  className={`flex h-full items-start gap-[12px] rounded-note border px-[16px] py-[14px] text-ink hover:text-ink hover:no-underline ${
                    c.hot ? 'border-ink bg-sbg' : 'border-line bg-sf'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-[30px] w-[30px] flex-none items-center justify-center rounded-pill text-[13px] font-bold ${
                      c.hot ? 'bg-ac' : 'bg-track'
                    }`}
                  >
                    {c.glyph}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-bold">{c.t}</span>
                    <span className="mt-[2px] block text-[12.5px] leading-[1.45] text-body [text-wrap:pretty]">
                      {c.d}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </SiteTop>

      {CASES.map((id, i) => {
        const c = text[id]
        const odd = i % 2 === 1
        return (
          <section
            key={id}
            id={id}
            aria-labelledby={`${id}-h`}
            data-screen-label={c.eyebrow}
            className={`border-b border-line ${odd ? 'bg-sf' : 'bg-bg'}`}
          >
            <div
              className={`mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-[64px] gap-y-[40px] px-[56px] py-[72px] max-sm:px-[16px] max-sm:py-[48px] ${
                odd ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              <div className="min-w-0 flex-[1_1_380px]">
                <div className="flex items-center gap-[10px]">
                  <span
                    aria-hidden="true"
                    className="flex h-[28px] w-[28px] items-center justify-center rounded-pill bg-ink text-[12.5px] font-bold text-bg"
                  >
                    {i + 1}
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-[.12em] text-mut">{c.eyebrow}</span>
                </div>
                <h2
                  id={`${id}-h`}
                  className="m-0 mt-[16px] max-w-[22ch] font-display text-[38px] font-semibold leading-[1.1] [overflow-wrap:break-word] [text-wrap:balance] max-sm:text-[30px] max-sm:leading-[1.12]"
                >
                  {c.h}
                </h2>
                <p className="m-0 mt-[14px] max-w-[52ch] text-[16px] leading-[1.65] text-body [text-wrap:pretty]">{c.p}</p>
                <ul className="m-0 mt-[20px] flex list-none flex-col gap-[10px] p-0">
                  {c.ticks.map((tick) => (
                    <li key={tick} className="flex items-start gap-[10px] text-[14.5px] leading-[1.5] [text-wrap:pretty]">
                      <Tick />
                      <span>{tick}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-[22px] flex flex-wrap items-center gap-x-[18px] gap-y-[8px]">
                  <span id={`${id}-lesmer`} className="text-[11px] font-bold uppercase tracking-[.12em] text-mut">
                    {t('lesMer')}
                  </span>
                  <ul aria-labelledby={`${id}-lesmer`} className="m-0 flex list-none flex-wrap gap-x-[18px] gap-y-[8px] p-0">
                    <li>
                      <Link href={USE[id] as Route} className="text-[14px] font-bold hover:no-underline">
                        {c.use} <span aria-hidden="true">→</span>
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
              <figure aria-labelledby={`${id}-card`} className="m-0 min-w-0 flex-[1_1_420px]">
                <div className="rounded-card border border-line bg-sf px-[24px] py-[22px] shadow-[0_18px_40px_-28px_rgba(25,21,16,.35)] max-sm:px-[16px] max-sm:py-[18px]">
                  <div className="mb-[16px] flex flex-wrap items-baseline justify-between gap-x-[12px] gap-y-[6px]">
                    <span id={`${id}-card`} className="text-[15px] font-bold">
                      {cardTitle[id] ?? c.card.title}
                    </span>
                    <span className="text-[12.5px] text-mut">{c.card.meta}</span>
                  </div>
                  {body[id]}
                </div>
                <figcaption className="mt-[14px] text-[14px] leading-[1.6] text-body [text-wrap:pretty]">
                  <strong className="text-greendeep">{c.caption}</strong> {t('example')}
                </figcaption>
              </figure>
            </div>
          </section>
        )
      })}

      <StartBand />
    </>
  )
}

type Row = {
  mark: string
  /** a mark that repeats what the row says (❝, R/W/L, DL/AL/VO, § ⇪ ◐ ⇄) is hidden from screen readers (G-15) */
  decorative?: boolean
  markInk: Ink
  title: string
  sub: string
  pill?: string
  pillInk?: Ink
}

/** The design's `rows` card: a list (numbered where the marks are an order), nothing in it focusable (G-17) */
function Rows({ rows, ordered = false }: { rows: Row[]; ordered?: boolean }) {
  const List = ordered ? 'ol' : 'ul'
  return (
    <List className="m-0 flex list-none flex-col gap-[9px] p-0">
      {rows.map((r) => (
        <li
          key={r.title}
          className="flex items-center gap-[13px] rounded-row border border-line bg-bg px-[16px] py-[13px] max-[359px]:flex-wrap max-[359px]:gap-y-[8px]"
        >
          <span
            aria-hidden={r.decorative ? 'true' : undefined}
            className={`flex h-[30px] min-w-[30px] flex-none items-center justify-center rounded-pill px-[6px] text-[12px] font-bold ${r.markInk.bg} ${r.markInk.fg}`}
          >
            {r.mark}
          </span>
          {/* below 360px the pill takes a line of its own under the text, so the text keeps its width */}
          <span className="min-w-0 flex-1 max-[359px]:basis-[calc(100%-43px)]">
            <span className="block text-[14.5px] font-bold [text-wrap:pretty]">{r.title}</span>
            <span className="mt-[2px] block text-[12.5px] text-body">{r.sub}</span>
          </span>
          {r.pill && r.pillInk ? (
            <span
              className={`flex-none rounded-pill px-[10px] py-[4px] text-[11.5px] font-bold max-[359px]:ml-[43px] ${r.pillInk.bg} ${r.pillInk.fg}`}
            >
              {r.pill}
            </span>
          ) : null}
        </li>
      ))}
    </List>
  )
}
