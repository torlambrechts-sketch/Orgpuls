import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { StatusChip } from '@/components/admin/growth'
import { NewTask, TaskDone, TaskSkip } from '@/components/admin/TaskForms'
import { Avatar, PageHead, Problem, Segments } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { autoTask, crmCompanies, crmTaskList, TASK_VIEWS, type TaskRow } from '@/lib/admin/crm'
import { slaState } from '@/lib/admin/growthCrmView'

/**
 * Tasks (X-095, the design's `isTasks`): the CRM's tasks (0056) across every company — open ones by
 * due date, those done in the last 90 days — each with its company, the contact it is about, when it
 * is due and who made it; «Mark done» and «New task» work here as on the company's page. A task a
 * call or LinkedIn step made (0137) carries its kind as the design's chip, names its journey and
 * links to the step, is the company owner's, and may be skipped: the sequence waits on it.
 *
 * Revision 3 (0143, D-184): a task a rule or a Brønnøysund trigger made says so — a founder callback
 * after a hand-raise (R10) or a score of 60 (R2), a PQL (R2), a phone call, letter or generic email
 * after a trigger (R11) — and a callback carries its one-hour SLA (weekdays 08–16 Oslo): the working
 * minutes left, or by how much it was missed, or that it was met. The head counts those on the SLA
 * and those journeys, rules and triggers made. A trigger's letter names the business address it goes
 * to; one an objection stopped says so.
 *
 * The row is the design's: the priority dot, the kind chip and the title in one cell (flex 2.4, 10 px
 * apart), the contact on one line (flex 1.6), 12 px padding, 13.5/12/12.5 px text at line-height 1.5.
 * The schema holds no priority, so the dot derives it the way the design's rows have it: a callback on
 * the one-hour SLA is high (peach), every other task normal (the hairline tone).
 */
const CHIP = { call: 'bg-viz1', linkedin: 'bg-viz4', email: 'bg-viz4', letter: 'bg-viz2' } as const
const osloDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' })
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Oslo' })

