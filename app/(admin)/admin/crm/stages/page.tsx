import { getTranslations } from 'next-intl/server'
import { PipelineForm, StageDeleteForm } from '@/components/admin/CrmDealForms'
import type { CrmMessages } from '@/components/admin/CrmForms'
import { DailyCapForm, ReplyStageForm, SenderForm, StageForm } from '@/components/admin/CrmStageForms'
import { stageTone } from '@/components/admin/CrmTabs'
import { Badge, Card, PageHead, Problem, Table, Td } from '@/components/admin/ui'
import { isError } from '@/lib/admin/api'
import { crmSenders, crmSending, crmStages } from '@/lib/admin/crm'

/**
 * The pipeline (0093, D-142): its stages in order, where a logged answer moves a company, and
 * the people campaigns are sent as. The plan's two stages (trial, customer) follow the
 * organisation's subscription and are never set by hand or by a campaign. 0203 (D-227): the
 * pipelines, each stage's pipeline, chance of winning and rot days, and a stage removed with its
 * deals moved first.
 */
export default async function CrmStages() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const x = m.stagesX
  const [data, senders, sending] = await Promise.all([crmStages(), crmSenders(), crmSending()])
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  // stages, senders, the daily cap and the reply stage are the CRM's settings: offered when the permission set holds them (DEC-31)
  const canWrite = !isError(senders) && senders.may_settings
  const common = { saving: t('common.saving'), done: t('common.done') }
  const people = isError(senders) ? [] : senders.rows
  const pipelines = data.pipelines
  const pipelineName = (id: string | null) => pipelines.find((p) => p.id === id)?.name ?? ''
  const pc = x.pipelines.col

  return (
    <>
      <PageHead title={x.title} lead={x.lead} />

      <Card title={x.pipelines.title}>
        <p className="mb-[12px] mt-0 max-w-[80ch] text-[13px] leading-[1.55] text-body">{x.pipelines.lead}</p>
        <Table head={[pc.name, pc.key, pc.order, pc.deals]}>
          {pipelines.map((p) => (
            <tr key={p.id}>
              <Td wrap>
                {p.name}
                {p.archived ? <span className="block text-[12px] text-mut">{x.pipelines.archived}</span> : null}
                {canWrite ? (
                  <details className="mt-[6px]">
                    <summary className="cursor-pointer text-[12px] font-semibold text-link">{x.edit}</summary>
                    <div className="mt-[8px]">
                      <PipelineForm pipeline={p} m={m} common={common} />
                    </div>
                  </details>
                ) : null}
              </Td>
              <Td>
                <span className="font-mono text-[12px]">{p.key}</span>
              </Td>
              <Td>{p.sort}</Td>
              <Td>{p.deals}</Td>
            </tr>
          ))}
        </Table>
        {canWrite ? (
          <div className="mt-[16px] border-t border-line pt-[14px]">
            <p className="mb-[8px] mt-0 text-[13px] font-semibold">{x.pipelines.add}</p>
            <PipelineForm m={m} common={common} />
            <p className="mb-0 mt-[8px] text-[12px] text-mut">{x.pipelines.inUse}</p>
          </div>
        ) : null}
      </Card>

      <Card title={x.title} className="mt-[16px]">
        <Table head={[x.col.stage, x.pipelineLabel, x.col.kind, x.col.order, x.probability, x.rotDays, x.col_deals, x.col.companies, x.col.campaigns]}>
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
                    {s.managed ? null : (
                      <div className="mt-[12px] border-t border-line pt-[10px]">
                        <p className="mb-[4px] mt-0 text-[12.5px] font-semibold">{x.delete.title}</p>
                        <p className="mb-[8px] mt-0 max-w-[70ch] text-[12px] text-mut">{x.delete.lead}</p>
                        <StageDeleteForm stage={s} stages={data.rows} m={m} common={common} />
                      </div>
                    )}
                  </details>
                ) : null}
              </Td>
              <Td>{pipelineName(s.pipeline)}</Td>
              <Td>{x.kind[s.kind]}</Td>
              <Td>{s.sort}</Td>
              <Td>{s.probability === null ? '' : `${s.probability} %`}</Td>
              <Td>{s.rot_days ?? ''}</Td>
              <Td>{s.deals}</Td>
              <Td>{s.companies}</Td>
              <Td>{s.campaigns}</Td>
            </tr>
          ))}
        </Table>
        {canWrite ? (
          <div className="mt-[16px] border-t border-line pt-[14px]">
            <p className="mb-[8px] mt-0 text-[13px] font-semibold">{x.add}</p>
            <StageForm pipelines={pipelines} m={m} common={common} />
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
