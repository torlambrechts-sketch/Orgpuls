'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { startTransition, useActionState, useEffect, useState } from 'react'
import type { CrmMessages } from '@/components/admin/CrmForms'
import type { Company, Stage } from '@/lib/admin/crm'
import { moveCard, saveCompany, saveDeal } from '@/lib/admin/crmActions'
import type { AdminResult } from '@/lib/admin/actions'
import { kr } from '@/lib/admin/format'
import { shownSum, totals, unvalued } from '@/lib/admin/pipeline'
import { Modal } from './Modal'
import { Avatar, Badge, BTN, FIELD, FIELD_LABEL } from './ui'

const DAY = 86_400_000
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''))

/**
 * A lead's first-response clock (0112): minutes and seconds since it came while it waits, green
 * inside the target and red past it; once answered, how long that took.
 */
export function LeadClock({ created, answered, sla, m }: { created: string; answered: string | null; sla: number; m: CrmMessages }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    if (answered) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [answered])
  const start = Date.parse(created)
  const end = answered ? Date.parse(answered) : now
  if (end === null) return <span className="font-mono text-[12.5px] text-mut">…</span>
  const mins = Math.max(0, (end - start) / 60_000)
  const over = mins > sla
  const text =
    mins < 60 ? `${Math.floor(mins)}:${String(Math.floor((mins % 1) * 60)).padStart(2, '0')}`
    : mins < 1440 ? `${Math.floor(mins / 60)} h ${Math.round(mins % 60)} m`
    : `${Math.floor(mins / 1440)} d ${Math.floor((mins % 1440) / 60)} h`
  return (
    <span className="flex flex-col items-end">
      <span className={`font-mono text-[14px] font-semibold tabular-nums ${over ? 'text-danger' : 'text-link'}`}>{text}</span>
      <span className="text-[11px] text-mut">{answered ? m.inbox.answeredIn : over ? fill(m.inbox.past, { sla }) : fill(m.inbox.within, { sla })}</span>
    </span>
  )
}

/**
 * The design draws five columns at 210 px or more; stages are data, so with more of them each may
 * narrow to 180 px before the board scrolls sideways inside the 1320 px column.
 */
const grid = (n: number) => {
  const min = n > 5 ? 180 : 210
  return { gridTemplateColumns: `repeat(${Math.max(1, n)}, minmax(${min}px, 1fr))`, minWidth: n * min + (n - 1) * 14 }
}

/** The design's chart palette, one per stage in order (`D.viz`) */
const VIZ = ['bg-viz1', 'bg-viz2', 'bg-viz3', 'bg-viz4', 'bg-viz5'] as const
type Owner = { id: string; email: string }

/**
 * The pipeline (X-095, the design's `isPipeline`; 0112 before it): a column per stage people work
 * in, each with its count and value, and the deals in it — company, contact, value, owner, days in
 * the stage and the next step. Drag a card to another column; open it to change its stage, value,
 * next step or owner, which is the keyboard's way to move it too. The plan's stages and a company
 * that follows its organisation's plan are not moved by hand; the database refuses it too. The list
 * shows the same deals as rows, the largest first.
 */