export default async function CrmTasks({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const k = (key: string, v?: Record<string, string | number>) => t(`crm.tasks.${key}`, v)
  const sp = await searchParams
  const view = (TASK_VIEWS as readonly string[]).includes(sp.view ?? '') ? (sp.view as (typeof TASK_VIEWS)[number]) : 'open'
  const [data, who, companies] = await Promise.all([crmTaskList(view), whoami(), crmCompanies(null, null)])
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const today = osloDay.format(new Date())
  const tomorrow = osloDay.format(new Date(Date.now() + 86_400_000))
  const dueToday = data.rows.filter((r) => !r.done_at && r.due_at === today).length
  const due = (d: string | null) => (!d ? '—' : d === today ? k('today') : d === tomorrow ? k('tomorrow') : dayFmt.format(new Date(`${d}T12:00:00Z`)))
  const sla = (r: TaskRow) => {
    const st = slaState(r.sla_left, r.sla_met)
    if (!st) return null
    if (!('h' in st)) return { tone: st.kind === 'met' ? ('teal' as const) : ('peach' as const), text: k(`sla.${st.kind}`) }
    const text = st.h ? k(`sla.${st.kind}Long`, { h: st.h, m: st.m }) : k(`sla.${st.kind}`, { n: st.m })
    return { tone: st.urgent ? ('peach' as const) : ('yellow' as const), text }
  }

  return (
    <>
      <PageHead title={k('title')} lead={k('lead', { open: data.counts.open, today: dueToday, sla: data.counts.sla_open, automated: data.counts.automated })}>
        {canWrite && !isError(companies) ? (
          <NewTask
            companies={companies.rows.map((c) => ({ id: c.id, name: c.name }))}
            labels={{ open: k('new'), title: k('new'), sub: k('newSub'), company: k('company'), body: k('body'), due: k('due'), create: k('create'), cancel: k('cancel'), close: k('close'), saving: t('common.saving'), failed: t('common.failed') }}
          />
        ) : null}
      </PageHead>
      <section className="rounded-panel border border-line bg-sf">
        <div className="px-[20px] py-[16px]">
          <Segments
            label={k('views')}
            items={TASK_VIEWS.map((v) => ({ key: v, label: k(`view.${v}`), n: data.counts[v], href: v === 'open' ? '/admin/crm/tasks' : `/admin/crm/tasks?view=${v}`, on: view === v }))}
          />
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[660px]">
            <div aria-hidden="true" className="flex items-center gap-[14px] border-y border-line px-[20px] pb-[10px] pt-[12px] text-[11px] uppercase tracking-[0.09em] text-mut">
              <span className="flex-[2.4]">{k('col.task')}</span>
              <span className="flex-[1.6]">{k('col.contact')}</span>
              <span className="w-[130px]">{k('col.due')}</span>
              <span className="w-[36px]">{k('col.owner')}</span>
              <span className="w-[100px]" />
            </div>
            <ul className="m-0 list-none p-0">
              {data.rows.map((r) => {
                const late = !r.done_at && r.due_at !== null && r.due_at < today
                const auto = r.origin ? autoTask(r.body) : null
                const kind = r.step_kind === 'call' || r.step_kind === 'linkedin' ? r.step_kind : r.task_kind
                const clock = sla(r)
                return (
                  <li key={r.id} className="flex items-center gap-[14px] border-b border-line px-[20px] py-[12px]">
                    <div className="flex min-w-0 flex-[2.4] items-center gap-[10px] leading-[1.5]">
                      <span aria-hidden="true" className={`block h-[6px] w-[6px] flex-none rounded-pill ${r.sla_due_at ? 'bg-peach' : 'bg-line'}`} />
                      {kind ? (
                        <span className={`flex-none whitespace-nowrap rounded-pill px-[7px] py-[2px] text-[11px] font-semibold text-mut ${CHIP[kind]}`}>
                          {r.step_kind ? k(`kind.${kind}`) : k(`kindAuto.${kind}`)}
                        </span>
                      ) : null}
                      <div className="min-w-0">
                        <div className={`text-[13.5px] font-semibold ${r.done_at ? 'text-mut line-through' : ''}`}>
                          {auto ? k(`auto.${auto}`, { trigger: r.trigger ? k(`trigger.${r.trigger}`) : '', min: data.rules.founder_min }) : r.body}
                        </div>
                        <div className="text-[12px] text-mut">
                          {r.done_at
                            ? // «stopped» only where the objection closed it; a call made before the objection reads done
                              k(r.skipped ? (r.stopped ? 'stoppedOn' : 'skippedOn') : 'doneOn', { date: dayFmt.format(new Date(r.done_at)) })
                            : r.campaign_id ? (
                              <Link href={`/admin/crm/campaigns/${r.campaign_id}` as Route} className="text-mut underline-offset-2 hover:text-ink">
                                {k('fromJourney', { journey: r.journey ?? '—' })}
                              </Link>
                            ) : auto ? (
                              auto.startsWith('outreach')
                                ? r.to
                                  ? k('autoSrc.outreachTo', { trigger: r.trigger ?? '—', rule: r.rule ?? '', to: r.to })
                                  : k('autoSrc.outreach', { trigger: r.trigger ?? '—', rule: r.rule ?? '' })
                                : k(`autoSrc.${auto}`, { rule: r.rule ?? '', min: data.rules.founder_min })
                            ) : (
                              k('manual')
                            )}
                        </div>
                      </div>
                    </div>
                    <div className="min-w-0 flex-[1.6] overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px] leading-[1.5] text-mut">
                      {r.contact ? `${r.contact} · ` : r.manager ? `${r.manager} · ` : ''}
                      <Link href={`/admin/crm/prospects/${r.company_id}` as Route} className="text-mut underline-offset-2 hover:text-ink">
                        {r.company}
                      </Link>
                    </div>
                    <div className={`w-[130px] text-[12.5px] font-semibold leading-[1.5] ${late ? 'text-danger' : ''}`}>
                      {r.sla_due_at ? k('dueSla', { due: due(r.due_at) }) : due(r.due_at)}
                      {clock ? (
                        <span className="mt-[4px] block">
                          <StatusChip tone={clock.tone} size="sla">
                            {clock.text}
                          </StatusChip>
                        </span>
                      ) : null}
                    </div>
                    <div className="w-[36px]">{r.admin_email ? <Avatar name={r.admin_email} /> : null}</div>
                    <div className="flex w-[100px] flex-col items-end gap-[4px]">
                      {!r.done_at && canWrite ? <TaskDone id={r.id} company={r.company_id} label={k('markDone')} /> : null}
                      {!r.done_at && canWrite && r.campaign_id ? <TaskSkip id={r.id} company={r.company_id} label={k('skip')} /> : null}
                    </div>
                  </li>
                )
              })}
            </ul>
            {data.rows.length ? null : <p className="m-0 px-[20px] py-[18px] text-[13px] text-mut">{k(`empty.${view}`)}</p>}
          </div>
        </div>
      </section>
    </>
  )
}
