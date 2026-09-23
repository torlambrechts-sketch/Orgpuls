import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { roundTitle } from '@/lib/rounds/title'
import { ButtonLink } from '@/components/ui/Button'
import { Risikobildet, type FactorRow } from '@/components/resultat/Risikobildet'
import { bandCounts, deltaColour, heatTone, signedDelta, type Band } from '@/lib/results/read'
import { ConversationColumn } from '@/components/resultat/ConversationColumn'
import { LATE_AFTER_DAYS, TONE_STYLE, type ThemeTone } from '@/lib/conversations/rules'

/**
 * Resultat, the rendering. Bundle lines 692-908.
 *
 * Everything on this screen is a view of figures the database already computed and
 * already applied k to. The split from app/(app)/resultat/page.tsx is deliberate and
 * is not decoration: the page reads the RPCs and hands over a value, this file turns
 * that value into the design's rendering and resolves every string through next-intl.
 * Nothing here recomputes an index, a band or a threshold — a figure that disagreed
 * with the statutory report would be worse than a missing one.
 *
 * The split also makes the screen renderable from a value, which is what allows the
 * pixel gate to be pointed at it without a signed-in session.
 *
 * What the design shows and this screen does not — each because the schema cannot back
 * it, and none of it replaced by a placeholder. See docs/DEVIATIONS.md D-10 to D-17.
 */

/** A round, as the Måling filter names it. */
export interface RoundChip {
  id: string
  kind: string
  year: number
  pulseNo: number | null
  closesAt: string | null
  closed: boolean
}

export interface GroupChip {
  name: string
  n: number
}

export interface ScreenFactor {
  key: string
  /** app.factors.law_ref — a citation, so it is not translated */
  lawRef: string
  index: number
  band: Band
  /** points since the comparison round, or null when there is nothing to compare */
  delta: number | null
  /** statement ordinals held by app.statements, so the expansion numbers itself from data */
  ordinals: number[]
}

/** One line of the group grid. `values` is null when the server withheld the group. */
export interface HeatRow {
  name: string
  n: number
  values: Record<string, number> | null
}

export type Scope = { kind: 'org' } | { kind: 'group'; name: string }

export type ResultatBody =
  | { kind: 'notSent'; factorKeys: string[] }
  | { kind: 'masked'; group: GroupChip | null }
  | {
      kind: 'results'
      /** responses in scope — the number k was applied to */
      n: number
      /** people asked; null when participation is unavailable */
      headcount: number | null
      pct: number | null
      /** the organisation's index from results_summary; null for a department (D-15) */
      overallIndex: number | null
      /** points against the comparison round, or null when there is none */
      overallDelta: number | null
      hasPrevious: boolean
      factors: ScreenFactor[]
      factorKeys: string[]
      /** how many factors the instrument holds in total, so "alle elleve" stays true */
      instrumentSize: number
      heat: HeatRow[]
      /** the Samtaler column, for the whole organisation only; empty hides it (D-54) */
      threads: ResultThread[]
      canReply: boolean
      /** "Hva de skrev": who wrote, and the factors k or more wrote about (D-56) */
      written: {
        wrote: number
        n: number
        threshold: number
        themes: { key: string; comments: number; people: number; tone: ThemeTone }[]
      } | null
      /** krenkende atferd (and vold, when anyone said yes), whole organisation; D-55 */
      screening: {
        krenkende: ScreeningLine
        vold: ScreeningLine | null
        lawMode: boolean
      } | null
    }

/** One screening question's counts, read by `screeningTally`. */
export interface ScreeningLine {
  key: string
  answered: number
  yes: number
  declined: number
}

/** A comment on the Samtaler column, as the page read it from `conversations()`. */
export interface ResultThread {
  id: string
  factorKey: string
  text: string
  state: 'venter' | 'dialog' | 'lukket'
  waitingDays: number
  /** the latest leadership reply */
  reply: string | null
}

export interface ResultatView {
  rounds: RoundChip[]
  selectedId: string
  groups: GroupChip[]
  scope: Scope
  threshold: number
  body: ResultatBody
}

/** The band tiles above the table — the design's own fills (bundle line 793). */
const BAND_TILE: Record<Band, string> = {
  lav: 'bg-mint text-greendeep',
  middels: 'bg-sbg text-cautiondeep',
  hoy: 'bg-peach text-dangerdeep',
}

/** A withheld cell in the grid: the design's dash, not a zero and not an empty cell. */
const MASKED_CELL = { background: 'rgba(25,21,16,.05)', color: '#8A8272' }

