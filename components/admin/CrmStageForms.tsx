'use client'

import { useState } from 'react'
import { Outcome, useKeptAction } from '@/components/admin/ActionForms'
import type { CrmMessages } from '@/components/admin/CrmForms'
import { Button } from '@/components/ui/Button'
import type { Campaign, Sender, Stage } from '@/lib/admin/crm'
import { moveStage, resendCampaign, saveCampaignPipeline, saveDailyCap, saveReplyStage, saveSender, saveSla, saveStage } from '@/lib/admin/crmActions'

/**
 * The pipeline's forms (0093, D-142): moving companies between stages, the stages themselves,
 * where an answer moves a company, the people campaigns are sent as, and a campaign's place in
 * the pipeline. Fields are controlled, as in the other CRM forms, so a refused submission keeps
 * what was typed.
 */
type Common = { saving: string; done: string }

const field = 'box-border w-full rounded-ctl border border-line bg-bg px-[12px] text-[13.5px] text-ink outline-none'
const input = `${field} h-[38px]`
const label = 'mb-[5px] block text-[12px] font-semibold'
/** as lib/admin/crm's STAGE_KINDS, which is server-only */
const STAGE_KINDS = ['open', 'won', 'lost', 'parked'] as const

/** The stages a person may set: not the plan's, not archived */
export const settable = (stages: Stage[]) => stages.filter((s) => !s.managed && !s.archived)

/**
 * Move companies: those ticked in the table (checkboxes with form={id}), or one company (ids).
 * An empty choice moves each to the next open stage after its own.
 */
export function StageMoveForm({
  id,
  ids,
  stages,
  m,
  common,
  compact,
}: {
  id?: string
  ids?: string[]
  stages: Stage[]
  m: CrmMessages
  common: Common
  compact?: boolean
}) {
  const [to, setTo] = useState('')
  const [state, action, pending] = useKeptAction(moveStage, () => undefined)
  const b = m.prospects.bulk
  const [moved, skipped] = state?.ok && state.message ? state.message.split(':') : []
  return (
    <form id={id} action={action} className="flex flex-wrap items-end gap-[8px]">
      {ids?.map((x) => <input key={x} type="hidden" name="ids" value={x} />)}
      <label className="block">
        <span className={label}>{compact ? m.company.moveTo : b.label}</span>
        <select name="to" value={to} onChange={(e) => setTo(e.target.value)} className={`${input} w-auto`}>
          <option value="">{b.next}</option>
          {settable(stages).map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? common.saving : compact && !to ? m.company.nextStage : b.submit}
      </Button>
      {state?.ok && moved !== undefined ? (
        <span role="status" className="text-[12.5px] font-semibold text-link">
          {b.result.replace('{moved}', moved).replace('{skipped}', skipped ?? '0')}
        </span>
      ) : (
        <Outcome state={state} problems={m.problem} done={common.done} />
      )}
    </form>
  )
}

/** Add a stage (no stage), or change one: its name, place and kind; archive it. */
export function StageForm({ stage, m, common }: { stage?: Stage; m: CrmMessages; common: Common }) {
  const x = m.stagesX
  const [key, setKey] = useState(stage?.key ?? '')
  const [name, setName] = useState(stage?.name ?? '')
  const [sort, setSort] = useState(String(stage?.sort ?? ''))
  const [kind, setKind] = useState<string>(stage?.kind ?? 'open')
  const [archived, setArchived] = useState(stage?.archived ?? false)
  const [exit, setExit] = useState(stage?.exit_criterion ?? '')
  const [state, action, pending] = useKeptAction(saveStage, () => (stage ? undefined : (setKey(''), setName(''), setSort(''), setExit(''))))
  return (
    <form action={action} className="flex flex-wrap items-end gap-[8px]">
      {stage ? (
        <input type="hidden" name="key" value={stage.key} />
      ) : (
        <label className="block">
          <span className={label}>{x.key}</span>
          <input name="key" required pattern="[a-z][a-z0-9_]{1,39}" value={key} onChange={(e) => setKey(e.target.value)} className={`${input} w-[150px] font-mono text-[12.5px]`} />
        </label>
      )}
      <label className="block">
        <span className={label}>{x.name}</span>
        <input name="name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={`${input} w-[180px]`} />
      </label>
      <label className="block">
        <span className={label}>{x.sort}</span>
        <input name="sort" required type="number" min={0} max={9999} value={sort} onChange={(e) => setSort(e.target.value)} className={`${input} w-[110px]`} />
      </label>
      <label className="block">
        <span className={label}>{x.kindLabel}</span>
        <select name="kind" value={kind} disabled={stage?.managed} onChange={(e) => setKind(e.target.value)} className={`${input} w-auto`}>
          {STAGE_KINDS.map((k) => (
            <option key={k} value={k}>
              {x.kind[k]}
            </option>
          ))}
        </select>
        {stage?.managed ? <input type="hidden" name="kind" value={kind} /> : null}
      </label>
      <label className="block min-w-[220px] flex-1">
        <span className={label}>{x.exit}</span>
        <input name="exit_criterion" maxLength={200} value={exit} onChange={(e) => setExit(e.target.value)} placeholder={x.exitHint} className={input} />
      </label>
      {stage && !stage.managed ? (
        <label className="flex h-[38px] items-center gap-[6px] text-[12.5px] font-semibold">
          <input type="checkbox" name="archived" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          {x.archive}
        </label>
      ) : null}
      <Button type="submit" size="sm" tone={stage ? 'quiet' : undefined} disabled={pending}>
        {pending ? common.saving : stage ? x.save : x.create}
      </Button>
      <Outcome state={state} problems={{ ...m.problem, ...x.problem }} done={common.done} />
    </form>
  )
}

