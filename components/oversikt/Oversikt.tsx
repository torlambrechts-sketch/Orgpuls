import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { FullLink } from './FullLink'
import { TodoList, type TodoItem } from './TodoList'
import { WaitingList, type WaitingItem } from './WaitingList'
import { getConversations } from '@/lib/conversations/read'
import { getMeasures } from '@/lib/measures/read'
import { getOrganization } from '@/lib/org/read'
import { heatTone, getResultsSummary } from '@/lib/results/read'
import { getRiskAssessment } from '@/lib/risk/read'
import { getRoundFactorKeys, getRounds } from '@/lib/rounds/read'
import { getShellContext } from '@/lib/shell/read'
import { getWheel } from '@/lib/wheel/read'
import { WizardButton } from '@/components/veiviser/WizardProvider'

/**
 * Oversikt — design 3's Enkel landing page (bundle 3, `isOverview`, 410-518). D-71.
 *
 * One page for the small organisation's leader: a sentence about where things stand, the
 * factors as bars, the three measures to do, the two comments that have waited longest,
 * what is coming, the report, and — in law mode — that the documentation is in order.
 *
 * Every line is a row read here, never the prototype's literals:
 *
 *   sentence    the latest closed grunnlinje: its highest factor and its two lowest
 *   figures     that round's index, the change from the grunnlinje before, its response rate
 *   areas       every factor it measured, lowest first, with the change from the year before
 *   todo        the measures decided or running, in the order they were decided
 *   waiting     the comments `conversations()` releases that wait for an answer, oldest first
 *   upcoming    the planned rounds, with the factors and question count each one holds
 *   law line    law mode, and a risk assessment on that grunnlinje
 *
 * A block with nothing behind it renders the design's empty treatment, or nothing.
 * Where the design states something the data does not (five questions, two days' notice,
 * four pages), the sentence says what the data does: D-71 lists each.
 */
const DAY = 86_400_000

