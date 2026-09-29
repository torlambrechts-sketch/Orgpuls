import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { NewTask, TaskDone } from '@/components/admin/TaskForms'
import { Avatar, PageHead, Problem, Segments } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { crmCompanies, crmTaskList, TASK_VIEWS } from '@/lib/admin/crm'

/**
 * Tasks (X-095, the design's `isTasks`): the CRM's tasks (0056) across every company — open ones by
 * due date, those done in the last 90 days — each with its company, the contact it is about, when it
 * is due and who made it; «Mark done» and «New task» work here as on the company's page.
 */
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

  return (
    <>
      <PageHead title={k('title')} lead={k('lead', { open: data.counts.open, today: dueToday })}>
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
              <span className="flex-[2.2]">{k('col.task')}</span>
              <span className="flex-[1.4]">{k('col.contact')}</span>
              <span className="w-[130px]">{k('col.due')}</span>
              <span className="w-[36px]">{k('col.owner')}</span>
              <span className="w-[100px]" />
            </div>
            <ul className="m-0 list-none p-0">
              {data.rows.map((r) => {
                const late = !r.done_at && r.due_at !== null && r.due_at < today
                return (
                  <li key={r.id} className="flex items-center gap-[14px] border-b border-line px-[20px] py-[14px]">
                    <span aria-hidden="true" className={`block h-[6px] w-[6px] flex-none rounded-pill ${r.done_at ? 'bg-teal' : late ? 'bg-peach' : 'bg-ac'}`} />
                    <div className="min-w-0 flex-[2.2]">
                      <div className={`text-[14px] font-semibold ${r.done_at ? 'text-mut line-through' : ''}`}>{r.body}</div>
                      <div className="text-[12.5px] text-mut">{r.done_at ? k('doneOn', { date: dayFmt.format(new Date(r.done_at)) }) : k('manual')}</div>
                    </div>
                    <div className="min-w-0 flex-[1.4] text-[13px] text-mut">
                      {r.contact ? `${r.contact} · ` : ''}
                      <Link href={`/admin/crm/prospects/${r.company_id}` as Route} className="text-mut underline-offset-2 hover:text-ink">
                        {r.company}
                      </Link>
                    </div>
                    <div className={`w-[130px] text-[13px] font-semibold ${late ? 'text-danger' : ''}`}>{due(r.due_at)}</div>
                    <div className="w-[36px]">{r.admin_email ? <Avatar name={r.admin_email} /> : null}</div>
                    <div className="flex w-[100px] justify-end">{!r.done_at && canWrite ? <TaskDone id={r.id} company={r.company_id} label={k('markDone')} /> : null}</div>
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
