import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { roundTitle, type Titled } from '@/lib/rounds/title'
import { Button, ButtonLink } from '@/components/ui/Button'
import { ThreadCard, type ThreadCardProps } from '@/components/samtaler/ThreadCard'
import type { Conversation, ThreadState } from '@/lib/conversations/read'
import { toneOf } from '@/lib/conversations/read'
import { LATE_AFTER_DAYS, TONE_STYLE } from '@/lib/conversations/rules'

/**
 * Samtaler, the rendering. Bundle lines 941-1025.
 *
 * Anonymous two-way: a leader reads what somebody wrote and answers, and the answer
 * reaches them without anybody learning who they are. What makes that true is in
 * migration 0018 and not in this file — the capability key, the k gate, and the rule
 * that a group never travels with a comment. This screen only renders what survived.
 *
 * The consequence worth stating here: there is no author on a message beyond "Ansatt ·
 * anonym", because there is nothing to put there. That is not a placeholder for a name
 * the schema is missing; it is the product working.
 */

export type StatusFilter = ThreadState | 'alle'

export interface SamtalerView {
  items: Conversation[]
  status: StatusFilter
  roundId: string | null
  factorKey: string | null
  rounds: { id: string; kind: string; year: number; pulseNo: number | null }[]
  factorKeys: string[]
  threshold: number
  canWrite: boolean
}

const FILTERS: StatusFilter[] = ['venter', 'dialog', 'lukket', 'alle']

/** The three status tiles (bundle 954). */
const TILE = [
  { key: 'statWaiting', background: '#FBD5C4', color: '#6B240C' },
  { key: 'statOldest', background: '#FBD5C4', color: '#6B240C' },
  { key: 'statDialog', background: '#CFE7E4', color: '#20431C' },
] as const

/** Tone chip fills, transcribed from the bundle (line 3694); shared with Resultat. */
const TONE: Record<string, { background: string; color: string }> = TONE_STYLE


