import { getLocale, getTranslations } from 'next-intl/server'
import { ButtonLink } from '@/components/ui/Button'
import { WheelForm, type WheelFormProps } from '@/components/arshjulet/WheelForm'
import type { JobRun, NotifyAudience, Wheel } from '@/lib/wheel/read'

/**
 * Årshjulet, the rendering. Bundle lines 1253-1424.
 *
 * The screen claims the year runs by itself. Migration 0020 made that true — pg_cron
 * opens rounds, queues the notification ladder, reminds, closes, freezes and plans the
 * next year — so the claim is now checkable, and this screen checks it: the running pill
 * reads a job log, not a boolean somebody set.
 *
 * Delivery is the dispatcher's (0032, D-65): every five minutes it mints each link at the
 * moment it sends and mails it through Brevo. The panel prints the queue's own counts, and
 * its closing sentence depends on the organisation's switch — "sent every five minutes"
 * where mail is on, "switched off, nobody receives them" where it is not — so the screen
 * never claims a delivery the organisation has turned off.
 */

/**
 * A month on the strip.
 *
 * Its `role` is what the month IS in the wheel, and everything about how it is drawn
 * follows from that — not from whether it has already happened. An earlier version
 * coloured the dots by past/present/future, which put a filled dot on every month up to
 * today and none on the ones that matter. The design fills the baseline, rings the
 * pulses, and leaves every other month a small hollow point (bundle 3762).
 */
export interface YearPoint {
  month: number
  role: 'grunnlinje' | 'puls' | 'ferie' | 'forankring' | null
}

export interface ArshjuletView {
  wheel: Wheel
  year: YearPoint[]
  lastRun: JobRun | null
  queue: { pending: number; sent: number; failed: number }
  /** whether the dispatcher sends this organisation's notices (0032) */
  mailOn: boolean
  /** rounds the wheel has planned, which is what "4 målinger i året" counts */
  plannedPerYear: number
  nextBaseline: { month: number; year: number } | null
  canWrite: boolean
  /** the round's own schedule, which is what the process timeline prints */
  reminderDay: number | null
  closeAfterDays: number
}

/**
 * Transcribed from the bundle (3762): size, fill and ring per role.
 *
 * Keyed by the role union rather than by `string`, so a month whose role the database
 * grows tomorrow fails to compile here instead of falling through to the plain dot.
 */
type DotRole = NonNullable<YearPoint['role']> | 'none'

const DOT: Record<DotRole, { background: string; borderColor: string; size: number }> = {
  grunnlinje: { background: '#F5C64A', borderColor: '#191510', size: 20 },
  puls: { background: '#A8D5D2', borderColor: '#2F5D2A', size: 13 },
  ferie: { background: '#FCF6E9', borderColor: '#C4BCA8', size: 9 },
  forankring: { background: '#FCF6E9', borderColor: '#E8DFC9', size: 9 },
  none: { background: '#FCF6E9', borderColor: '#E8DFC9', size: 9 },
}

/** The label under a month, and the month's own name above it (bundle 3765-3771). */
const LABEL_INK: Record<NonNullable<YearPoint['role']>, string> = {
  grunnlinje: '#191510',
  puls: '#5F5849',
  ferie: '#8A8272',
  forankring: '#8A8272',
}

const AUDIENCE_TONE: Record<NotifyAudience, { background: string; mark: string }> = {
  verneombud: { background: '#CFE7E4', mark: '#191510' },
  tillitsvalgte: { background: '#CFE7E4', mark: '#191510' },
  daglig_leder: { background: '#CFE7E4', mark: '#191510' },
  avdelingsledere: { background: '#FBEBBE', mark: '#191510' },
  alle_ansatte: { background: '#FCF6E9', mark: '#191510' },
}

