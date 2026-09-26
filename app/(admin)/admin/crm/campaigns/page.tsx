import { getTranslations } from 'next-intl/server'
import { NewCampaignForm, type CrmMessages } from '@/components/admin/CrmForms'
import { CrmTabs, STATUS_TONE } from '@/components/admin/CrmTabs'
import { ALink, Badge, Card, PageHead, pct, Problem, Table, Td, when } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { crmCampaigns } from '@/lib/admin/crm'

/** Campaigns and newsletters (D-101), newest first, each with its delivery and response. */
export default async function CrmCampaigns() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const [data, who] = await Promise.all([crmCampaigns(), whoami()])
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const common = { reason: t('common.reason'), reasonHint: t('common.reasonHint'), saving: t('common.saving'), done: t('common.done') }
  const c = m.campaigns.col

  return (
    <>
      <PageHead title={m.campaigns.title} lead={m.campaigns.lead} />
      <CrmTabs current="campaigns" labels={m.tabs} />
      {canWrite ? (
        <Card title={m.campaigns.new} className="mb-[16px]">
          <NewCampaignForm m={m} common={common} />
        </Card>
      ) : null}
      <Card>
        <Table
          head={[c.number, c.name, c.kind, c.status, c.segment, c.when, c.audience, c.delivered, c.opened, c.clicked, c.unsubscribed]}
          empty={data.rows.length ? undefined : t('common.none')}
        >
          {data.rows.map((r) => (
            <tr key={r.id}>
              <Td>{r.number}</Td>
              <Td>
                <ALink href={`/admin/crm/campaigns/${r.id}`}>{r.name}</ALink>
                {r.subject ? <span className="block max-w-[34ch] truncate text-[12px] text-mut">{r.subject}</span> : null}
              </Td>
              <Td>{m.campaigns.kind[r.kind]}</Td>
              <Td>
                <Badge tone={STATUS_TONE[r.status]}>{m.campaigns.status[r.status]}</Badge>
              </Td>
              <Td>{r.segment ?? '—'}</Td>
              <Td>{when(r.finished_at ?? r.scheduled_at)}</Td>
              <Td>{r.audience ?? '—'}</Td>
              <Td>{r.stats.delivered}</Td>
              <Td>{pct(r.stats.opened, r.stats.sent)}</Td>
              <Td>{pct(r.stats.clicked, r.stats.sent)}</Td>
              <Td>{r.stats.unsubscribed}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  )
}