export async function SamtalerScreen({ view }: { view: SamtalerView }) {
  const t = await getTranslations()
  const locale = await getLocale()

  const roundLabel = (r: Titled) => roundTitle(t, r)

  const shortDate = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      timeZone: 'Europe/Oslo',
    })
      .format(new Date(iso))
      .replace(/\.$/, '')

  const waiting = view.items.filter((c) => c.state === 'venter')
  const inDialog = view.items.filter((c) => c.state === 'dialog')
  const oldest = waiting.reduce((n, c) => Math.max(n, c.waitingDays), 0)

  const counts = (f: StatusFilter) =>
    f === 'alle' ? view.items.length : view.items.filter((c) => c.state === f).length

  const shown = view.items.filter((c) => {
    const byStatus = view.status === 'alle' || c.state === view.status
    const byRound = view.roundId === null || c.roundId === view.roundId
    const byFactor = view.factorKey === null || c.factorKey === view.factorKey
    return byStatus && byRound && byFactor
  })

  const href = (over: Record<string, string | undefined>) => {
    const query: Record<string, string> = {}
    const merged = {
      status: view.status,
      maling: view.roundId ?? undefined,
      faktor: view.factorKey ?? undefined,
      ...over,
    }
    for (const [k, v] of Object.entries(merged)) if (v !== undefined) query[k] = v
    return { pathname: '/samtaler' as const, query }
  }

  const problems: Record<string, string> = Object.fromEntries(
    ['invalid_body', 'denied', 'not_found'].map((k) => [k, t(`samtaler.problem.${k}`)]),
  )

  return (
    <main className="animate-entry mx-auto max-w-[1180px] px-[16px] md:px-[28px] pb-[60px] pt-[30px]">
      <div className="grid items-start gap-[20px] md:[grid-template-columns:minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <div className="min-w-0">
          <h1 className="m-0 font-display text-[32px] font-semibold leading-[1.1]">
            {t('samtaler.title')}
          </h1>
          <p
            className={`mt-[9px] max-w-[600px] text-[14.5px] leading-[1.6] [text-wrap:pretty] ${
              waiting.length ? 'text-danger' : 'text-mut'
            }`}
          >
            {waiting.length === 0
              ? t('samtaler.leadClear')
              : t('samtaler.lead', { count: waiting.length, days: oldest })}
          </p>
        </div>

        <div className="min-w-0 rounded-panel border border-line bg-sf px-[20px] py-[18px]">
          <div className="flex items-center justify-between gap-[12px]">
            <span className="text-[11px] uppercase tracking-[0.11em] text-mut">
              {t('samtaler.status')}
            </span>
            <ButtonLink href="/tiltak" size="tiny" tone="secondary">
              {t('samtaler.seeMeasures')}
            </ButtonLink>
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
                  {tile.key === 'statWaiting'
                    ? waiting.length
                    : tile.key === 'statOldest'
                      ? t('samtaler.days', { days: oldest })
                      : inDialog.length}
                </span>
                <span
                  className="mt-[4px] block text-[11px] font-semibold leading-[1.25]"
                  style={{ color: tile.color }}
                >
                  {t(`samtaler.${tile.key}`)}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>

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
              {t('samtaler.filterCount', { label: t(`samtaler.filter.${f}`), count: counts(f) })}
            </Link>
          )
        })}
      </div>

      <FilterRow label={t('samtaler.measureLabel')} className="mt-[10px]">
        <Chip href={href({ maling: undefined })} selected={view.roundId === null} label={t('samtaler.allRounds')} />
        {view.rounds.map((r) => (
          <Chip
            key={r.id}
            href={href({ maling: r.id })}
            selected={view.roundId === r.id}
            label={roundLabel(r)}
          />
        ))}
      </FilterRow>

      <FilterRow label={t('samtaler.factorLabel')} className="mt-[8px]">
        <Chip href={href({ faktor: undefined })} selected={view.factorKey === null} label={t('samtaler.allFactors')} />
        {view.factorKeys.map((k) => (
          <Chip
            key={k}
            href={href({ faktor: k })}
            selected={view.factorKey === k}
            label={t(`factor.${k}.label`)}
          />
        ))}
      </FilterRow>

      <div className="mt-[20px] flex flex-col gap-[12px]">
        {shown.length === 0 ? (
          <div className="rounded-panel border border-dashed border-rule bg-sf px-[26px] py-[34px] text-center">
            <div className="text-[15px] font-semibold">{t('samtaler.emptyTitle')}</div>
            <div className="mt-[5px] text-[13px] text-mut">{t('samtaler.emptyLead')}</div>
          </div>
        ) : null}

        {shown.map((c) => {
          const tone = toneOf(c.answerValue)
          const late = c.state === 'venter' && c.waitingDays >= LATE_AFTER_DAYS
          const card: ThreadCardProps = {
            id: c.id,
            canWrite: view.canWrite && c.state !== 'lukket',
            view: {
              // the full name here, not the compact one Tiltak uses (D-24)
              factor: t(`factor.${c.factorKey}.label`),
              tone: tone ? t(`samtaler.tone.${tone}`) : null,
              toneStyle: tone ? TONE[tone] : undefined,
              round: roundTitle(t, { kind: c.roundKind, year: c.roundYear, pulseNo: c.roundPulseNo }),
              age:
                c.state === 'lukket'
                  ? t('samtaler.closed')
                  : c.state === 'dialog'
                    ? t('samtaler.inDialog')
                    : t('samtaler.waiting', { days: c.waitingDays }),
              ageAlert: late,
              borderColour: late ? '#D4633A' : '#E8DFC9',
              flagged: c.flaggedVarsel,
              flagNote: t('samtaler.varselNote'),
              messages: [
                {
                  author: 'ansatt',
                  name: t('samtaler.anonymous'),
                  when: shortDate(c.openedHour),
                  body: c.opening,
                },
                ...c.messages.map((m) => ({
                  author: m.author,
                  name: m.author === 'leder' ? t('samtaler.leader') : t('samtaler.anonymous'),
                  when: shortDate(m.sentHour),
                  body: m.body,
                })),
              ],
            },
            labels: {
              placeholder: t('samtaler.replyPlaceholder'),
              send: t('samtaler.send'),
              makeMeasure: t('samtaler.makeMeasure'),
              shareVerneombud: t('samtaler.shareVerneombud'),
              close: t('samtaler.close'),
              problems,
            },
          }
          return <ThreadCard key={c.id} {...card} />
        })}
      </div>

      {/* ------------------------------------------------ Spillereglene (bundle 1015) */}
      <div className="mt-[22px] rounded-panel border border-line bg-sf px-[24px] py-[22px]">
        <div className="text-[11px] uppercase tracking-[0.11em] text-mut">
          {t('samtaler.rulesHead')}
        </div>
        <div className="mt-[13px] grid gap-[13px] [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className="flex items-start gap-[10px]">
              <span className="mt-[1px] flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[6px] bg-mint text-[11px] text-greendeep">
                ✓
              </span>
              <span className="text-[12.5px] leading-[1.55] [text-wrap:pretty]">
                {n === 2
                  ? t('samtaler.rule2', { threshold: view.threshold })
                  : t(`samtaler.rule${n}`)}
              </span>
            </span>
          ))}
        </div>
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

export { Button }
