import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { roundTitle, type Titled } from '@/lib/rounds/title'
import { MeasureCard } from '@/components/tiltak/MeasureCard'
import { NewMeasureButton } from '@/components/tiltak/NewMeasureButton'
import { SuggestionBank, type BankChip } from '@/components/tiltak/SuggestionBank'
import { adoptLabels, playbookBlock } from '@/lib/playbook/cards'
import type { Band } from '@/lib/results/read'
import { STEP_KEYS, stepIndex, type Measure, type MeasureBucket } from '@/lib/measures/read'

/**
 * Tiltak, the rendering. Bundle lines 1712-1795.
 *
 * One card per measure: the factor it hangs on, its legal basis, the measurement that
 * raised it, its owner and deadline, the six-step rail, and the sentence that says what
 * has to happen next. The rail is the screen's argument — a measure cannot be closed
 * before its effect has been measured, and the sixth step being unreachable until the
 * fifth is what makes the documentation mean anything.
 *
 * Nothing here is computed except presentation. `late` and the bucket come from the
 * reader, which derives them from the deadline and the step in the organisation's own
 * time zone; the step order is the database enum's.
 *
 * The card and its handlingsplan are in MeasureCard, a client component: the panel
 * opens and closes, and the type note changes with the choice. Everything it prints is
 * resolved here, so the client never holds a message catalogue or a step order.
 */

export type StatusFilter = MeasureBucket | 'alle'

export interface TiltakView {
  measures: Measure[]
  /** the filters as chosen, already validated against what exists */
  status: StatusFilter
  roundId: string | null
  ownerId: string | null
  rounds: { id: string; kind: string; year: number; pulseNo: number | null }[]
  owners: { id: string; name: string }[]
  /** everyone who could own a measure, and every department it could affect */
  employees: { id: string; name: string }[]
  groups: { id: string; name: string }[]
  /** the instrument, for the factor select */
  factorKeys: string[]
  /** the round a new measure hangs off: the most recent closed one */
  newMeasureRoundId: string | null
  /** "Forslag fra resultatene": the factors lowest index first, scored when a round has closed (D-61) */
  bank: { factors: { key: string; index: number | null; band: Band | null }[]; selectedKey: string | null }
  /** closed rounds a measure's effect can be read from, newest first (0023, D-52) */
  effectRounds: { id: string; kind: string; year: number; pulseNo: number | null; opensAt: string | null }[]
}

const FILTERS: StatusFilter[] = ['apne', 'frist', 'effekt', 'lukket', 'alle']

/** The score pill behind a bank chip, by the factor's band (bundle 4549: < 50, < 66, else). */
const SCORE_BG: Record<Band, string> = { hoy: '#F0B9A0', middels: '#F5DC96', lav: '#CFE7E4' }

/** Status pill fills, from the bundle (line 4400). */
const PILL = {
  late: { background: '#FBD5C4', color: '#6B240C' },
  done: { background: '#CFE7E4', color: '#20431C' },
  running: { background: '#FBEBBE', color: '#5C4600' },
}

/** The three tiles in the status card (bundle line 4338). */
const TILE = [
  { key: 'statLate', background: '#FBD5C4', color: '#6B240C' },
  { key: 'statOpen', background: '#FBEBBE', color: '#5C4600' },
  { key: 'statEffect', background: '#CFE7E4', color: '#20431C' },
] as const

