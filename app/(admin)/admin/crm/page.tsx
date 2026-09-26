import { getTranslations } from 'next-intl/server'
import type { CrmMessages } from '@/components/admin/CrmForms'
import { CrmTabs, STAGE_TONE } from '@/components/admin/CrmTabs'
import { ALink, Badge, Card, day, PageHead, Problem, Stat, Table, Td } from '@/components/admin/ui'
import { isError } from '@/lib/admin/api'
import { crmOverview, crmTasks, STAGES } from '@/lib/admin/crm'

/**
 * The CRM's front page (D-103): how mail has done over 90 days, how the lists are growing,
 * where the pipeline stands, and the tasks that are due. Rates are over mail sent; an open
 * rate is a lower bound (pixels are blocked, Apple's proxy opens are not counted).
 */
const rate = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v.toLocaleString('en-GB')} %`)

export default async function CrmOverview() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const o = m.overview
  const [data, tasks] = await Promise.all([crmOverview(), crmTasks()])
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const today = new Date().toISOString().slice(0, 10)
  const due = isError(tasks) ? [] : tasks.rows.filter((r) => !r.due_at || r.due_at <= today)

  return (
    <>
      <PageHead title={o.title} lead={o.lead} />
      <CrmTabs current="overview" labels={m.tabs} />

      <Card title={o.mail}>
        <div className="grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
          <Stat label={o.sent} value={data.mail.sent} hint={`${data.mail.campaigns} ${m.tabs.campaigns.toLowerCase()}`} />
          <Stat label={o.openRate} value={rate(data.mail.open_rate)} />
          <Stat label={o.clickRate} value={rate(data.mail.click_rate)} />
          <Stat label={o.ctor} value={rate(data.mail.ctor)} />
          <Stat label={o.unsubRate} value={rate(data.mail.unsubscribe_rate)} />
          <Stat label={o.bounceRate} value={rate(data.mail.bounce_rate)} />
        </div>
        <p className="mb-0 mt-[10px] text-[12px] text-mut">{o.rateNote}</p>
      </Card>

      <div className="mt-[16px] grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        <Stat
          label={o.subscribers}
          value={data.subscribers.total}
          hint={`${o.joined.replace('{count}', String(data.subscribers.joined_30d))} · ${o.left.replace('{count}', String(data.subscribers.left_30d))}`}
        />
        <Stat label={o.won} value={data.won_90d} />
        <Stat label={o.trials} value={data.trials_90d} />
        <Stat label={o.fromEmail} value={data.signups_from_email} />
        <Stat label={o.tasks} value={data.tasks_due} />
      </div>

      <div className="mt-[16px] grid items-start gap-[14px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        <Card title={o.pipeline}>
          <ul className="m-0 flex list-none flex-col gap-[6px] p-0">
            {STAGES.map((s) => (
              <li key={s} className="flex items-center justify-between gap-[10px] text-[13.5px]">
                <ALink href={`/admin/crm/prospects?stage=${s}`}>
                  <Badge tone={STAGE_TONE[s]}>{m.stage[s]}</Badge>
                </ALink>
                <span className="font-semibold">{data.pipeline[s] ?? 0}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={o.tasks}>
          <Table head={[o.due, o.company, o.task, o.owner]} empty={due.length ? undefined : o.noTasks}>
            {due.map((r) => (
              <tr key={r.id}>
                <Td>{r.due_at ? day(r.due_at) : '—'}</Td>
                <Td>
                  <ALink href={`/admin/crm/prospects/${r.company_id}`}>{r.company}</ALink>
                </Td>
                <Td wrap>{r.body}</Td>
                <Td>{r.admin_email ?? '—'}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  )
}
