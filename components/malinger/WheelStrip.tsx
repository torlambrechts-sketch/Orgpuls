import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import type { NotifyAudience } from '@/lib/wheel/read'

/**
 * Målinger's Årshjulet card. Bundle lines 520-575, state 3736-3790.
 *
 * Omitted until the year wheel stored a schedule (D-05); since 0019 and 0020 it does, so
 * every mark on the strip is read, not drawn: which months measure comes from
 * `wheelMonths` — the scheduler's own rule — the next sending is the earliest round the
 * wheel has planned, and the cascade is the stored notification ladder. D-53.
 */

export interface WheelStripView {
  /** the months the wheel measures in, from `wheelMonths` */
  measured: { month: number; kind: 'grunnlinje' | 'puls' }[]
  /** the month before the grunnlinje, where the design places the forankring */
  forankring: number
  /** July is skipped for the fellesferie */
  ferie: boolean
  /** the earliest round the wheel has planned and not yet opened */
  next: { kind: string; month: number } | null
  /** the ladder, grouped where several audiences are told on the same day */
  cascade: { audiences: NotifyAudience[]; leadDays: number }[]
  /** days after opening that the reminder goes, from the next round */
  reminderDay: number
}

/** Dot per role, transcribed from the bundle's `ring` (3752-3763). */
const DOT = {
  grunnlinje: { size: 34, background: '#F5C64A', border: '#191510', mark: 'G', markSize: 14 },
  puls: { size: 22, background: '#A8D5D2', border: '#2F5D2A', mark: 'P', markSize: 10 },
  none: { size: 10, background: '#FFFDF6', border: '#E8DFC9', mark: '', markSize: 10 },
} as const

/** The cascade's chip tints: the first to be told in mint, managers amber, everyone canvas. */
const TINT: Record<NotifyAudience, string> = {
  verneombud: '#CFE7E4',
  tillitsvalgte: '#CFE7E4',
  daglig_leder: '#CFE7E4',
  avdelingsledere: '#FBEBBE',
  alle_ansatte: '#FCF6E9',
}

