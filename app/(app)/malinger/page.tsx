import { getLocale, getTranslations } from 'next-intl/server'
import { Button, ButtonLink } from '@/components/ui/Button'
import { getRounds, type RoundListItem } from '@/lib/rounds/read'
import { getParticipation, rateColour } from '@/lib/participation/read'
import { getExtraQuestions, getFactors } from '@/lib/instrument/read'
import { Sporsmalssettet } from '@/components/malinger/Sporsmalssettet'

/**
 * Målinger. Bundle lines 502-658.
 *
 * Three blocks are built here: the page header, the rounds list, and the Deltakelse
 * card. Every figure on all three comes out of the database — the question count is
 * counted from app.round_factors and app.round_extra_questions, the response rates
 * from public.participation(), the dates from app.rounds.closes_at.
 *
 * What is deliberately NOT rendered, because the schema does not hold it:
 *
 *   - The Årshjulet card that sits between the header and the rounds list. It reads a
 *     schedule — preset, base month, pause, and the per-round notification cascade —
 *     and none of those tables exist. The årshjul is its own segment in the plan, and
 *     its schema arrives with it. Rendering the ring now would mean inventing a
 *     cadence and a notification order, and a plausible invented schedule is worse
 *     than a gap: it survives review looking like a decision someone made.
 *   - The planned pulses the design interleaves between the two grunnlinjer. They are
 *     computed from that same schedule, not stored, so there is nothing to list.
 * See docs/DEVIATIONS.md D-05.
 */
export const dynamic = 'force-dynamic'

/** Status pill and row actions per state. The hexes are the design's (bundle 4249-4263). */
const STATE_STYLE = {
  lukket: { background: '#CFE7E4', color: '#20431C' },
  arkivert: { background: 'rgba(25,21,16,.07)', color: '#5F5849' },
} as const