/** Where «Reply received» moves a company. */
export function ReplyStageForm({ value, stages, m, common }: { value: string; stages: Stage[]; m: CrmMessages; common: Common }) {
  const [stage, setStage] = useState(value)
  const [state, action, pending] = useKeptAction(saveReplyStage, () => undefined)
  return (
    <form action={action} className="flex flex-wrap items-end gap-[8px]">
      <label className="block">
        <span className={label}>{m.stagesX.reply.label}</span>
        <select name="stage" value={stage} onChange={(e) => setStage(e.target.value)} className={`${input} w-auto`}>
          {settable(stages).map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" tone="quiet" disabled={pending}>
        {pending ? common.saving : m.stagesX.reply.save}
      </Button>
      <Outcome state={state} problems={m.problem} done={common.done} />
    </form>
  )
}

/** A person to send as (no sender: a new one). */
export function SenderForm({ sender, m, common }: { sender?: Sender; m: CrmMessages; common: Common }) {
  const x = m.stagesX.senders
  const [name, setName] = useState(sender?.name ?? '')
  const [email, setEmail] = useState(sender?.email ?? '')
  const [replyTo, setReplyTo] = useState(sender?.reply_to ?? '')
  const [signature, setSignature] = useState(sender?.signature ?? '')
  const [archived, setArchived] = useState(sender?.archived ?? false)
  const [state, action, pending] = useKeptAction(saveSender, () =>
    sender ? undefined : (setName(''), setEmail(''), setReplyTo(''), setSignature('')),
  )
  return (
    <form action={action} className="flex flex-col gap-[8px]">
      {sender ? <input type="hidden" name="id" value={sender.id} /> : null}
      <div className="grid gap-[8px] [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        <label className="block">
          <span className={label}>{x.name}</span>
          <input name="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className={label}>{x.email}</span>
          <input name="email" type="email" required maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className={label}>{x.replyTo}</span>
          <input name="reply_to" type="email" required maxLength={200} value={replyTo} onChange={(e) => setReplyTo(e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className={label}>{x.signature}</span>
          <input name="signature" maxLength={200} value={signature} onChange={(e) => setSignature(e.target.value)} className={input} />
        </label>
      </div>
      <span className="flex flex-wrap items-center gap-[10px]">
        {sender ? (
          <label className="flex items-center gap-[6px] text-[12.5px] font-semibold">
            <input type="checkbox" name="archived" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
            {x.archive}
          </label>
        ) : null}
        <Button type="submit" size="sm" tone={sender ? 'quiet' : undefined} disabled={pending}>
          {pending ? common.saving : sender ? x.save : x.add}
        </Button>
        <Outcome state={state} problems={m.problem} done={common.done} />
      </span>
    </form>
  )
}

/** A draft campaign's place in the pipeline. */
export function CampaignPipelineForm({
  campaign,
  stages,
  senders,
  campaigns,
  m,
  common,
}: {
  campaign: Campaign
  stages: Stage[]
  senders: Sender[]
  campaigns: { id: string; name: string }[]
  m: CrmMessages
  common: Common
}) {
  const x = m.pipeline
  const [target, setTarget] = useState(campaign.stage_target ?? '')
  const [onSend, setOnSend] = useState(campaign.stage_on_send ?? '')
  const [sender, setSender] = useState(campaign.sender_id ?? '')
  const [follows, setFollows] = useState(campaign.follows_id ?? '')
  const [days, setDays] = useState(String(campaign.follow_days ?? '4'))
  const [when, setWhen] = useState<string>(campaign.follow_when)
  const [auto, setAuto] = useState(campaign.follow_auto)
  const [state, action, pending] = useKeptAction(saveCampaignPipeline, () => undefined)
  return (
    <form action={action} className="flex flex-col gap-[10px]">
      <input type="hidden" name="id" value={campaign.id} />
      <div className="grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
        <label className="block">
          <span className={label}>{x.target}</span>
          <select name="stage_target" value={target} onChange={(e) => setTarget(e.target.value)} className={input}>
            <option value="">{x.targetAny}</option>
            {stages.filter((s) => !s.archived).map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>{x.onSend}</span>
          <select name="stage_on_send" value={onSend} onChange={(e) => setOnSend(e.target.value)} className={input}>
            <option value="">{x.onSendNone}</option>
            {settable(stages).map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>{x.sender}</span>
          <select name="sender_id" value={sender} onChange={(e) => setSender(e.target.value)} className={input}>
            <option value="">{x.senderDefault}</option>
            {senders.filter((s) => !s.archived).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.email}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>{x.follows}</span>
          <select name="follows_id" value={follows} onChange={(e) => setFollows(e.target.value)} className={input}>
            <option value="">{x.followsNone}</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {follows ? (
          <label className="block">
            <span className={label}>{x.followDays}</span>
            <input name="follow_days" type="number" min={1} max={60} required value={days} onChange={(e) => setDays(e.target.value)} className={input} />
          </label>
        ) : null}
      </div>
      {follows ? (
        <>
          <div className="grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
            <label className="block">
              <span className={label}>{x.followWhen}</span>
              <select name="follow_when" value={when} onChange={(e) => setWhen(e.target.value)} className={input}>
                {(['no_reply', 'no_click', 'no_open'] as const).map((w) => (
                  <option key={w} value={w}>
                    {x.when[w]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-start gap-[8px] self-end pb-[8px] text-[13px] leading-[1.45]">
              <input type="checkbox" name="follow_auto" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="mt-[3px] h-[16px] w-[16px] accent-ink" />
              <span>
                <span className="font-semibold">{x.auto}</span>
                <span className="block text-[12px] text-mut">{x.autoHint}</span>
              </span>
            </label>
          </div>
          {when === 'no_open' ? <p className="m-0 max-w-[70ch] text-[12px] font-semibold leading-[1.5] text-cautiondeep">{x.openWarning}</p> : null}
          <p className="m-0 max-w-[70ch] text-[12px] leading-[1.5] text-mut">{x.followHint}</p>
          <p className="m-0 max-w-[70ch] text-[12px] leading-[1.5] text-mut">{x.exits}</p>
        </>
      ) : null}
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? common.saving : x.save}
        </Button>
        <Outcome state={state} problems={m.problem} done={common.done} />
      </span>
    </form>
  )
}

/** «Resend after N days» (0111): a draft follow-up of this mail, to those who did not click, sending itself */
export function ResendForm({ id, m }: { id: string; m: CrmMessages }) {
  const q = m.sequence
  const [days, setDays] = useState('7')
  const [state, action, pending] = useKeptAction(resendCampaign, () => undefined)
  return (
    <form action={action} className="flex flex-col gap-[6px]">
      <input type="hidden" name="id" value={id} />
      <span className="flex flex-wrap items-end gap-[8px]">
        <Button type="submit" size="sm" tone="secondary" disabled={pending}>
          {q.resend}
        </Button>
        <label className="flex items-center gap-[6px] text-[13px]">
          <input
            name="days"
            type="number"
            min={1}
            max={60}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            aria-label={`${q.resend} (${q.days})`}
            className="box-border h-[34px] w-[64px] rounded-ctl border border-line bg-bg px-[8px] text-[13px]"
          />
          {q.days}
        </label>
        <Outcome state={state} problems={m.problem} done="" />
      </span>
      <span className="text-[12px] leading-[1.5] text-mut">{q.resendHint}</span>
    </form>
  )
}

/** The day's cap on campaign mail (0111) */
export function DailyCapForm({ cap, m, common }: { cap: number | null; m: CrmMessages; common: { saving: string; done: string } }) {
  const x = m.sending
  const [value, setValue] = useState(cap === null ? '' : String(cap))
  const [state, action, pending] = useKeptAction(saveDailyCap, () => undefined)
  return (
    <form action={action} className="flex flex-wrap items-end gap-[10px]">
      <label className="block">
        <span className={label}>{x.cap}</span>
        <input name="cap" type="number" min={1} max={5000} placeholder={x.capNone} value={value} onChange={(e) => setValue(e.target.value)} className={`${input} w-[160px]`} />
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? common.saving : x.save}
      </Button>
      <Outcome state={state} problems={m.problem} done={common.done} />
    </form>
  )
}

/** The first-response target for an inbound lead (0112) */
export function SlaForm({ minutes, m, common }: { minutes: number; m: CrmMessages; common: { saving: string; done: string } }) {
  const x = m.inbox
  const [value, setValue] = useState(String(minutes))
  const [state, action, pending] = useKeptAction(saveSla, () => undefined)
  return (
    <form action={action} className="flex flex-wrap items-end gap-[10px]">
      <label className="block">
        <span className={label}>{x.sla}</span>
        <input name="minutes" type="number" min={1} max={1440} required value={value} onChange={(e) => setValue(e.target.value)} className={`${input} w-[120px]`} />
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? common.saving : x.slaSave}
      </Button>
      <Outcome state={state} problems={m.problem} done={common.done} />
    </form>
  )
}