export async function TiltakScreen({ view }: { view: TiltakView }) {
  const t = await getTranslations()
  const locale = await getLocale()

  const dateOf = (iso: string | null) => {
    if (!iso) return null
    const d = new Date(`${iso}T12:00:00Z`)
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      timeZone: 'Europe/Oslo',
      ...(d.getUTCFullYear() !== new Date().getUTCFullYear() ? { year: 'numeric' } : {}),
    }).format(d)
  }

  const yesterday = (() => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - 1)
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' }).format(d)
  })()

  /**
   * What the date under the title says depends on where the measure is: a deadline
   * while it is still work, and the day it happened once it is not. The design prints
   * "Frist gikk ut i går" rather than yesterday's date for the one that just lapsed,
   * which is also the only phrasing that stays true as the days pass.
   */
  const dateLine = (m: Measure) => {
    const i = stepIndex(m.step)
    if (i >= stepIndex('lukket') && m.completedOn)
      return t('tiltak.closedOn', { date: dateOf(m.completedOn) ?? '' })
    if (i >= stepIndex('gjennomfort') && m.completedOn)
      return t('tiltak.completedOn', { date: dateOf(m.completedOn) ?? '' })
    if (!m.dueDate) return t('tiltak.dueUnset')
    if (m.dueDate === yesterday) return t('tiltak.dueYesterday')
    return t('tiltak.due', { date: dateOf(m.dueDate) ?? '' })
  }

  const roundLabel = (r: Titled) => roundTitle(t, r)

  const counts = (bucket: StatusFilter) =>
    bucket === 'alle'
      ? view.measures.length
      : bucket === 'apne'
        ? view.measures.filter((m) => m.bucket !== 'lukket').length
        : view.measures.filter((m) => m.bucket === bucket).length

  const shown = view.measures.filter((m) => {
    const byStatus =
      view.status === 'alle'
        ? true
        : view.status === 'apne'
          ? m.bucket !== 'lukket'
          : m.bucket === view.status
    const byRound = view.roundId === null || m.round?.id === view.roundId
    const byOwner = view.ownerId === null || m.owner?.id === view.ownerId
    return byStatus && byRound && byOwner
  })

  const opened = new Map(view.effectRounds.map((r) => [r.id, r.opensAt]))
  const adopted = new Set(view.measures.flatMap((m) => (m.playbookKey ? [m.playbookKey] : [])))
  /** When the measure's own round has no known opening, every other closed round is offered. */
  const laterThanOwn = (r: { opensAt: string | null }, own: string | null) => {
    const from = own ? opened.get(own) : null
    return !from || !r.opensAt || r.opensAt > from
  }

  /** Resolved once and handed to the client, which has no catalogue of its own. */
  const problems: Record<string, string> = Object.fromEntries(
    ['invalid', 'denied', 'closingRule', 'effectRound', 'gone', 'noOrg'].map((k) => [k, t(`tiltak.problem.${k}`)]),
  )

  const href = (over: Record<string, string | undefined>) => {
    const query: Record<string, string> = {}
    const merged = {
      status: view.status,
      maling: view.roundId ?? undefined,
      tildelt: view.ownerId ?? undefined,
      forslag: view.bank.selectedKey ?? undefined,
      ...over,
    }
    for (const [k, v] of Object.entries(merged)) if (v !== undefined) query[k] = v
    return { pathname: '/tiltak' as const, query }
  }

  return (
    <main className="animate-entry mx-auto max-w-page px-[16px] md:px-[28px] pb-[60px] pt-[30px]">
      <div className="grid items-start gap-[20px] md:[grid-template-columns:minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <div className="min-w-0">
          <h1 className="m-0 font-display text-[32px] font-semibold leading-[1.1]">
            {t('tiltak.title')}
          </h1>
          <p className="mt-[9px] max-w-[560px] text-[14.5px] leading-[1.6] text-mut [text-wrap:pretty]">
            {t('tiltak.lead')}
          </p>
        </div>

        <div className="min-w-0 rounded-panel border border-line bg-sf px-[20px] py-[18px]">
          <div className="flex items-center justify-between gap-[12px]">
            <span className="text-[11px] uppercase tracking-[0.11em] text-mut">
              {t('tiltak.status')}
            </span>
            <NewMeasureButton
              label={t('tiltak.new')}
              factorKey={view.factorKeys[0] ?? 'ytring'}
              roundId={view.newMeasureRoundId}
              problems={problems}
            />
          </div>
          <div className="mt-[12px] grid grid-cols-3 gap-[9px]">
            {TILE.map((tile) => (
              <span
                key={tile.key}
                className="block rounded-cta px-[11px] py-[10px]"
                style={{ background: tile.background }}
              >
                <span
                  className="block text-[20px] font-bold leading-none"
                  style={{ color: tile.color }}
                >
                  {tile.key === 'statLate'
                    ? counts('frist')
                    : tile.key === 'statOpen'
                      ? counts('apne')
                      : counts('effekt')}
                </span>
                <span
                  className="mt-[4px] block text-[11px] font-semibold leading-[1.25]"
                  style={{ color: tile.color }}
                >
                  {t(`tiltak.${tile.key}`)}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {view.bank.selectedKey ? (
        <SuggestionBank
          head={t('playbook.bankHead')}
          lead={view.bank.factors[0]?.index === null ? t('playbook.bankLeadNoScores') : t('playbook.bankLead')}
          hideLabel={t('playbook.bankHide')}
          showLabel={t('playbook.bankShow')}
          chips={view.bank.factors.map(
            (f): BankChip => ({
              key: f.key,
              label: t(`factor.${f.key}.label`),
              score: f.index === null ? null : String(f.index),
              scoreBg: f.band ? SCORE_BG[f.band] : 'transparent',
              selected: f.key === view.bank.selectedKey,
              href: href({ forslag: f.key }),
            }),
          )}
          block={playbookBlock(t, view.bank.selectedKey, adopted)}
          adopt={adoptLabels(t)}
          roundId={view.newMeasureRoundId}
        />
      ) : null}

      <div className="mt-[22px] flex flex-wrap items-center gap-[8px]">
        {FILTERS.map((f) => {
          const on = f === view.status
          return (
            <Link
              key={f}
              href={href({ status: f })}
              aria-current={on ? 'true' : undefined}
              className={`inline-flex h-[36px] flex-none items-center rounded-pill border px-[15px] text-[12.5px] font-semibold no-underline hover:no-underline ${
                on
                  ? 'border-ink bg-ink text-bg hover:text-bg'
                  : 'border-line bg-transparent text-ink hover:text-ink'
              }`}
            >
              {t('tiltak.filterCount', { label: t(`tiltak.filter.${f}`), count: counts(f) })}
            </Link>
          )
        })}
      </div>

      <FilterRow label={t('tiltak.measureLabel')} className="mt-[10px]">
        <Chip href={href({ maling: undefined })} selected={view.roundId === null} label={t('tiltak.allRounds')} />
        {view.rounds.map((r) => (
          <Chip
            key={r.id}
            href={href({ maling: r.id })}
            selected={view.roundId === r.id}
            label={roundLabel(r)}
          />
        ))}
      </FilterRow>

      <FilterRow label={t('tiltak.ownerLabel')} className="mt-[8px]">
        <Chip href={href({ tildelt: undefined })} selected={view.ownerId === null} label={t('tiltak.allOwners')} />
        {view.owners.map((o) => (
          <Chip
            key={o.id}
            href={href({ tildelt: o.id })}
            selected={view.ownerId === o.id}
            label={o.name}
          />
        ))}
      </FilterRow>

      <div className="mt-[20px] flex flex-col gap-[12px]">
        {shown.length === 0 ? (
          <div className="rounded-panel border border-dashed border-rule bg-sf px-[26px] py-[34px] text-center">
            <div className="text-[15px] font-semibold">{t('tiltak.emptyTitle')}</div>
            <div className="mt-[5px] text-[13px] text-mut">{t('tiltak.emptyLead')}</div>
          </div>
        ) : null}

        {shown.map((m) => {
          const current = stepIndex(m.step)
          const pill = m.late ? PILL.late : current >= stepIndex('effekt_malt') ? PILL.done : PILL.running
          const closed = current >= stepIndex('lukket')
          return (
            <MeasureCard
              key={m.id}
              id={m.id}
              view={{
                factor: t(`factor.${m.factorKey}.short`),
                lawRef: m.lawRef,
                fromRound: m.round ? t('tiltak.fromRound', { round: roundLabel(m.round) }) : null,
                title: m.title,
                ownerAndDate: (m.owner?.name ?? t('tiltak.ownerUnset')) + ' · ' + dateLine(m),
                statusLabel: m.late ? t('tiltak.overdue') : t(`tiltak.step.${m.step}`),
                statusStyle: pill,
                steps: STEP_KEYS.map((step, i) => ({
                  label: t(`tiltak.step.${step}`),
                  barColour:
                    i <= current ? (i >= stepIndex('effekt_malt') ? '#2F5D2A' : '#F5C64A') : '#E8DFC9',
                  current: i === current,
                })),
                goal: m.goal,
                actionLabel: closed
                  ? t('tiltak.closed')
                  : current === stepIndex('gjennomfort')
                    ? t('tiltak.registerEffect')
                    : t('tiltak.advance'),
                actionStyle: closed
                  ? { background: 'transparent' }
                  : current === stepIndex('gjennomfort')
                    ? { background: '#CFE7E4' }
                    : undefined,
                canAdvance: !closed,
              }}
              values={{
                title: m.title,
                goal: m.goal ?? '',
                factorKey: m.factorKey,
                ownerEmployeeId: m.owner?.id ?? '',
                dueDate: m.dueDate ?? '',
                step: m.step,
                kind: m.kind,
                groupIds: m.groupIds,
                effectRoundId: m.effectRoundId ?? '',
                effectNote: m.effectNote ?? '',
              }}
              options={{
                owners: view.employees.map((e) => ({ value: e.id, label: e.name })),
                factors: view.factorKeys.map((k) => ({ value: k, label: t(`factor.${k}.label`) })),
                steps: STEP_KEYS.map((step) => ({ value: step, label: t(`tiltak.step.${step}`) })),
                groups: view.groups.map((g) => ({ value: g.id, label: g.name })),
                // a later round only: never the one the measure came from (0023 refuses that
                // pairing), and never an earlier one, which cannot show the effect of
                // something decided after it
                effectRounds: view.effectRounds
                  // the stored choice always stays listed, or an unchanged save would clear it
                  .filter(
                    (r) =>
                      r.id === m.effectRoundId ||
                      (r.id !== m.round?.id && laterThanOwn(r, m.round?.id ?? null)),
                  )
                  .map((r) => ({ value: r.id, label: roundLabel(r) })),
              }}
              labels={{
                edit: t('tiltak.edit'),
                close: t('tiltak.close'),
                planHead: t('tiltak.planHead'),
                title: t('tiltak.fieldTitle'),
                goal: t('tiltak.fieldGoal'),
                owner: t('tiltak.fieldOwner'),
                ownerUnset: t('tiltak.ownerUnset'),
                due: t('tiltak.fieldDue'),
                factor: t('tiltak.fieldFactor'),
                status: t('tiltak.fieldStatus'),
                kindHead: t('tiltak.kindHead'),
                kindCollective: t('tiltak.kind.kollektivt'),
                kindIndividual: t('tiltak.kind.individuelt'),
                noteCollective: t('tiltak.kindNote.kollektivt'),
                noteIndividual: t('tiltak.kindNote.individuelt'),
                affectedHead: t('tiltak.affectedHead'),
                effectHead: t('tiltak.effectHead'),
                effectRound: t('tiltak.effectRound'),
                effectRoundUnset: t('tiltak.effectRoundUnset'),
                effectNote: t('tiltak.effectNote'),
                effectHint: t('tiltak.effectHint'),
                delete: t('tiltak.delete'),
                done: t('tiltak.done'),
                problems,
              }}
            />
          )
        })}
      </div>
    </main>
  )
}

function FilterRow({
  label,
  className = '',
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`flex flex-wrap items-center gap-[7px] ${className}`}>
      <span className="mr-[4px] text-[11px] uppercase tracking-[0.09em] text-mut">{label}</span>
      {children}
    </div>
  )
}

function Chip({
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