export function PipelineBoard({
  stages,
  companies,
  owners,
  view,
  m,
  canWrite,
}: {
  stages: Stage[]
  companies: Company[]
  owners: Owner[]
  view: 'board' | 'list'
  m: CrmMessages
  canWrite: boolean
}) {
  const b = m.board
  const [rows, setRows] = useState(companies)
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [open, setOpen] = useState<Company | null>(null)
  useEffect(() => setRows(companies), [companies])
  const columns = stages.filter((s) => !s.archived && (s.kind === 'open' || s.kind === 'won')).sort((a, c) => a.sort - c.sort)
  const rest = stages.filter((s) => !s.archived && s.kind !== 'open' && s.kind !== 'won')
  const [now] = useState(() => Date.now())
  const days = (c: Company) => Math.floor((now - Date.parse(c.stage_changed_at)) / DAY)
  const stageOf = (key: string) => stages.find((s) => s.key === key)
  const footer = (c: Company) => {
    const s = stageOf(c.stage)
    const first = s?.kind === 'won' ? b.closed : fill(b.days, { n: days(c) })
    return c.next_step ? `${first} · ${c.next_step}` : first
  }

  const move = (id: string, to: Stage) => {
    const c = rows.find((r) => r.id === id)
    if (!c || c.stage === to.key || to.managed || c.org_id) return
    const before = rows
    setRows(rows.map((r) => (r.id === id ? { ...r, stage: to.key, stage_changed_at: new Date().toISOString() } : r)))
    setProblem(null)
    startTransition(async () => {
      const r = await moveCard(id, to.key).catch(() => ({ ok: false as const, problem: 'failed' }))
      if (!r.ok) {
        setRows(before)
        setProblem(m.problem[r.problem as keyof typeof m.problem] ?? b.notMoved)
      }
    })
  }

  return (
    <div className="mt-[22px] flex flex-col gap-[10px]">
      {problem ? (
        <p role="alert" className="m-0 rounded-ctl bg-peach px-[12px] py-[8px] text-[12.5px] font-semibold text-dangerdeep">
          {problem}
        </p>
      ) : null}
      {view === 'board' ? (
        <div className="overflow-x-auto pb-[6px]" role="region" aria-label={b.title} tabIndex={0}>
          <div className="grid gap-[14px]" style={grid(columns.length)}>
            {columns.map((s, i) => {
              const cards = rows.filter((r) => r.stage === s.key)
              // 0137: a deal without a value is counted, never priced at 0 kr; a column of such deals has no sum
              const sum = totals(cards)
              const shown = shownSum(sum)
              const missing = unvalued(sum)
              const droppable = canWrite && !s.managed
              return (
                <section
                  key={s.key}
                  aria-label={s.name}
                  onDragOver={(e) => {
                    if (!droppable || !drag) return
                    e.preventDefault()
                    setOver(s.key)
                  }}
                  onDragLeave={() => setOver((o) => (o === s.key ? null : o))}
                  onDrop={(e) => {
                    e.preventDefault()
                    setOver(null)
                    if (drag && droppable) move(drag, s)
                    setDrag(null)
                  }}
                  className={`flex min-w-0 flex-col gap-[10px] rounded-[12px] ${over === s.key ? 'bg-sbg' : ''}`}
                >
                  <header
                    className="flex items-center gap-[8px] border-b border-line px-[4px] pb-[6px]"
                    title={[s.exit_criterion, s.managed ? b.managed : null, missing ? fill(b.colUnvalued, { count: missing, total: sum.count }) : null].filter(Boolean).join(' · ') || undefined}
                  >
                    <span aria-hidden="true" className={`block h-[10px] w-[10px] flex-none rounded-pill ${VIZ[i % VIZ.length]}`} />
                    <span className="flex-1 text-[13.5px] font-bold">{s.name}</span>
                    <span className="whitespace-nowrap text-[12px] text-mut">
                      {cards.length} · {shown === null ? '—' : kr(shown)}
                    </span>
                  </header>
                  {cards.length ? (
                    cards.map((c) => {
                      const movable = canWrite && !c.org_id && !s.managed
                      return (
                        <button
                          key={c.id}
                          type="button"
                          draggable={movable}
                          onDragStart={() => setDrag(c.id)}
                          onDragEnd={() => setDrag(null)}
                          onClick={() => setOpen(c)}
                          className={`flex flex-col gap-[8px] rounded-[12px] border border-line bg-sf px-[16px] py-[14px] text-left text-ink hover:border-ink ${movable ? 'cursor-grab' : 'cursor-pointer'} ${drag === c.id ? 'opacity-50' : ''}`}
                        >
                          <span className="text-[14px] font-semibold leading-[1.3]">{c.name}</span>
                          <span className="text-[13px] text-mut">{c.contact_name ?? b.noContact}</span>
                          <span className="mt-[2px] flex items-center justify-between gap-[8px]">
                            <span className="text-[13.5px] font-bold">{c.value_nok === null ? b.noValue : kr(c.value_nok)}</span>
                            {c.owner_email ? <Avatar name={c.owner_email} size={24} /> : null}
                          </span>
                          <span className="block border-t border-line pt-[8px] text-[11.5px] text-mut">{footer(c)}</span>
                        </button>
                      )
                    })
                  ) : (
                    <div className="rounded-[12px] border border-dashed border-line p-[16px] text-center text-[12.5px] text-mut">{b.empty}</div>
                  )}
                </section>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-panel border border-line bg-sf">
          <div className="min-w-[660px]">
            <div aria-hidden="true" className="flex items-center gap-[14px] border-b border-line px-[20px] pb-[10px] pt-[14px] text-[11px] uppercase tracking-[0.09em] text-mut">
              <span className="flex-[2.2]">{b.col.deal}</span>
              <span className="flex-[1.4]">{b.col.next}</span>
              <span className="w-[110px]">{b.col.stage}</span>
              <span className="w-[36px]">{b.col.owner}</span>
              <span className="w-[112px] text-right">{b.col.value}</span>
            </div>
            {[...rows]
              .filter((c) => columns.some((s) => s.key === c.stage))
              .sort((a, c) => (c.value_nok ?? -1) - (a.value_nok ?? -1))
              .map((c) => {
                const s = stageOf(c.stage)
                return (
                  <button key={c.id} type="button" onClick={() => setOpen(c)} className="flex w-full items-center gap-[14px] border-0 border-b border-solid border-line bg-transparent px-[20px] py-[14px] text-left text-ink hover:bg-bg">
                    <span className="min-w-0 flex-[2.2]">
                      <span className="block font-semibold">{c.name}</span>
                      <span className="block text-[12.5px] text-mut">
                        {c.contact_name ?? b.noContact} · {s?.kind === 'won' ? b.closed : fill(b.days, { n: days(c) })}
                      </span>
                    </span>
                    <span className="min-w-0 flex-[1.4] text-[13px] text-mut">{c.next_step ?? '—'}</span>
                    <span className="w-[110px]">
                      <Badge tone={s?.kind === 'won' ? 'green' : 'yellow'}>{s?.name ?? c.stage}</Badge>
                    </span>
                    <span className="w-[36px]">{c.owner_email ? <Avatar name={c.owner_email} /> : null}</span>
                    <span className="w-[112px] text-right font-bold">{c.value_nok === null ? '—' : kr(c.value_nok)}</span>
                  </button>
                )
              })}
          </div>
        </div>
      )}
      {rest.length ? (
        <p className="m-0 flex flex-wrap gap-[10px] text-[12.5px] text-mut">
          {rest.map((s) => (
            <Link key={s.key} href={`/admin/crm/prospects?stage=${s.key}` as Route} className="font-semibold text-link">
              {s.name} · {rows.filter((r) => r.stage === s.key).length}
            </Link>
          ))}
        </p>
      ) : null}
      {open ? (
        <DealDialog
          key={open.id}
          deal={open}
          stages={stages}
          owners={owners}
          canWrite={canWrite}
          m={m}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  )
}

function DealDialog({ deal, stages, owners, canWrite, m, onClose }: { deal: Company; stages: Stage[]; owners: Owner[]; canWrite: boolean; m: CrmMessages; onClose: () => void }) {
  const b = m.board
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(async (prev, fd) => {
    const r = await saveDeal(prev, fd)
    if (r.ok) onClose()
    return r
  }, null)
  const stage = stages.find((s) => s.key === deal.stage)
  const movable = !deal.org_id && !stage?.managed
  const sub = [deal.value_nok === null ? null : kr(deal.value_nok), stage?.name, deal.owner_email ? fill(b.ownerIs, { owner: deal.owner_email }) : null].filter(Boolean).join(' · ')
  return (
    <Modal open onClose={onClose} title={deal.name} sub={sub} closeLabel={b.close}>
      <form action={action}>
        <input type="hidden" name="id" value={deal.id} />
        <input type="hidden" name="from" value={deal.stage} />
        <fieldset disabled={!canWrite} className="m-0 mt-[22px] flex flex-col gap-[16px] border-0 p-0">
          <label className="block">
            <span className={FIELD_LABEL}>{b.field.stage}</span>
            {movable ? (
              <select name="stage" defaultValue={deal.stage} className={FIELD}>
                {stages
                  .filter((s) => !s.archived && !s.managed)
                  .map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name}
                    </option>
                  ))}
              </select>
            ) : (
              <span className="block text-[13px]">
                {stage?.name ?? deal.stage} <span className="text-mut">· {b.managed}</span>
              </span>
            )}
          </label>
          <label className="block">
            <span className={FIELD_LABEL}>{b.field.value}</span>
            <input name="value_nok" inputMode="numeric" defaultValue={deal.value_nok ?? ''} placeholder={b.field.valueHint} className={FIELD} />
          </label>
          <div className="grid gap-[12px] [grid-template-columns:minmax(0,1fr)_160px]">
            <label className="block">
              <span className={FIELD_LABEL}>{b.field.next}</span>
              <input name="next_step" defaultValue={deal.next_step ?? ''} maxLength={300} className={FIELD} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>{b.field.nextAt}</span>
              <input name="next_step_at" type="date" defaultValue={deal.next_step_at ?? ''} className={FIELD} />
            </label>
          </div>
          <label className="block">
            <span className={FIELD_LABEL}>{b.field.owner}</span>
            <select name="owner_id" defaultValue={deal.owner_id ?? ''} className={FIELD}>
              <option value="">{b.field.noOwner}</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.email}
                </option>
              ))}
            </select>
          </label>
          {state && !state.ok ? (
            <p role="alert" className="m-0 text-[12.5px] font-semibold text-danger">
              {m.problem[state.problem as keyof typeof m.problem] ?? b.notSaved}
            </p>
          ) : null}
        </fieldset>
        <div className="mt-[24px] flex flex-wrap items-center justify-end gap-[10px]">
          <Link href={`/admin/crm/prospects/${deal.id}` as Route} className="mr-auto text-[12.5px] font-semibold text-link">
            {b.openCompany}
          </Link>
          <button type="button" className={BTN.secondary} onClick={onClose}>
            {b.cancel}
          </button>
          {canWrite ? (
            <button type="submit" className={BTN.dark} disabled={pending}>
              {pending ? b.saving : b.save}
            </button>
          ) : null}
        </div>
      </form>
    </Modal>
  )
}