export default async function MalingerPage() {
  const t = await getTranslations()
  const locale = await getLocale()
  const [rounds, factors, extras] = await Promise.all([
    getRounds(),
    getFactors(),
    getExtraQuestions(),
  ])

  // the Deltakelse card describes the round the screen opens on: the most recent one
  const current = rounds[0]
  const participation = current ? await getParticipation(current.id) : null

  const closedOn = (iso: string | null, year: number) => {
    if (!iso) return null
    // the year is printed only when it is not the current one, as the design does:
    // "lukket 14. september" against "lukket 11. september 2025"
    const showYear = year !== new Date().getFullYear()
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      timeZone: 'Europe/Oslo',
      ...(showYear ? { year: 'numeric' } : {}),
    }).format(new Date(iso))
  }

  return (
    <main className="animate-entry mx-auto max-w-[1180px] px-[28px] pb-[60px] pt-[30px]">
      <div className="flex flex-wrap items-end justify-between gap-[20px]">
        <div className="min-w-0">
          <h1 className="m-0 font-display text-[32px] font-semibold leading-[1.1]">
            {t('malinger.title')}
          </h1>
          <p className="mt-[9px] max-w-[600px] text-[14.5px] leading-[1.6] text-mut [text-wrap:pretty]">
            {t('malinger.lead')}
          </p>
        </div>
        <span className="flex flex-none flex-wrap gap-[9px]">
          <Button tone="secondary">{t('malinger.previewAsEmployee')}</Button>
          <Button tone="primary">{t('malinger.newMeasurement')}</Button>
        </span>
      </div>

      <div className="mt-[24px] flex flex-col gap-[12px]">
        {rounds.map((round) => (
          <RoundRow
            key={round.id}
            round={round}
            closedOn={closedOn(round.closesAt, round.year)}
            t={t}
          />
        ))}
      </div>

      {current ? (
        <section className="mt-[28px] rounded-panel border border-line bg-sf px-[26px] py-[24px]">
          <div className="flex flex-wrap items-start justify-between gap-[18px]">
            <span className="min-w-0">
              <h2 className="m-0 font-display text-[21px] font-semibold">
                {t('malinger.deltakelse')}
              </h2>
              <span className="mt-[4px] block text-[13px] text-mut">
                {t('malinger.cardRoundTitle', {
                  kind: t(`malinger.kind.${current.kind}`),
                  year: current.year,
                })}
                {' · '}
                {t('malinger.cardRoundSub', {
                  date: closedOn(current.closesAt, current.year) ?? '',
                })}
              </span>
            </span>
            {participation ? (
              <span className="flex-none text-right">
                <span className="block font-display text-[32px] font-semibold leading-none">
                  {t('malinger.percent', { pct: participation.pct })}
                </span>
                <span className="mt-[2px] block text-[12px] text-mut">
                  {t('malinger.rateLine', {
                    answered: participation.answered,
                    total: participation.headcount,
                  })}
                </span>
              </span>
            ) : null}
          </div>

          {participation ? (
            <>
              <div className="mt-[18px] grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
                {[...participation.groups]
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((g) => (
                    <div
                      key={g.group_name}
                      className="rounded-tile border border-line bg-bg px-[16px] py-[14px]"
                    >
                      <div className="flex items-baseline justify-between gap-[10px]">
                        <span className="text-[13.5px] font-semibold">{g.group_name}</span>
                        <span className="text-[13px] font-bold">
                          {t('malinger.percent', { pct: g.pct })}
                        </span>
                      </div>
                      <span
                        className="mt-[9px] block h-[7px] overflow-hidden rounded-pill"
                        style={{ background: 'rgba(25,21,16,.08)' }}
                      >
                        <span
                          className="block h-full rounded-pill"
                          style={{ width: `${g.pct}%`, background: rateColour(g.pct) }}
                        />
                      </span>
                      <div className="mt-[6px] text-[11.5px] text-mut">
                        {t('malinger.groupLine', { answered: g.answered, total: g.headcount })}
                      </div>
                      {g.thin ? (
                        <div className="mt-[4px] text-[11px] leading-[1.4] text-caution [text-wrap:pretty]">
                          {t('malinger.thinNote')}
                        </div>
                      ) : null}
                    </div>
                  ))}
              </div>

              <div className="mt-[18px] flex flex-wrap items-start justify-between gap-[18px] border-t border-line pt-[16px]">
                <span className="min-w-[280px] max-w-[600px] flex-1">
                  <span className="block text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">
                    {t('malinger.privacy')}
                  </span>
                  <span className="mt-[8px] block text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
                    {t('malinger.reminderClosed')}
                  </span>
                </span>
                {/*
                  The design's live round offers "Lukk runden" and "Send påminnelse".
                  Both rounds in the database are closed, so the design's own closed
                  state applies: a single "Start neste puls nå".
                */}
                <span className="flex flex-none flex-wrap gap-[9px]">
                  <Button size="panel" tone="primary">
                    {t('malinger.startNextPulse')}
                  </Button>
                </span>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      <Sporsmalssettet
        heading={t('malinger.sporsmalssettet')}
        lead={t('malinger.qsLead')}
        extraHeading={t('malinger.extraHeading')}
        factors={factors.map((f) => ({
          key: f.key,
          label: t(`factor.${f.key}.label`),
          lawRef: f.lawRef,
          count: t('malinger.statementCount', { count: f.ordinals.length }),
          description: t(`factor.${f.key}.desc`),
          // numbered from the ordinals the database holds, not from a fixed 1..3
          statements: f.ordinals.map((n) => t(`factor.${f.key}.s${n}`)),
        }))}
        extras={extras.map((e) => ({
          key: e.key,
          label: t(`extra.${e.key}.label`),
          count: t('malinger.extraCount', { count: 1 }),
          text: t(`extra.${e.key}.text`),
          note: t(`extra.${e.key}.note`),
        }))}
      />
    </main>
  )
}

function RoundRow({
  round,
  closedOn,
  t,
}: {
  round: RoundListItem
  closedOn: string | null
  t: Awaited<ReturnType<typeof getTranslations>>
}) {
  const p = round.participation
  const archived = round.state === 'arkivert'

  /**
   * An archived row's bar is the neutral rule colour, not its rate colour — the design
   * prints #C4BCA8 for the 2025 round even though 77 % would otherwise be amber. The
   * muting is the point: an archived rate is history, not something to act on.
   */
  const bar = archived ? '#C4BCA8' : p ? rateColour(p.pct) : '#C4BCA8'

  return (
    <div
      className="grid items-center gap-[16px] rounded-note border border-line bg-sf px-[22px] py-[18px]"
      style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1.3fr) 118px 250px' }}
    >
      <span className="min-w-0">
        <span className="block text-[16px] font-semibold">
          {t('malinger.roundTitle', {
            kind: t(`malinger.kind.${round.kind}`),
            year: round.year,
          })}
        </span>
        <span className="mt-[3px] block text-[12.5px] text-mut">
          {[
            t(`malinger.audience.${round.audience}`),
            t('malinger.questionCount', { count: round.questionCount }),
            closedOn ? t('malinger.closedOn', { date: closedOn }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>

      <span className="min-w-0">
        <span className="block text-[12.5px] text-mut">
          {p
            ? t('malinger.rateLabel', { answered: p.answered, total: p.headcount })
            : t('malinger.notSent')}
        </span>
        <span className="mt-[6px] flex items-center gap-[9px]">
          <span
            className="h-[7px] flex-1 overflow-hidden rounded-pill"
            style={{ background: 'rgba(25,21,16,.08)' }}
          >
            <span
              className="block h-full rounded-pill"
              style={{ width: `${p?.pct ?? 0}%`, background: bar }}
            />
          </span>
          <span className="flex-none text-[12.5px] font-bold">
            {p ? t('malinger.percent', { pct: p.pct }) : '—'}
          </span>
        </span>
      </span>

      <span>
        <span
          className="inline-block rounded-pill px-[12px] py-[5px] text-[11.5px] font-bold"
          style={STATE_STYLE[round.state]}
        >
          {t(`malinger.state.${round.state}`)}
        </span>
      </span>

      <span className="flex flex-wrap justify-end gap-[8px]">
        <Button size="sm" tone="secondary" pad={14}>
          {t(archived ? 'malinger.viewSetup' : 'malinger.setup')}
        </Button>
        {/*
          The result of a round has an address, so the control that opens it is a link
          and not a button — the documented control substitution (D-06), styled exactly
          as the bundle styles this button.
        */}
        <ButtonLink
          href={{ pathname: '/resultat', query: { maling: round.id } }}
          size="sm"
          tone={archived ? 'secondary' : 'primary'}
          pad={15}
        >
          {t(archived ? 'malinger.compare' : 'malinger.viewResult')}
        </ButtonLink>
      </span>
    </div>
  )
}