export async function ArshjuletScreen({ view }: { view: ArshjuletView }) {
  const t = await getTranslations()
  const locale = await getLocale()

  const monthShort = (m: number) =>
    new Intl.DateTimeFormat(locale, { month: 'short' })
      .format(new Date(Date.UTC(2026, m - 1, 1)))
      .replace(/\.$/, '')
      .toUpperCase()

  const monthLong = (m: number) =>
    new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(Date.UTC(2026, m - 1, 1)))

  const form: WheelFormProps = {
    canWrite: view.canWrite,
    values: {
      cadence: view.wheel.cadence,
      notifyLeadDays: view.wheel.notifyLeadDays,
      extendIfLow: view.wheel.extendIfLow,
      skipFellesferie: view.wheel.skipFellesferie,
      notifyVoOnOverdue: view.wheel.notifyVoOnOverdue,
    },
    options: {
      cadences: (['minimum', 'kvartalspuls', 'manedspuls'] as const).map((c) => ({
        value: c,
        label: t(`arshjulet.cadence.${c}.label`),
        note: t(`arshjulet.cadence.${c}.note`),
      })),
      leads: [7, 14, 21].map((d) => ({
        value: String(d),
        label: t('arshjulet.leadDays', { days: d }),
      })),
    },
    ladder: view.wheel.ladder.map((n, i) => ({
      audience: n.audience,
      order: i + 1,
      label: t(`arshjulet.audience.${n.audience}.label`),
      note: t(`arshjulet.audience.${n.audience}.note`),
      lead: t('arshjulet.leadDays', { days: n.leadDays }),
      background: AUDIENCE_TONE[n.audience].background,
    })),
    labels: {
      rhythm: t('arshjulet.rhythmHead'),
      notifyHead: t('arshjulet.notifyHead'),
      roundHead: t('arshjulet.roundHead'),
      exceptionHead: t('arshjulet.exceptionHead'),
      extendIfLow: t('arshjulet.extendIfLow'),
      extendIfLowNote: t('arshjulet.extendIfLowNote'),
      skipFellesferie: t('arshjulet.skipFellesferie'),
      skipFellesferieNote: t('arshjulet.skipFellesferieNote'),
      notifyVo: t('arshjulet.notifyVo'),
      notifyVoNote: t('arshjulet.notifyVoNote'),
      saved: t('arshjulet.saved'),
      problems: Object.fromEntries(
        ['invalid', 'denied'].map((k) => [k, t(`arshjulet.problem.${k}`)]),
      ),
    },
  }

  /**
   * The round's chain. Four of the design's seven steps: the assistant's draft risk
   * assessment, the AMU case and the escalation of an ownerless measure are jobs nothing
   * in this product performs, and a timeline that printed them would be describing
   * software that does not exist. D-29.
   *
   * The days are the round's own — `reminder_day` and `close_after_days` from the row —
   * so a round configured differently prints differently rather than printing the
   * design's 2 and 7 as though they were the rule.
   */
  const steps = [
    { key: 'send', day: t('arshjulet.step.send.day'), tone: '#F5C64A' },
    ...(view.reminderDay !== null
      ? [
          {
            key: 'remind',
            day: t('arshjulet.step.remind.day', { day: view.reminderDay }),
            tone: '#F5C64A',
          },
        ]
      : []),
    { key: 'close', day: t('arshjulet.step.close.day', { day: view.closeAfterDays }), tone: '#A8D5D2' },
    { key: 'next', day: t('arshjulet.step.next.day'), tone: '#F5C64A' },
  ].map((s) => ({
    ...s,
    what: t(`arshjulet.step.${s.key}.title`),
    who: t(`arshjulet.step.${s.key}.note`),
  }))

  return (
    <main className="animate-entry mx-auto max-w-[1180px] px-[16px] md:px-[28px] pb-[60px] pt-[26px]">
      <ButtonLink href="/malinger" size="xxs" tone="ghost">
        {t('arshjulet.back')}
      </ButtonLink>

      <div className="mt-[16px] flex flex-wrap items-end justify-between gap-[20px]">
        <div className="min-w-0">
          <h1 className="m-0 font-display text-[32px] font-semibold leading-[1.1]">
            {t('arshjulet.title')}
          </h1>
          <p className="mt-[9px] max-w-[600px] text-[14.5px] leading-[1.6] text-mut [text-wrap:pretty]">
            {t('arshjulet.lead')}
          </p>
        </div>

        {/*
          The pill is evidence, not a setting. Its two fills are the design's (on #CFE7E4,
          off #FBD5C4); the third label is not a third colour. A wheel that is switched on
          but has never ticked is still on, so it keeps the on fill and says in words what
          the fill cannot: that the scheduler has not started yet.
        */}
        <span
          className="flex h-[46px] flex-none items-center gap-[11px] rounded-cta border border-ink px-[18px] text-[14.5px] font-bold"
          style={
            view.wheel.active
              ? { background: '#CFE7E4', color: '#20431C' }
              : { background: '#FBD5C4', color: '#6B240C' }
          }
        >
          {view.wheel.active
            ? view.lastRun
              ? t('arshjulet.running')
              : t('arshjulet.armed')
            : t('arshjulet.off')}
        </span>
      </div>

      <div className="mt-[10px] max-w-[600px] text-[13px] leading-[1.55] text-mut [text-wrap:pretty]">
        {view.wheel.active ? t('arshjulet.lead2') : t('arshjulet.lead2Off')}
      </div>

      {/*
        The year, transcribed from the bundle (1299-1321): a 12-column grid at gap 4, a
        3px rule behind a 30px band, and a dot whose size and ring are the month's *role*
        — 20px on the grunnlinje, 13 on a puls, 9 on everything else. Not past/present/
        future: a wheel describes a shape, and the shape does not move with today's date.
      */}
      <section className="mt-[24px] rounded-card border border-line bg-sf p-[26px]">
        <div className="text-[11px] uppercase tracking-[0.11em] text-mut">
          {t('arshjulet.yearHead')}
        </div>

        <div className="mt-[16px] overflow-x-auto">
          <div className="min-w-[680px]">
            <div className="grid grid-cols-12 gap-[4px] text-center text-[10.5px]">
              {view.year.map((p) => (
                <span
                  key={p.month}
                  className={p.role === 'grunnlinje' ? 'font-bold text-ink' : 'font-medium text-mut'}
                >
                  {monthShort(p.month)}
                </span>
              ))}
            </div>

            <div className="relative mt-[9px] h-[30px]">
              <span className="absolute inset-x-0 top-1/2 block h-[3px] -translate-y-1/2 rounded-pill bg-line" />
              <div className="relative grid h-full grid-cols-12 place-items-center gap-[4px]">
                {view.year.map((p) => {
                  const d = DOT[p.role ?? 'none']
                  return (
                    <span
                      key={p.month}
                      className="block rounded-pill border-2"
                      style={{
                        width: `${d.size}px`,
                        height: `${d.size}px`,
                        background: d.background,
                        borderColor: d.borderColor,
                      }}
                    />
                  )
                })}
              </div>
            </div>

            <div className="mt-[9px] grid grid-cols-12 gap-[4px] text-center text-[10.5px] leading-[1.3]">
              {view.year.map((p) => (
                <span key={p.month} style={{ color: p.role ? LABEL_INK[p.role] : 'transparent' }}>
                  {p.role ? t(`arshjulet.point.${p.role}`) : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-[20px] grid items-start gap-[20px] md:[grid-template-columns:minmax(0,1.5fr)_minmax(280px,1fr)]">
        {/*
          The design's left column is Rytme, Hvem varsles først, Hva skjer i hver runde,
          Unntak og eskalering — in that order, with the timeline sitting *between* two
          cards that write. The form owns the column so the three writing cards stay one
          form; the timeline is handed to it as the block that belongs in the middle.
        */}
        <WheelForm {...form} between={<RoundTimeline steps={steps} />} />

        <div className="sticky top-[78px] flex min-w-0 flex-col gap-[14px]">
          <section className="rounded-panel border border-line bg-ink px-[24px] py-[22px] text-bg">
            <div className="text-[11px] uppercase tracking-[0.11em] opacity-65">
              {t('arshjulet.summaryHead')}
            </div>
            <div className="mt-[8px] font-display text-[26px] font-semibold leading-[1.15]">
              {t('arshjulet.summaryRounds', { count: view.plannedPerYear })}
            </div>

            {/*
              The design's third and fourth rows read "0 manuelle steg" and "20 varsler
              sendes automatisk". These two rows print the queue's own counts instead —
              waiting and sent — which is the same fact without a number nobody measured.
              D-29, D-65.
            */}
            <div className="mt-[16px] flex flex-col gap-[9px]">
              <Row
                label={t('arshjulet.summaryBaseline')}
                value={monthShort(view.wheel.baselineMonth)}
              />
              <Row
                label={t('arshjulet.summaryForankring')}
                value={monthShort(((view.wheel.baselineMonth + 10) % 12) + 1)}
              />
              <Row
                label={t('arshjulet.summaryQueued')}
                value={t('arshjulet.queuedValue', { count: view.queue.pending })}
              />
              <Row
                label={t('arshjulet.summarySent')}
                value={t('arshjulet.sentValue', { count: view.queue.sent })}
              />
            </div>

            <div className="mt-[16px] border-t border-bg/20 pt-[14px] text-[12.5px] leading-[1.55] opacity-80 [text-wrap:pretty]">
              {view.nextBaseline
                ? t('arshjulet.nextBaseline', {
                    month: monthLong(view.nextBaseline.month),
                    year: view.nextBaseline.year,
                  })
                : t('arshjulet.noNextBaseline')}{' '}
              {view.lastRun
                ? t('arshjulet.lastRun', {
                    when: new Intl.DateTimeFormat(locale, {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Europe/Oslo',
                    }).format(new Date(view.lastRun.ran_at)),
                  })
                : t('arshjulet.neverRun')}{' '}
              {view.mailOn ? t('arshjulet.dispatchOn') : t('arshjulet.dispatchOff')}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

/**
 * Hva skjer i hver runde. Bundle 1366-1384: an 86px day column, a 14px rail carrying a
 * 12px dot over a 2px connector, and the step itself. The rail's dot is drawn with a
 * 2px surface-coloured border and a 1px ring, so it reads as a bead threaded on the line
 * rather than a disc sitting beside it.
 */
function RoundTimeline({
  steps,
}: {
  steps: { key: string; day: string; tone: string; what: string; who: string }[]
}) {
  return (
    <div className="flex flex-col gap-0">
      {steps.map((s) => (
        <div
          key={s.key}
          className="grid items-start gap-[13px] py-[10px] [grid-template-columns:86px_14px_minmax(0,1fr)]"
        >
          <span className="pt-[3px] text-right text-[12px] font-bold text-mut">{s.day}</span>
          <span className="flex flex-col items-center self-stretch">
            <span
              className="mt-[3px] block h-[12px] w-[12px] flex-none rounded-pill border-2 border-sf shadow-[0_0_0_1px_#C4BCA8]"
              style={{ background: s.tone }}
            />
            <span className="block min-h-[12px] w-[2px] flex-1 bg-line" />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold [text-wrap:pretty]">{s.what}</span>
            <span className="mt-[2px] block text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
              {s.who}
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-[12px] text-[13px]">
      <span className="opacity-65">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  )
}
