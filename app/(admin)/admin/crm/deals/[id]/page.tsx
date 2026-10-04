import type { Route } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { DealForm } from '@/components/admin/CrmDealForms'
import type { CrmMessages } from '@/components/admin/CrmForms'
import { stageTone } from '@/components/admin/CrmTabs'
import { Badge, Card, PageHead, Problem } from '@/components/admin/ui'
import { isError } from '@/lib/admin/api'
import { crmCompanies, crmDeal, may } from '@/lib/admin/crm'
import { dealValue } from '@/lib/admin/pipeline'

/**
 * One deal (0203, D-227; WP-1.1): what it is worth and where it stands, changed in place, and every stage it entered
 * with the days it stayed. The full deal page (participants, followers, the progress bar) is WP-1.3's.
 */
const osloDay = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', day: 'numeric', month: 'short', year: 'numeric' })

export default async function CrmDealPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const x = m.deals
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const [data, companies] = await Promise.all([crmDeal(id), crmCompanies(null, null)])
  if (isError(data)) {
    if (data.error === 'not_found') notFound()
    return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  }
  const d = data.deal
  const name = (key: string | null) => (key ? (data.stages.find((s) => s.key === key)?.name ?? key) : '')
  const stage = data.stages.find((s) => s.key === d.stage)
  const common = { saving: t('common.saving'), done: t('common.done') }
  const fact = 'm-0 text-[13px] leading-[1.7]'

  return (
    <>
      <p className="mb-[8px] mt-0 text-[12.5px]">
        <Link href={`/admin/crm/deals?pipeline=${d.pipeline}` as Route}>← {x.detail.back}</Link>
      </p>
      <PageHead title={d.title} lead={[d.company, dealValue(d.value, d.currency)].filter(Boolean).join(' · ')}>
        <Badge tone={stageTone(stage)}>{name(d.stage)}</Badge>
      </PageHead>

      <Card title={x.detail.facts}>
        <p className={fact}>
          <strong>{x.detail.status[d.status]}</strong>
          {d.closed_at ? ` · ${osloDay.format(new Date(d.closed_at))}` : ''}
        </p>
        {d.company_id && d.company ? (
          <p className={fact}>
            {x.col.company}: <Link href={`/admin/crm/prospects/${d.company_id}` as Route}>{d.company}</Link>
          </p>
        ) : null}
        {d.owner ? <p className={fact}>{x.col.owner}: {d.owner}</p> : null}
        {d.expected_close ? <p className={fact}>{x.col.close}: {osloDay.format(new Date(d.expected_close))}</p> : null}
        {d.probability !== null ? (
          <p className={fact}>{x.form.probability}: {d.probability}</p>
        ) : d.stage_probability !== null ? (
          <p className={fact}>{x.detail.stageProbability.replace('{n}', String(d.stage_probability))}</p>
        ) : null}
        {d.lost_text ? <p className={fact}>{x.form.lostText}: {d.lost_text}</p> : null}
        {d.primary ? <p className="mb-0 mt-[6px] text-[12px] text-mut">{x.primary}</p> : null}
      </Card>

      {may(data.may, 'edit') ? (
        <Card title={x.detail.edit} className="mt-[16px]">
          <DealForm
            deal={d}
            pipeline={d.pipeline}
            stages={data.stages.filter((s) => s.key === d.stage || !s.managed).map((s) => ({ value: s.key, label: s.name }))}
            companies={isError(companies) ? [] : companies.rows.map((c) => ({ value: c.id, label: c.name }))}
            m={m}
            common={common}
          />
        </Card>
      ) : null}

      <Card title={x.detail.history} className="mt-[16px]">
        <p className="mb-[10px] mt-0 text-[12.5px] text-mut">{x.detail.historyLead}</p>
        {data.history.length ? (
          <ol className="m-0 list-none p-0">
            {data.history.map((h, i) => (
              <li key={`${h.at}-${i}`} className="flex flex-wrap gap-x-[12px] border-t border-line py-[8px] text-[13px] first:border-t-0">
                <span className="font-semibold">
                  {h.from ? x.detail.moved.replace('{from}', name(h.from)).replace('{to}', name(h.to)) : x.detail.entered.replace('{stage}', name(h.to))}
                </span>
                <span className="text-mut">{osloDay.format(new Date(h.at))}</span>
                <span className="text-mut">{x.detail.days.replace('{n}', String(h.days))}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="m-0 text-[13px] text-mut">{x.detail.none}</p>
        )}
      </Card>
    </>
  )
}
