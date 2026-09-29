import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { LeadClock } from '@/components/admin/CrmBoard'
import type { CrmMessages } from '@/components/admin/CrmForms'
import { CrmTabs } from '@/components/admin/CrmTabs'
import { SlaForm } from '@/components/admin/CrmStageForms'
import { Badge, Card, PageHead, Problem, Stat, when } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { crmInbox, crmStages } from '@/lib/admin/crm'

const FILTERS = ['all', 'awaiting', 'trials', 'answered'] as const
type Filter = (typeof FILTERS)[number]

/**
 * The inbox (0112, X-091): every inbound lead of the last 30 days — a trial sign-up, someone who
 * wrote through the contact form or asked for a demo — with a clock against the first-response
 * target. A lead counts as answered when a call, mail, meeting, reply or note is logged on it after
 * it came. Who and when only: what a lead wrote is not shown here.
 */
export default async function CrmInbox({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams
  const filter: Filter = (FILTERS as readonly string[]).includes(show ?? '') ? (show as Filter) : 'all'
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const x = m.inbox
  const [data, stageData, who] = await Promise.all([crmInbox(30), crmStages(), whoami()])
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const stageName = new Map(isError(stageData) ? [] : stageData.rows.map((s) => [s.key, s.name]))
  const rows = data.rows.filter(
    (r) => filter === 'all' || (filter === 'awaiting' && !r.answered_at) || (filter === 'trials' && r.kind === 'trial') || (filter === 'answered' && !!r.answered_at),
  )
  const w = data.week
  const median = w.median_minutes === null ? '—' : w.median_minutes < 60 ? `${Math.round(w.median_minutes)} min` : `${(w.median_minutes / 60).toFixed(1)} h`

  return (
    <>
      <PageHead title={x.title} lead={x.lead.replace('{sla}', String(data.sla_minutes))} />
      <CrmTabs current="overview" labels={m.tabs} />

      <div className="mb-[14px] grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        <Stat label={x.awaiting} value={data.awaiting} />
        <Stat label={x.median} value={median} />
        <Stat label={x.withinSla.replace('{sla}', String(data.sla_minutes))} value={w.answered ? `${Math.round((100 * w.within_sla) / w.answered)} %` : '—'} hint={`${w.within_sla} / ${w.answered}`} />
        <Stat label={x.leads} value={w.leads} />
        <Stat label={x.trials} value={w.trials} />
      </div>

      <nav aria-label={x.filter} className="mb-[12px] flex flex-wrap gap-[6px]">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={(f === 'all' ? '/admin/crm/inbox' : `/admin/crm/inbox?show=${f}`) as Route}
            aria-current={f === filter ? 'page' : undefined}
            className={`rounded-pill border px-[12px] py-[5px] text-[12.5px] font-semibold no-underline ${f === filter ? 'border-ink bg-ink text-bg hover:text-bg' : 'border-line bg-sf text-ink hover:text-ink'}`}
          >
            {x.show[f]}
          </Link>
        ))}
      </nav>

      <Card>
        {rows.length ? (
          <ul className="m-0 list-none p-0">
            {rows.map((r) => {
              const href = r.company_id ? `/admin/crm/prospects/${r.company_id}` : r.contact_id ? `/admin/crm/contacts/${r.contact_id}` : null
              return (
                <li key={`${r.kind}-${r.company_id ?? r.contact_id}`} className="flex flex-wrap items-center gap-[12px] border-t border-line py-[10px] first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-[6px]">
                      <Badge tone={r.kind === 'trial' ? 'green' : 'yellow'}>{x.kind[r.kind]}</Badge>
                      {href ? (
                        <Link href={href as Route} className="text-[13.5px] font-bold text-link">
                          {r.company ?? r.person ?? '—'}
                        </Link>
                      ) : (
                        <span className="text-[13.5px] font-bold">{r.company ?? r.person ?? '—'}</span>
                      )}
                    </span>
                    <span className="mt-[2px] block text-[12px] text-mut">
                      {[r.company ? r.person : null, r.employees !== null ? x.employees.replace('{n}', String(r.employees)) : null, r.stage ? stageName.get(r.stage) ?? r.stage : null, when(r.created_at)]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                  <LeadClock created={r.created_at} answered={r.answered_at} sla={data.sla_minutes} m={m} />
                  {href && !r.answered_at ? (
                    <Link href={href as Route} className="rounded-ctl border border-ink bg-sf px-[12px] py-[6px] text-[12.5px] font-bold text-ink no-underline hover:text-ink">
                      {x.respond}
                    </Link>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="m-0 text-[13px] text-mut">{filter === 'awaiting' ? x.zero : x.none}</p>
        )}
      </Card>
      <p className="mb-0 mt-[10px] max-w-[80ch] text-[12px] leading-[1.55] text-mut">{x.how}</p>

      {canWrite ? (
        <Card title={x.slaTitle} className="mt-[16px]">
          <p className="mb-[10px] mt-0 max-w-[80ch] text-[12.5px] leading-[1.55] text-mut">{x.slaLead}</p>
          <SlaForm minutes={data.sla_minutes} m={m} common={{ saving: t('common.saving'), done: t('common.done') }} />
        </Card>
      ) : null}
    </>
  )
}
