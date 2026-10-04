'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Outcome, useKeptAction } from '@/components/admin/ActionForms'
import type { CrmMessages } from '@/components/admin/CrmForms'
import { Button } from '@/components/ui/Button'
import type { Deal, Pipeline, Stage } from '@/lib/admin/crm'
import { deleteStage, saveDealRecord, savePipeline } from '@/lib/admin/crmActions'

/**
 * Pipelines and deals (0203, D-227): a pipeline added or changed, a stage removed with its deals moved, and a deal
 * added or changed. Fields are controlled, as in the other CRM forms, so a refused submission keeps what was typed.
 */
type Common = { saving: string; done: string }

const field = 'box-border w-full rounded-ctl border border-line bg-bg px-[12px] text-[13.5px] text-ink outline-none'
const input = `${field} h-[38px]`
const label = 'mb-[5px] block text-[12px] font-semibold'

/** Add a pipeline (no pipeline), or rename, reorder or archive one. */
export function PipelineForm({ pipeline, m, common }: { pipeline?: Pipeline; m: CrmMessages; common: Common }) {
  const x = m.stagesX.pipelines
  const [key, setKey] = useState(pipeline?.key ?? '')
  const [name, setName] = useState(pipeline?.name ?? '')
  const [sort, setSort] = useState(String(pipeline?.sort ?? ''))
  const [archived, setArchived] = useState(pipeline?.archived ?? false)
  const [state, action, pending] = useKeptAction(savePipeline, () => (pipeline ? undefined : (setKey(''), setName(''), setSort(''))))
  return (
    <form action={action} className="flex flex-wrap items-end gap-[8px]">
      {pipeline ? (
        <input type="hidden" name="id" value={pipeline.id} />
      ) : (
        <label className="block">
          <span className={label}>{m.stagesX.key}</span>
          <input name="key" required pattern="[a-z][a-z0-9_]{1,39}" value={key} onChange={(e) => setKey(e.target.value)} className={`${input} w-[150px] font-mono text-[12.5px]`} />
        </label>
      )}
      <label className="block">
        <span className={label}>{m.stagesX.name}</span>
        <input name="name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={`${input} w-[180px]`} />
      </label>
      <label className="block">
        <span className={label}>{m.stagesX.sort}</span>
        <input name="sort" type="number" min={0} max={9999} value={sort} onChange={(e) => setSort(e.target.value)} className={`${input} w-[110px]`} />
      </label>
      {pipeline ? (
        <label className="flex h-[38px] items-center gap-[6px] text-[12.5px] font-semibold">
          <input type="checkbox" name="archived" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          {x.archive}
        </label>
      ) : null}
      <Button type="submit" size="sm" tone={pipeline ? 'quiet' : undefined} disabled={pending}>
        {pending ? common.saving : pipeline ? x.save : x.create}
      </Button>
      <Outcome state={state} problems={{ ...m.problem, ...m.stagesX.problem, ...m.stagesX.problem2 }} done={common.done} />
    </form>
  )
}