/** The masked card's own ink and hairline, bundle line 707 — used nowhere else. */
const MASKED_CARD = { ink: '#5A2410', line: '#E38258' }

export async function ResultatScreen({ view }: { view: ResultatView }) {
  const t = await getTranslations()
  const locale = await getLocale()

  const selected = view.rounds.find((r) => r.id === view.selectedId) ?? view.rounds[0]
  if (!selected) {
    // nothing has been measured, so there is nothing to show and nothing to withhold
    return <main className="animate-entry mx-auto max-w-[1180px] px-[16px] md:px-[28px] pb-[60px] pt-[26px]" />
  }

  /**
   * The year is printed only when it is not the current one, exactly as the design
   * does — "lukket 14. september" against "lukket 11. september 2025". Same rule as
   * the Målinger rounds list.
   */
  const dateOf = (iso: string | null, year: number) =>
    iso
      ? new Intl.DateTimeFormat(locale, {
          day: 'numeric',
          month: 'long',
          timeZone: 'Europe/Oslo',
          ...(year !== new Date().getFullYear() ? { year: 'numeric' } : {}),
        }).format(new Date(iso))
      : null

  const roundLabel = (r: RoundChip) => roundTitle(t, r)

  const body = view.body

  return (
    <main className="animate-entry mx-auto max-w-[1180px] px-[16px] md:px-[28px] pb-[60px] pt-[26px]">
      <span className="flex flex-wrap gap-[8px]">
        <ButtonLink href="/malinger" size="xxs" tone="ghost">
          {t('resultat.backToMeasure')}
        </ButtonLink>
        <ButtonLink href="/rapport" size="xxs" tone="primary">
          {t('resultat.makeReport')}
        </ButtonLink>
      </span>

      <div className="mt-[16px] rounded-note border border-line bg-sf px-[20px] py-[16px]">
        <div className="flex flex-wrap items-center gap-[7px]">
          <span className="mr-[4px] text-[11px] uppercase tracking-[0.09em] text-mut">
            {t('resultat.measureLabel')}
          </span>
          {view.rounds.map((r) => {
            const on = r.id === selected.id
            return (
              <Link
                key={r.id}
                href={{
                  pathname: '/resultat',
                  query:
                    view.scope.kind === 'group'
                      ? { maling: r.id, avdeling: view.scope.name }
                      : { maling: r.id },
                }}
                aria-current={on ? 'true' : undefined}
                className={`inline-flex h-[34px] flex-none items-center rounded-pill border px-[14px] text-[12.5px] font-semibold no-underline hover:no-underline ${
                  on
                    ? 'border-ink bg-ink text-bg hover:text-bg'
                    : 'border-line bg-transparent text-ink hover:text-ink'
                }`}
              >
                {roundLabel(r)}
              </Link>
            )
          })}
        </div>

        <div className="mt-[11px] flex flex-wrap items-center gap-[7px] border-t border-line pt-[11px]">
          <span className="mr-[4px] text-[11px] uppercase tracking-[0.09em] text-mut">
            {t('resultat.teamLabel')}
          </span>
          <TeamChip
            href={{ pathname: '/resultat', query: { maling: selected.id } }}
            selected={view.scope.kind === 'org'}
            label={t('resultat.wholeOrg')}
          />
          {view.groups.map((g) => (
            <TeamChip
              key={g.name}
              href={{ pathname: '/resultat', query: { maling: selected.id, avdeling: g.name } }}
              selected={view.scope.kind === 'group' && view.scope.name === g.name}
              label={t('resultat.groupChip', { group: g.name, n: g.n })}
            />
          ))}
        </div>
      </div>

      {body.kind === 'notSent' ? (
        <div className="mt-[16px] rounded-panel border border-dashed border-rule bg-sf px-[26px] py-[30px] text-center">
          <div className="text-[15.5px] font-semibold">{t('resultat.notSentTitle')}</div>
          <div className="mx-auto mt-[6px] max-w-[460px] text-[13px] leading-[1.55] text-mut [text-wrap:pretty]">
            {t('resultat.notSentNote', {
              label: roundLabel(selected),
              date: dateOf(selected.closesAt, selected.year) ?? '',
              // the design names the factors mid-sentence, in lower case
              factors: new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(
                body.factorKeys.map((k) => t(`factor.${k}.label`).toLocaleLowerCase(locale)),
              ),
            })}
          </div>
        </div>
      ) : null}

      {body.kind === 'masked' ? (
        <div
          className="mt-[16px] rounded-panel border bg-peach px-[24px] py-[22px]"
          style={{ borderColor: MASKED_CARD.line }}
        >
          <div className="text-[15px] font-bold" style={{ color: MASKED_CARD.ink }}>
            {t('resultat.maskedTitle')}
          </div>
          <div
            className="mt-[5px] max-w-[560px] text-[13px] leading-[1.55] [text-wrap:pretty]"
            style={{ color: MASKED_CARD.ink }}
          >
            {body.group
              ? t('resultat.maskedNote', {
                  group: body.group.name,
                  n: body.group.n,
                  threshold: view.threshold,
                })
              : t('resultat.maskedOrgNote', { threshold: view.threshold })}
          </div>
        </div>
      ) : null}

      {body.kind === 'results' ? (
        <Results
          body={body}
          view={view}
          when={dateOf(selected.closesAt, selected.year)}
          closed={selected.closed}
        />
      ) : null}
    </main>
  )
}

