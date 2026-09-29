import { getTranslations } from 'next-intl/server'
import type { CrmMessages } from '@/components/admin/CrmForms'
import { DailyCapForm, ReplyStageForm, SenderForm, StageForm } from '@/components/admin/CrmStageForms'
import { CrmTabs, stageTone } from '@/components/admin/CrmTabs'
import { Badge, Card, PageHead, Problem, Table, Td } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { crmSenders, crmSending, crmStages } from '@/lib/admin/crm'

/**
 * The pipeline (0093, D-142): its stages in order, where a logged answer moves a company, and
 * the people campaigns are sent as. The plan's two stages (trial, customer) follow the
 * organisation's subscription and are never set by hand or by a campaign.
 */
export default async function CrmStages() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const x = m.stagesX
  const [data, senders, who, sending] = await Promise.all([crmStages(), crmSenders(), whoami(), crmSending()])
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const common = { saving: t('common.saving'), done: t('common.done') }
  const people = isError(senders) ? [] : senders.rows

  return (
    <>
      <PageHead title={x.title} lead={x.lead} />
      <CrmTabs current="stages" labels={m.tabs} />

      <Card title={x.title}>
        <Table head={[x.col.stage, x.col.kind, x.col.order, x.col.companies, x.col.campaigns]}>
          {data.rows.map((s) => (
            <tr key={s.key}>
              <Td wrap>
                <Badge tone={stageTone(s)}>{s.name}</Badge>
                <span className="mt-[3px] block font-mono text-[11.5px] text-mut">{s.key}</span>
                {s.managed ? <span className="block text-[12px] text-mut">{x.managed}</span> : null}
                {s.archived ? <span className="block text-[12px] text-mut">{x.archived}</span> : null}
                {canWrite ? (
                  <details className="mt-[6px]">
                    <summary className="cursor-pointer text-[12px] font-semibold text-link">{x.edit}</summary>
                    <div className="mt-[8px]">
                      <StageForm stage={s} m={m} common={common} />
                    </div>
                  </details>
                ) : null}
              </Td>
              <Td>{x.kind[s.kind]}</Td>
              <Td>{s.sort}</Td>
              <Td>{s.companies}</Td>
              <Td>{s.campaigns}</Td>
            </tr>
          ))}
        </Table>
        {canWrite ? (
          <div className="mt-[16px] border-t border-line pt-[14px]">
            <p className="mb-[8px] mt-0 text-[13px] font-semibold">{x.add}</p>
            <StageForm m={m} common={common} />
            <p className="mb-0 mt-[8px] text-[12px] text-mut">{x.inUse}</p>
          </div>
        ) : null}
      </Card>

      <Card title={x.reply.title} className="mt-[16px]">
        <p className="mb-[12px] mt-0 max-w-[80ch] text-[13px] leading-[1.55] text-body">{x.reply.lead}</p>
        {canWrite ? (
          <ReplyStageForm value={data.reply_stage} stages={data.rows} m={m} common={common} />
        ) : (
          <p className="m-0 text-[13px] font-semibold">{data.rows.find((s) => s.key === data.reply_stage)?.name ?? data.reply_stage}</p>
        )}
      </Card>

      {isError(sending) ? null : (
        <Card title={m.sending.title} className="mt-[16px]">
          <p className="mb-[10px] mt-0 max-w-[80ch] text-[12.5px] leading-[1.55] text-mut">{m.sending.lead}</p>
          <ul className="mb-[12px] mt-0 list-disc pl-[18px] text-[13px] leading-[1.7]">
            <li>{m.sending.sentToday.replace('{n}', String(sending.sent_today))}</li>
            <li>{sending.business_hours ? m.sending.hours : m.sending.outside}</li>
          </ul>
          {canWrite ? <DailyCapForm cap={sending.daily_cap} m={m} common={common} /> : <p className="m-0 text-[13px]">{m.sending.cap}: {sending.daily_cap ?? m.sending.capNone}</p>}
        </Card>
      )}

      <Card title={x.senders.title} className="mt-[16px]">
        <p className="mb-[12px] mt-0 max-w-[80ch] text-[13px] leading-[1.55] text-body">{x.senders.lead}</p>
        <Table head={[x.senders.col.name, x.senders.col.email, x.senders.col.replyTo, x.senders.col.campaigns]} empty={people.length ? undefined : x.senders.none}>
          {people.map((p) => (
            <tr key={p.id}>
              <Td wrap>
                {p.name}
                {p.archived ? <span className="block text-[12px] text-mut">{x.archived}</span> : null}
                {canWrite ? (
                  <details className="mt-[6px]">
                    <summary className="cursor-pointer text-[12px] font-semibold text-link">{x.edit}</summary>
                    <div className="mt-[8px]">
                      <SenderForm sender={p} m={m} common={common} />
                    </div>
                  </details>
                ) : null}
              </Td>
              <Td>{p.email}</Td>
              <Td>{p.reply_to}</Td>
              <Td>{p.campaigns}</Td>
            </tr>
          ))}
        </Table>
        {canWrite ? (
          <div className="mt-[16px] border-t border-line pt-[14px]">
            <p className="mb-[8px] mt-0 text-[13px] font-semibold">{x.senders.add}</p>
            <SenderForm m={m} common={common} />
          </div>
        ) : null}
      </Card>
    </>
  )
}