export async function WheelStrip({ view }: { view: WheelStripView }) {
  const t = await getTranslations()
  const locale = await getLocale()

  const monthShort = (m: number) =>
    new Intl.DateTimeFormat(locale, { month: 'short' })
      .format(new Date(Date.UTC(2026, m - 1, 1)))
      .replace(/\.$/, '')
      .toUpperCase()
  // the month now, where the organisation is — the design sets it in ink
  const now = Number(new Intl.DateTimeFormat('en', { month: 'numeric', timeZone: 'Europe/Oslo' }).format(new Date()))

  const kindOf = new Map(view.measured.map((m) => [m.month, m.kind]))
  const months = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const kind = kindOf.get(month) ?? null
    return {
      month,
      kind,
      dot: DOT[kind ?? 'none'],
      tag:
        view.forankring === month && kind !== 'grunnlinje'
          ? t('arshjulet.point.forankring')
          : view.ferie && month === 7
            ? t('arshjulet.point.ferie')
            : '',
    }
  })

  const audienceList = (audiences: NotifyAudience[]) =>
    audiences
      .map((a, i) => {
        const label = t(`arshjulet.audience.${a}.label`)
        return i === 0 ? label : label.toLocaleLowerCase(locale)
      })
      .join(', ')

  return (
    <section className="mt-[22px] rounded-panel border border-line bg-sf px-[24px] py-[20px]">
      <div className="flex flex-wrap items-center justify-between gap-[14px]">
        <span className="flex flex-wrap items-baseline gap-[13px]">
          <span className="text-[11px] uppercase tracking-[0.11em] text-mut">{t('malinger.wheel.head')}</span>
          <span className="text-[13px] font-bold">{t('malinger.wheel.count', { count: view.measured.length })}</span>
          {view.next ? (
            <span className="text-[13px] text-mut">
              {t('malinger.wheel.next', {
                kind: t(`malinger.kind.${view.next.kind}`),
                month: monthShort(view.next.month),
              })}
            </span>
          ) : null}
        </span>
        {/* the design's button to Årshjulet, as the link it is (D-06) */}
        <Link
          href="/arshjulet"
          className="inline-flex h-[30px] flex-none items-center rounded-bar border border-line bg-transparent px-[13px] text-[12px] font-semibold text-ink no-underline hover:text-ink hover:no-underline"
        >
          {t('malinger.wheel.edit')}
        </Link>
      </div>

      <div className="mt-[16px] overflow-x-auto">
        <div className="min-w-[620px]">
          <div className="grid grid-cols-12 gap-[4px] text-center">
            {months.map((m) => (
              <span
                key={m.month}
                className="text-[10px] tracking-[0.05em]"
                style={{
                  fontWeight: m.month === now || m.kind === 'grunnlinje' ? 700 : 500,
                  color: m.month === now ? '#191510' : m.kind ? '#3A342A' : '#8A8272',
                }}
              >
                {monthShort(m.month)}
              </span>
            ))}
          </div>
          <div className="relative mt-[6px] h-[38px]">
            <span className="absolute left-[4%] right-[4%] top-1/2 block h-[2px] -translate-y-1/2 rounded-pill bg-line" />
            <div className="relative grid h-full grid-cols-12 place-items-center gap-[4px]">
              {months.map((m) => (
                <span
                  key={m.month}
                  className="flex items-center justify-center rounded-pill border-2 border-solid font-bold text-ink"
                  style={{
                    width: m.dot.size,
                    height: m.dot.size,
                    background: m.dot.background,
                    borderColor: m.dot.border,
                    fontSize: m.dot.markSize,
                  }}
                >
                  {m.dot.mark}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-[4px] grid grid-cols-12 gap-[4px] text-center">
            {months.map((m) => (
              <span key={m.month} className="text-[9.5px] leading-[1.2] text-[#8A8272]">
                {m.tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-[16px] flex flex-wrap items-center gap-[18px] border-t border-line pt-[14px]">
        <span className="flex flex-wrap items-center gap-[13px]">
          {(['grunnlinje', 'puls', 'none'] as const).map((k) => (
            <span key={k} className="flex items-center gap-[7px]">
              <span
                className="block h-[11px] w-[11px] flex-none rounded-pill border-[1.5px] border-solid"
                style={{ background: DOT[k].background, borderColor: DOT[k].border }}
              />
              <span className="text-[11.5px] text-mut">{t(`malinger.wheel.legend.${k}`)}</span>
            </span>
          ))}
        </span>
        <span className="flex min-w-[280px] flex-1 flex-wrap items-center justify-end gap-[6px]">
          <span className="mr-[2px] text-[11px] uppercase tracking-[0.09em] text-mut">
            {t('malinger.wheel.eachRound')}
          </span>
          {view.cascade.map((c) => (
            <Chip
              key={c.audiences.join()}
              tint={TINT[c.audiences[0] ?? 'alle_ansatte']}
              who={audienceList(c.audiences)}
              when={t('malinger.wheel.before', { days: c.leadDays })}
            />
          ))}
          <Chip
            tint="#FCF6E9"
            who={t('malinger.wheel.reminder')}
            when={t('malinger.wheel.after', { days: view.reminderDay })}
          />
        </span>
      </div>
    </section>
  )
}

function Chip({ tint, who, when }: { tint: string; who: string; when: string }) {
  return (
    <span className="flex items-baseline gap-[6px] rounded-pill px-[11px] py-[6px]" style={{ background: tint }}>
      <span className="text-[11.5px] leading-[1.3]">{who}</span>
      <span className="whitespace-nowrap text-[10.5px] font-bold text-[#3A342A]">{when}</span>
    </span>
  )
}