async function Results({
  body,
  view,
  when,
  closed,
}: {
  body: Extract<ResultatBody, { kind: 'results' }>
  view: ResultatView
  when: string | null
  closed: boolean
}) {
  const t = await getTranslations()

  const rows: FactorRow[] = body.factors.map((f) => ({
    key: f.key,
    label: t(`factor.${f.key}.label`),
    lawRef: f.lawRef,
    index: f.index,
    band: f.band,
    delta: f.delta === null ? null : signedDelta(f.delta),
    deltaColour: deltaColour(f.delta ?? 0),
    /*
     * Two label sets, both the design's: the pill in the table's risk column reads
     * "Høy · Middels · Lav" (bundle line 2663), while the three tiles above the table
     * read "Høy risiko · Følges opp · Forsvarlig" (line 3019). Same band, different
     * words, because the pill names the risk level and the tile names what the
     * organisation has to do about it.
     */
    bandLabel: t(`band.${f.band}`),
    // the design offers an assessment on anything not yet sound, a read-back on the rest
    actionLabel: f.band === 'lav' ? t('resultat.assessed') : t('resultat.assess'),
    description: t(`factor.${f.key}.desc`),
    statements: f.ordinals.map((n) => t(`factor.${f.key}.s${n}`)),
  }))

  // the same counting Innsikt prints beneath its index, over the same server bands
  const counts = bandCounts(rows)
  const top = rows.slice(0, 3)

  const scopeLine = [
    view.scope.kind === 'group'
      ? t('resultat.scopeGroup', { n: body.n, group: view.scope.name })
      : t('resultat.scopeOrg', { n: body.n, total: body.headcount ?? body.n }),
    when ? (closed ? t('malinger.closedOn', { date: when }) : t('resultat.closesOn', { date: when })) : null,
    // the design spells eleven out; anything narrower is a puls and prints its count
    body.factorKeys.length === body.instrumentSize && body.instrumentSize === 11
      ? t('resultat.scopeAllFactors')
      : t('resultat.scopePulseFactors', { count: body.factorKeys.length }),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="mt-[16px] overflow-hidden rounded-card border border-line">
      <div className="bg-ink px-[28px] py-[26px] text-bg">
        <div className="flex flex-wrap items-end justify-between gap-[24px]">
          <span className="min-w-0">
            <span className="block text-[11px] uppercase tracking-[0.11em] opacity-[0.65]">
              {view.scope.kind === 'group'
                ? t('resultat.kickerGroup', { group: view.scope.name })
                : t('resultat.kickerOrg')}
            </span>
            <span className="mt-[7px] flex flex-wrap items-baseline gap-[13px]">
              {body.overallIndex !== null ? (
                <span className="font-display text-[56px] font-semibold leading-[.9] tabular-nums">
                  {body.overallIndex}
                </span>
              ) : null}
              {body.overallIndex !== null && body.overallDelta !== null ? (
                <span className="text-[15px] font-bold text-peach2">
                  {signedDelta(body.overallDelta)}
                </span>
              ) : null}
              {body.overallIndex !== null && !body.hasPrevious ? (
                <span className="text-[15px] font-bold text-peach2">
                  {t('resultat.deltaNew')}
                </span>
              ) : null}
            </span>
          </span>
          {body.pct !== null ? (
            <span className="flex flex-wrap gap-[28px] pb-[6px]">
              <span className="block">
                <span className="block text-[11px] opacity-[0.65]">{t('resultat.rateLabel')}</span>
                <span className="mt-[2px] block text-[22px] font-bold">
                  {t('malinger.percent', { pct: body.pct })}
                </span>
              </span>
            </span>
          ) : null}
        </div>
        <div className="mt-[15px] text-[12.5px] opacity-[0.65]">{scopeLine}</div>
      </div>

      <div className="bg-sf px-[28px] pb-[8px] pt-[24px]">
        <h2 className="m-0 font-display text-[23px] font-semibold">
          {t(
            top.length >= 3
              ? 'resultat.topHeadThree'
              : top.length === 2
                ? 'resultat.topHeadTwo'
                : 'resultat.topHeadOne',
          )}
        </h2>
      </div>
      <div className="flex flex-col gap-[12px] bg-sf px-[28px] pb-[26px] pt-[16px]">
        {top.map((row, i) => (
          <div key={row.key} className="overflow-hidden rounded-note border border-line bg-bg">
            <div className="flex items-center gap-[14px] px-[18px] py-[16px]">
              <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-pill bg-ink text-[14px] font-bold text-bg">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15.5px] font-semibold">{row.label}</span>
                <span className="mt-[2px] block text-[12.5px] text-mut">
                  {t('resultat.topMeta', { index: row.index, n: body.n, law: row.lawRef })}
                </span>
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-line bg-bg px-[28px] pb-[10px] pt-[22px]">
        <div className="flex flex-wrap items-end justify-between gap-[16px]">
          <span className="min-w-0">
            <span className="block font-display text-[23px] font-semibold">
              {t('resultat.tableHead')}
            </span>
            <span className="mt-[3px] block text-[12.5px] text-mut">{t('resultat.tableLead')}</span>
          </span>
          <span className="flex flex-none gap-[9px]">
            {(['lav', 'middels', 'hoy'] as const).map((band) => (
              <span
                key={band}
                className={`rounded-cta px-[14px] py-[9px] text-center ${BAND_TILE[band]}`}
              >
                <span className="block text-[19px] font-bold leading-none">{counts[band]}</span>
                <span className="mt-[3px] block text-[10.5px] font-semibold">
                  {t(`resultat.band.${band}`)}
                </span>
              </span>
            ))}
          </span>
        </div>
      </div>

      <Risikobildet
        rows={rows}
        columnFactor={t('resultat.colFactor')}
        columnIndex={t('resultat.colIndex')}
        columnRisk={t('resultat.colRisk')}
      />

      <div className="border-t border-line bg-sf px-[28px] py-[24px]">
        <div className="mb-[14px] flex flex-wrap items-baseline justify-between gap-[14px]">
          <span className="font-display text-[21px] font-semibold">{t('resultat.heatHead')}</span>
          <span className="text-[11.5px] text-mut">
            {t('resultat.heatThreshold', { threshold: view.threshold })}
          </span>
        </div>
        <div className="overflow-x-auto">
          <div
            className="grid gap-[4px] text-[11.5px]"
            style={{
              // the design's five columns at 94px apiece, kept when a round carries more
              minWidth: `${150 + body.factorKeys.length * 94}px`,
              gridTemplateColumns: `150px repeat(${body.factorKeys.length}, 1fr)`,
            }}
          >
            <span />
            {body.factorKeys.map((key) => (
              <span key={key} className="text-center leading-[1.25] text-mut">
                {t(`factor.${key}.label`)}
              </span>
            ))}
            {body.heat.map((row) => (
              <GridRow key={row.name}>
                <span
                  className={`flex items-center font-semibold ${
                    row.values ? 'text-ink' : 'text-mut'
                  }`}
                >
                  {t('resultat.groupChip', { group: row.name, n: row.n })}
                </span>
                {body.factorKeys.map((key) => {
                  const value = row.values?.[key]
                  return value === undefined ? (
                    <span
                      key={key}
                      className="rounded-[7px] py-[12px] text-center font-bold"
                      style={MASKED_CELL}
                      title={t('results.maskedAria', { threshold: view.threshold })}
                    >
                      —
                    </span>
                  ) : (
                    <span
                      key={key}
                      className="rounded-[7px] py-[12px] text-center font-bold tabular-nums"
                      style={{ background: heatTone(value).bg, color: heatTone(value).fg }}
                    >
                      {value}
                    </span>
                  )
                })}
              </GridRow>
            ))}
          </div>
        </div>
      </div>

      {body.threads.length > 0 || body.written ? (
        /*
          The design's two-column band on the canvas: "Hva de skrev" on the left (D-56),
          Samtaler on the right (D-54). Each keeps its own track when the other has
          nothing to show. Stacked on a phone.
        */
        <div className="grid border-t border-line bg-bg md:grid-cols-2">
          {body.written ? (
            <div className="min-w-0 px-[28px] py-[24px] max-md:px-[18px] md:col-start-1 md:row-start-1">
              <span className="block font-display text-[21px] font-semibold">{t('resultat.written.head')}</span>
              <span className="mt-[3px] block text-[12.5px] text-mut [text-wrap:pretty]">
                {t('resultat.written.count', { wrote: body.written.wrote, n: body.written.n })}{' '}
                {t('resultat.written.grouping', { threshold: body.written.threshold })}
              </span>
              {body.written.themes.length > 0 ? (
                <div className="mt-[14px] flex flex-col gap-[9px]">
                  {body.written.themes.map((th) => (
                    <div
                      key={th.key}
                      className="flex items-center gap-[12px] rounded-cta border border-line bg-sf px-[14px] py-[12px]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold">{t(`factor.${th.key}.label`)}</span>
                        <span className="mt-[2px] block text-[11.5px] text-mut">
                          {t('resultat.written.themeCount', { comments: th.comments, people: th.people })}
                        </span>
                      </span>
                      <span
                        className="flex-none rounded-pill px-[11px] py-[4px] text-[11.5px] font-bold"
                        style={TONE_STYLE[th.tone]}
                      >
                        {t(`resultat.written.tone.${th.tone}`)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {body.threads.length > 0 ? (
            <ConversationColumn
              threads={body.threads.map((c) => {
                const waiting = c.state === 'venter'
                return {
                  id: c.id,
                  factor: t(`factor.${c.factorKey}.short`),
                  text: c.text,
                  age: waiting ? t('resultat.conv.waiting', { days: c.waitingDays }) : t('resultat.conv.answered'),
                  late: waiting && c.waitingDays >= LATE_AFTER_DAYS,
                  reply: c.reply,
                  open: waiting && body.canReply,
                }
              })}
              labels={{
                head: t('resultat.conv.head'),
                seeAll: t('resultat.conv.seeAll'),
                lead: t('resultat.conv.lead'),
                replied: t('resultat.conv.replied'),
                placeholder: t('resultat.conv.placeholder'),
                send: t('resultat.conv.send'),
                problems: Object.fromEntries(
                  ['invalid_body', 'denied', 'not_found'].map((k) => [k, t(`samtaler.problem.${k}`)]),
                ),
              }}
            />
          ) : null}
        </div>
      ) : null}

      {body.screening ? (
        // bundle 919-929: the strip at the foot of the panel
        <div className="border-t border-line bg-sf px-[28px] pb-[22px] pt-[20px] max-md:px-[18px]">
          <div className="flex flex-wrap items-start gap-[14px]">
            <span
              aria-hidden
              className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-pill bg-peach text-[17px] font-bold text-dangerdeep"
            >
              !
            </span>
            <span className="min-w-[220px] flex-1">
              <span className="block text-[14px] font-semibold">
                {t('resultat.screening.krenkende', { yes: body.screening.krenkende.yes, answered: body.screening.krenkende.answered })}
              </span>
              {body.screening.vold ? (
                <span className="block text-[14px] font-semibold">
                  {t('resultat.screening.vold', { yes: body.screening.vold.yes, answered: body.screening.vold.answered })}
                </span>
              ) : null}
              <span className="mt-[3px] block text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">
                {[
                  t('resultat.screening.lead'),
                  body.screening.lawMode ? t('resultat.screening.law') : t('resultat.screening.plain'),
                  !body.screening.lawMode && body.screening.krenkende.yes > 0
                    ? t('resultat.screening.people', { count: body.screening.krenkende.yes })
                    : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
              </span>
            </span>
            {/* the design's button, to where the design sends it: Tiltak (D-06, D-55) */}
            <Link
              href="/tiltak"
              className="inline-flex h-[36px] flex-none items-center rounded-ctl border border-ink bg-transparent px-[16px] text-[12.5px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
            >
              {t('resultat.screening.open')}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * A row of the grid is not an element: the label and its cells are direct children of
 * the grid, so they have to be siblings. A keyed fragment carries the key without a
 * wrapper that would break the layout.
 */
function GridRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function TeamChip({
  href,
  selected,
  label,
}: {
  href: React.ComponentProps<typeof Link>['href']
  selected: boolean
  label: string
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? 'true' : undefined}
      className={`inline-flex h-[32px] flex-none items-center rounded-pill border px-[13px] text-[12px] text-ink no-underline hover:text-ink hover:no-underline ${
        selected ? 'border-ink bg-sbg font-bold' : 'border-line bg-transparent font-medium'
      }`}
    >
      {label}
    </Link>
  )
}