/** «New deal»: a company with its value, next step and owner, starting in the first stage */
export function NewDeal({ owners, m }: { owners: Owner[]; m: CrmMessages }) {
  const b = m.board
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(saveCompany, null)
  return (
    <>
      <button type="button" className={BTN.primary} onClick={() => setOpen(true)}>
        {b.newDeal}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={b.newDeal} sub={b.newLead} closeLabel={b.close}>
        <form action={action}>
          <div className="mt-[22px] flex flex-col gap-[16px]">
            <label className="block">
              <span className={FIELD_LABEL}>{b.field.company}</span>
              <input name="name" required maxLength={200} placeholder={b.field.companyHint} className={FIELD} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>{b.field.value}</span>
              <input name="value_nok" inputMode="numeric" placeholder={b.field.valueHint} className={FIELD} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>{b.field.next}</span>
              <input name="next_step" maxLength={300} className={FIELD} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>{b.field.owner}</span>
              <select name="owner_id" defaultValue="" className={FIELD}>
                <option value="">{b.field.noOwner}</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.email}
                  </option>
                ))}
              </select>
            </label>
            {state && !state.ok ? (
              <p role="alert" className="m-0 text-[12.5px] font-semibold text-danger">
                {m.problem[state.problem as keyof typeof m.problem] ?? b.notSaved}
              </p>
            ) : null}
          </div>
          <div className="mt-[24px] flex justify-end gap-[10px]">
            <button type="button" className={BTN.secondary} onClick={() => setOpen(false)}>
              {b.cancel}
            </button>
            <button type="submit" className={BTN.dark} disabled={pending}>
              {pending ? b.saving : b.create}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}