export async function Oversikt() {
  const t = await getTranslations()
  const locale = await getLocale()
  const [org, rounds, measures, conversations, wheel, shell] = await Promise.all([
    getOrganization(),
    getRounds(),
    getMeasures(),
    getConversations(null),
    getWheel(),
    getShellContext(),
  ])

  const grunnlinjer = rounds.filter((r) => r.status === 'lukket' && r.kind === 'grunnlinje')
  const current = grunnlinjer[0] ?? null
  const previous = grunnlinjer[1] ?? null
  const planned = rounds
    .filter((r) => r.status === 'planlagt' && r.opensAt)
    .sort((a, b) => (a.opensAt ?? '').localeCompare(b.opensAt ?? ''))
    .slice(0, 3)

  const [summary, prior, risk, plannedFactors] = await Promise.all([
    current ? getResultsSummary(current.id) : null,
    previous ? getResultsSummary(previous.id) : null,
    current ? getRiskAssessment(current.id) : null,
    Promise.all(planned.map((r) => getRoundFactorKeys(r.id))),
  ])

  const ok = summary?.status === 'ok' ? summary : null
  const before = new Map((prior?.status === 'ok' ? prior.factors : []).map((f) => [f.key, f.index]))
  const name = (key: string) => t(`factor.${key}.name`)
  const lower = (s: string) => s.toLocaleLowerCase(locale)

  // lowest first, the instrument's order breaking ties, as Resultat sorts by risk
  const byIndex = ok ? [...ok.factors].sort((a, b) => a.index - b.index || a.sort_order - b.sort_order) : []
  const high = byIndex.at(-1)
  const sentence =
    byIndex.length >= 3 && high
      ? t('oversikt.sentence', {
          high: lower(name(high.key)),
          low1: lower(name(byIndex[0]!.key)),
          low2: lower(name(byIndex[1]!.key)),
        })
      : t('oversikt.noResult')

  const delta = ok && prior?.status === 'ok' ? ok.index - prior.index : null

  const dateOf = (iso: string, withYear: boolean) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: 'Europe/Oslo',
      day: 'numeric',
      month: 'long',
      ...(withYear ? { year: 'numeric' } : {}),
    }).format(new Date(iso))
  const thisYear = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Oslo', year: 'numeric' }).format(new Date())
  const yearOf = (iso: string) => new Intl.DateTimeFormat('en', { timeZone: 'Europe/Oslo', year: 'numeric' }).format(new Date(iso))
  const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' }).format(new Date(Date.now() - DAY))

  const todo: TodoItem[] = measures
    .filter((m): m is typeof m & { step: 'besluttet' | 'pagar' } => m.step === 'besluttet' || m.step === 'pagar')
    .slice(0, 3)
    .map((m) => {
      const due = !m.dueDate
        ? t('oversikt.dueUnset')
        : m.dueDate === yesterday
          ? t('oversikt.dueYesterday')
          : m.late
            ? t('oversikt.dueLapsed', { date: dateOf(`${m.dueDate}T12:00:00Z`, yearOf(`${m.dueDate}T12:00:00Z`) !== thisYear) })
            : t('oversikt.due', { date: dateOf(`${m.dueDate}T12:00:00Z`, yearOf(`${m.dueDate}T12:00:00Z`) !== thisYear) })
      return {
        id: m.id,
        title: m.title,
        meta: `${m.owner?.name ?? t('oversikt.noOwner')} · ${due}`,
        late: m.late,
        aria: t('oversikt.markDone', { title: m.title }),
        from: m.step,
      }
    })

  const waitingAll = (conversations?.items ?? [])
    .filter((c) => c.state === 'venter')
    .sort((a, b) => a.openedHour.localeCompare(b.openedHour))
  const waiting: WaitingItem[] = waitingAll.slice(0, 2).map((c) => ({
    id: c.id,
    factor: name(c.factorKey),
    text: c.opening,
    age: t('oversikt.waitingAge', { days: c.waitingDays }),
    old: c.waitingDays >= 5,
  }))

  const list = new Intl.ListFormat(locale, { type: 'conjunction' })
  const upcoming = planned.map((r, i) => {
    const puls = r.kind === 'puls'
    return {
      id: r.id,
      what: t(`oversikt.kind.${puls ? 'puls' : 'grunnlinje'}`),
      when: dateOf(r.opensAt!, yearOf(r.opensAt!) !== thisYear),
      note: puls
        ? t('oversikt.pulsNote', {
            count: r.questionCount,
            factors: list.format((plannedFactors[i] ?? []).map((k) => lower(name(k)))),
          })
        : t('oversikt.grunnlinjeNote'),
      puls,
    }
  })
  const vo = wheel?.ladder.find((l) => l.audience === 'verneombud')?.leadDays
  const all = wheel?.ladder.find((l) => l.audience === 'alle_ansatte')?.leadDays
  const upcomingNote = [
    wheel?.active ? t('oversikt.auto') : null,
    vo !== undefined && all !== undefined && vo > all ? t('oversikt.voLead', { days: vo - all }) : null,
  ]
    .filter(Boolean)
    .join(' ')

  const lawOk = shell.lawMode && !!current && !!risk
  const link = 'cursor-pointer border-none bg-transparent p-0 font-bold text-link no-underline hover:text-link hover:no-underline'
  const card = 'rounded-panel border border-line bg-sf px-[24px] py-[22px]'

  return (
    <main className="animate-entry mx-auto max-w-overview px-[16px] pb-[60px] pt-[34px] md:px-[28px]">
      <div className="text-[11px] uppercase tracking-[0.11em] text-mut">
        {t('oversikt.kicker', { org: (org?.name ?? '').replace(/ AS$/, '') })}
      </div>
      <h1 className="m-0 mt-[10px] font-display text-[30px] font-medium leading-[1.3] [text-wrap:pretty]">{sentence}</h1>

      <div className="mt-[14px] flex flex-wrap items-center gap-x-[22px] gap-y-[10px] text-[13.5px] text-mut">
        {ok ? (
          <span>
            {t('oversikt.index')} <strong className="text-[18px] text-ink">{ok.index}</strong>
          </span>
        ) : null}
        {delta !== null ? (
          <span className={`font-semibold ${delta < 0 ? 'text-danger' : delta > 0 ? 'text-link' : 'text-mut'}`}>
            {delta < 0
              ? t('oversikt.deltaDown', { n: -delta })
              : delta > 0
                ? t('oversikt.deltaUp', { n: delta })
                : t('oversikt.deltaSame')}
          </span>
        ) : null}
        {current?.participation ? (
          <span>
            {t('oversikt.rate', {
              answered: current.participation.answered,
              headcount: current.participation.headcount,
            })}
          </span>
        ) : null}
        {ok ? (
          <FullLink href="/resultater" className={`ml-auto text-[13px] ${link}`}>
            {t('oversikt.seeAll')}
          </FullLink>
        ) : null}
        <WizardButton className={`${ok ? '' : 'ml-auto '}text-[13px] leading-[normal] ${link}`}>{t('veiviser.open')}</WizardButton>
      </div>

      {ok ? (
        <section className={`mt-[22px] ${card}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-[12px]">
            <h2 className="m-0 font-display text-[21px] font-semibold">{t('oversikt.areasTitle')}</h2>
            <span className="text-[12px] text-mut">{t('oversikt.areasNote')}</span>
          </div>
          <div className="mt-[14px] grid gap-x-[18px] gap-y-[8px] [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
            {byIndex.map((f) => {
              const tone = heatTone(f.index)
              const was = before.get(f.key)
              const d = was === undefined ? null : f.index - was
              return (
                <FullLink
                  key={f.key}
                  href="/resultater"
                  className="grid cursor-pointer items-center gap-[10px] border-b border-track bg-transparent px-[4px] py-[8px] text-left text-ink no-underline [grid-template-columns:minmax(0,1fr)_36px] hover:text-ink hover:no-underline"
                >
                  <span className="min-w-0">
                    <span className="flex justify-between gap-[8px] text-[13px]">
                      <span className="font-semibold">{name(f.key)}</span>
                      <span className="whitespace-nowrap text-[11.5px] text-mut">
                        {t(`oversikt.word.${f.index < 50 ? 'low' : f.index < 66 ? 'mid' : 'high'}`)}
                        {d !== null ? (
                          <>
                            {' '}
                            <span
                              className={`font-bold ${d <= -3 ? 'text-danger' : d >= 3 ? 'text-link' : 'text-faint'}`}
                            >
                              {`${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)}`}
                            </span>
                          </>
                        ) : null}
                      </span>
                    </span>
                    <span className="mt-[6px] block h-[7px] overflow-hidden rounded-pill bg-[rgba(25,21,16,.07)]">
                      <span
                        className="block h-full rounded-pill"
                        style={{ width: `${f.index}%`, background: tone.bg }}
                      />
                    </span>
                  </span>
                  <span
                    className="rounded-[7px] py-[2px] text-center text-[15px] font-bold"
                    style={{ background: tone.bg, color: tone.fg }}
                  >
                    {f.index}
                  </span>
                </FullLink>
              )
            })}
          </div>
        </section>
      ) : null}

      <section className={`mt-[26px] ${card}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-[12px]">
          <h2 className="m-0 font-display text-[21px] font-semibold">{t('oversikt.todoTitle')}</h2>
          <FullLink href="/tiltak" className={`text-[12.5px] ${link}`}>
            {t('oversikt.todoAll')}
          </FullLink>
        </div>
        <div className="mt-[14px] flex flex-col gap-[8px]">
          <TodoList
            items={todo}
            labels={{
              problem: t('oversikt.saveProblem'),
              empty: t('oversikt.todoEmpty'),
            }}
          />
        </div>
      </section>

      {conversations ? (
        <section className={`mt-[14px] ${card}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-[12px]">
            <h2 className="m-0 font-display text-[21px] font-semibold">{t('oversikt.waitingTitle')}</h2>
            <FullLink href="/kommentarer" className={`text-[12.5px] ${link}`}>
              {t('oversikt.waitingAll', { count: waitingAll.length })}
            </FullLink>
          </div>
          <div className="mt-[3px] text-[12.5px] text-mut">{t('oversikt.waitingSub')}</div>
          <div className="mt-[14px] flex flex-col gap-[10px]">
            <WaitingList
              items={waiting}
              labels={{
                placeholder: t('oversikt.replyPlaceholder'),
                replyAria: t('oversikt.replyAria'),
                send: t('oversikt.send'),
                sent: t('oversikt.replySent'),
                problem: t('oversikt.replyProblem'),
                empty: t('oversikt.waitingEmpty'),
              }}
            />
          </div>
        </section>
      ) : null}

      <div className="mt-[14px] grid items-stretch gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
        <section className="rounded-panel border border-line bg-sf px-[22px] py-[20px]">
          <div className="flex flex-wrap items-baseline justify-between gap-[10px]">
            <h2 className="m-0 text-[11px] font-normal uppercase tracking-[0.11em] text-mut">{t('oversikt.upcomingTitle')}</h2>
            <FullLink href="/malinger" className={`text-[12px] ${link}`}>
              {t('oversikt.upcomingChange')}
            </FullLink>
          </div>
          <div className="mt-[12px] flex flex-col gap-[9px]">
            {upcoming.length === 0 ? (
              <span className="text-[12.5px] text-mut">{t('oversikt.upcomingEmpty')}</span>
            ) : (
              upcoming.map((u) => (
                <div key={u.id} className="flex items-start gap-[11px]">
                  <span
                    aria-hidden="true"
                    className={`mt-[4px] box-border h-[12px] w-[12px] flex-none rounded-pill border-2 ${
                      u.puls ? 'border-link bg-teal' : 'border-ink bg-ac'
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block text-[13.5px]">
                      <strong>{u.what}</strong> · {u.when}
                    </span>
                    <span className="mt-[1px] block text-[12px] leading-[1.45] text-mut [text-wrap:pretty]">{u.note}</span>
                  </span>
                </div>
              ))
            )}
          </div>
          {upcomingNote ? (
            <div className="mt-[12px] text-[11.5px] leading-[1.45] text-mut">{upcomingNote}</div>
          ) : null}
        </section>
        <Link
          href="/rapport"
          className="flex cursor-pointer flex-col justify-center rounded-panel border border-ink bg-sbg px-[22px] py-[20px] text-left text-ink no-underline hover:text-ink hover:no-underline"
        >
          <span className="block text-[11px] uppercase tracking-[0.11em] text-mut">{t('oversikt.reportKicker')}</span>
          <span className="mt-[8px] block text-[17px] font-bold">{t('oversikt.reportTitle')}</span>
          <span className="mt-[4px] block text-[12.5px] leading-[1.5] text-body [text-wrap:pretty]">
            {t('oversikt.reportBody')}
          </span>
        </Link>
      </div>

      {lawOk && current ? (
        <div className="mt-[14px] flex items-center gap-[12px] rounded-opt bg-mint px-[18px] py-[14px] text-greendeep">
          <span
            aria-hidden="true"
            className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-pill bg-greendeep text-[13px] font-bold leading-[normal] text-mint"
          >
            ✓
          </span>
          <span className="text-[13px] leading-[1.5] [text-wrap:pretty]">{t('oversikt.lawOk', { year: current.year })}</span>
        </div>
      ) : null}
    </main>
  )
}
