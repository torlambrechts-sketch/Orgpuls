'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { startTransition, useEffect, useState } from 'react'
import type { CrmMessages } from '@/components/admin/CrmForms'
import type { Company, Stage } from '@/lib/admin/crm'
import { moveCard } from '@/lib/admin/crmActions'

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
 * The pipeline as a board (0112): a column per stage people work in, with what the buyer did to
 * reach it, and the companies in it. Drag a card to another column, or use its «Move to» on a
 * keyboard. The plan's stages (trial, customer) and a company that follows its organisation's plan
 * are not moved by hand; the database refuses it too.
 */
export function PipelineBoard({ stages, companies, m, canWrite }: { stages: Stage[]; companies: Company[]; m: CrmMessages; canWrite: boolean }) {
  const b = m.board
  const [rows, setRows] = useState(companies)
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => setRows(companies), [companies])
  const columns = stages.filter((s) => !s.archived && (s.kind === 'open' || s.kind === 'won'))
  const rest = stages.filter((s) => !s.archived && s.kind !== 'open' && s.kind !== 'won')
  const [now] = useState(() => Date.now())

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
    <div className="flex flex-col gap-[10px]">
      {problem ? (
        <p role="alert" className="m-0 rounded-ctl bg-peach px-[12px] py-[8px] text-[12.5px] font-semibold text-dangerdeep">
          {problem}
        </p>
      ) : null}
      <div className="overflow-x-auto pb-[6px]" role="region" aria-label={b.title} tabIndex={0}>
        <div className="flex min-w-max items-start gap-[12px]">
          {columns.map((s) => {
            const cards = rows.filter((r) => r.stage === s.key)
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
                className={`flex w-[252px] flex-none flex-col gap-[8px] rounded-panel border p-[10px] ${over === s.key ? 'border-ink bg-sbg' : 'border-line bg-bg'}`}
              >
                <header className="px-[4px]">
                  <span className="flex items-baseline justify-between gap-[8px]">
                    <span className="text-[13px] font-bold">{s.name}</span>
                    <span className="text-[12px] font-semibold tabular-nums text-mut">{cards.length}</span>
                  </span>
                  {s.exit_criterion ? <span className="mt-[2px] block text-[11.5px] leading-[1.4] text-mut">{s.exit_criterion}</span> : null}
                  {s.managed ? <span className="mt-[2px] block text-[11px] font-semibold text-mut">{b.managed}</span> : null}
                </header>
                {cards.length ? (
                  cards.map((c) => {
                    const days = Math.floor((now - Date.parse(c.stage_changed_at)) / DAY)
                    const movable = canWrite && !c.org_id && !s.managed
                    return (
                      <article
                        key={c.id}
                        draggable={movable}
                        onDragStart={() => setDrag(c.id)}
                        onDragEnd={() => setDrag(null)}
                        className={`rounded-ctl border border-line bg-sf px-[10px] py-[8px] ${movable ? 'cursor-grab' : ''} ${drag === c.id ? 'opacity-50' : ''}`}
                      >
                        <Link href={`/admin/crm/prospects/${c.id}` as Route} className="block text-[13px] font-bold text-ink hover:text-link">
                          {c.name}
                        </Link>
                        {c.manager_name ? <span className="block text-[12px] text-mut">{c.manager_name}</span> : null}
                        <span className="mt-[2px] block text-[11.5px] text-mut">
                          {[c.employees !== null ? fill(b.employees, { n: c.employees }) : null, c.municipality].filter(Boolean).join(' · ')}
                        </span>
                        {c.next_step ? <span className="mt-[4px] block text-[12px] leading-[1.4]">{c.next_step}</span> : null}
                        <span className="mt-[4px] flex items-center justify-between gap-[6px] text-[11px]">
                          <span className={`font-semibold ${days > 14 && s.kind === 'open' ? 'text-danger' : 'text-mut'}`}>{fill(b.days, { n: days })}</span>
                          {c.owner_email ? <span className="truncate text-mut">{c.owner_email.split('@')[0]}</span> : null}
                        </span>
                        {movable ? (
                          <label className="mt-[6px] block">
                            <span className="sr-only">{fill(b.moveLabel, { name: c.name })}</span>
                            <select
                              value=""
                              onChange={(e) => {
                                const to = stages.find((x) => x.key === e.target.value)
                                if (to) move(c.id, to)
                              }}
                              className="box-border h-[28px] w-full rounded-[8px] border border-line bg-bg px-[6px] text-[11.5px] text-mut"
                            >
                              <option value="">{b.moveTo}</option>
                              {stages
                                .filter((x) => !x.archived && !x.managed && x.key !== s.key)
                                .map((x) => (
                                  <option key={x.key} value={x.key}>
                                    {x.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                        ) : null}
                      </article>
                    )
                  })
                ) : (
                  <p className="m-0 px-[4px] text-[12px] text-mut">{b.empty}</p>
                )}
              </section>
            )
          })}
        </div>
      </div>
      {rest.length ? (
        <p className="m-0 flex flex-wrap gap-[10px] text-[12.5px] text-mut">
          {rest.map((s) => (
            <Link key={s.key} href={`/admin/crm/prospects?stage=${s.key}` as Route} className="font-semibold text-link">
              {s.name} · {rows.filter((r) => r.stage === s.key).length}
            </Link>
          ))}
        </p>
      ) : null}
    </div>
  )
}