/** Remove a stage: its deals go to another stage of its pipeline first. */
export function StageDeleteForm({ stage, stages, m, common }: { stage: Stage; stages: Stage[]; m: CrmMessages; common: Common }) {
  const x = m.stagesX.delete
  const targets = stages.filter((s) => s.key !== stage.key && s.pipeline === stage.pipeline && !s.managed && !s.archived)
  const [to, setTo] = useState('')
  const [state, action, pending] = useKeptAction(deleteStage, () => undefined)
  return (
    <form action={action} className="flex flex-wrap items-end gap-[8px]">
      <input type="hidden" name="key" value={stage.key} />
      <label className="block">
        <span className={label}>{x.to}</span>
        <select name="to" value={to} onChange={(e) => setTo(e.target.value)} className={`${input} w-auto`}>
          <option value="">{x.none}</option>
          {targets.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" tone="quiet" disabled={pending}>
        {pending ? common.saving : x.submit}
      </Button>
      <Outcome state={state} problems={{ ...m.problem, ...m.stagesX.problem, ...m.stagesX.problem2 }} done={common.done} />
    </form>
  )
}

type Option = { value: string; label: string }

/**
 * Add a deal (no deal) or change one. A new deal names its pipeline (a hidden field) and may name a company and a
 * stage; an existing deal shows its own pipeline's stages. A company's own deal keeps its company.
 */
export function DealForm({
  deal,
  pipeline,
  stages,
  companies,
  m,
  common,
}: {
  deal?: Deal
  pipeline: string
  stages: Option[]
  companies?: Option[]
  m: CrmMessages
  common: Common
}) {
  const x = m.deals.form
  const router = useRouter()
  const [title, setTitle] = useState(deal?.title ?? '')
  const [company, setCompany] = useState(deal?.company_id ?? '')
  const [stage, setStage] = useState(deal?.stage ?? '')
  const [value, setValue] = useState(deal?.value === null || deal?.value === undefined ? '' : String(deal.value))
  const [currency, setCurrency] = useState(deal?.currency ?? 'NOK')
  const [close, setClose] = useState(deal?.expected_close ?? '')
  const [probability, setProbability] = useState(deal?.probability === null || deal?.probability === undefined ? '' : String(deal.probability))
  const [lost, setLost] = useState(deal?.lost_text ?? '')
  const [state, action, pending] = useKeptAction(saveDealRecord, () => {
    if (deal) return router.refresh()
    setTitle('')
    setCompany('')
    setStage('')
    setValue('')
    setClose('')
    setProbability('')
  })
  return (
    <form action={action} className="flex flex-wrap items-end gap-[8px]">
      {deal ? <input type="hidden" name="id" value={deal.id} /> : <input type="hidden" name="pipeline" value={pipeline} />}
      <label className="block min-w-[220px] flex-1">
        <span className={label}>{x.title}</span>
        <input name="title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
      </label>
      {companies && !deal?.primary ? (
        <label className="block">
          <span className={label}>{x.company}</span>
          <select name="company_id" value={company} onChange={(e) => setCompany(e.target.value)} className={`${input} w-auto max-w-[260px]`}>
            <option value="">{x.noCompany}</option>
            {companies.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="block">
        <span className={label}>{x.stage}</span>
        <select name="stage" value={stage} onChange={(e) => setStage(e.target.value)} className={`${input} w-auto`}>
          {deal ? null : <option value="">{x.firstStage}</option>}
          {stages.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={label}>{x.value}</span>
        <input name="value" inputMode="decimal" pattern="[0-9]{1,10}([.,][0-9]{1,2})?" value={value} onChange={(e) => setValue(e.target.value)} className={`${input} w-[130px]`} />
      </label>
      <label className="block">
        <span className={label}>{x.currency}</span>
        <input name="currency" required pattern="[A-Za-z]{3}" maxLength={3} value={currency} readOnly={deal?.primary} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className={`${input} w-[80px] font-mono`} />
      </label>
      <label className="block">
        <span className={label}>{x.close}</span>
        <input name="expected_close" type="date" value={close} onChange={(e) => setClose(e.target.value)} className={`${input} w-auto`} />
      </label>
      <label className="block">
        <span className={label}>{x.probability}</span>
        <input name="probability" type="number" min={0} max={100} value={probability} placeholder={x.probabilityHint} onChange={(e) => setProbability(e.target.value)} className={`${input} w-[180px]`} />
      </label>
      {deal && (deal.status === 'lost' || deal.lost_text) ? (
        <label className="block min-w-[220px] flex-1">
          <span className={label}>{x.lostText}</span>
          <input name="lost_text" maxLength={300} value={lost} onChange={(e) => setLost(e.target.value)} className={input} />
        </label>
      ) : null}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? common.saving : deal ? x.save : x.create}
      </Button>
      <Outcome state={state} problems={{ ...m.problem, ...m.deals.problem }} done={common.done} />
    </form>
  )
}
