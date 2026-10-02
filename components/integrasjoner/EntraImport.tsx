'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  disconnectEntra,
  listEntraGroups,
  saveEntraGroups,
  saveEntraSettings,
  syncEntraNow,
  type EntraResult,
} from '@/app/(app)/integrasjoner/entra/import-actions'

/**
 * Integrasjoner › Microsoft Entra ID, cards 3 and 4 and the run's result (D-202): the design's
 * `isEntra` branch (Orgpuls_v3.dc.html lines 1844-1873), now that the import exists.
 *
 * Card 3 ticks the tenant's groups as the design's chips do, read from the directory through
 * the Edge Function; a search field is added, because a tenant has hundreds of groups and the
 * chips would otherwise be a wall (D-202). The chosen groups get an order, because a person in
 * two of them has to land in one, and the daglig leder decides which. Card 4 is the design's two
 * radio rows, and the opt-in for mobile numbers. Each choice is saved as it is made, as on the
 * SMS screen; the groups are saved with a button, because a half-made selection would otherwise
 * start a full read of the directory with every tick.
 *
 * Nothing here invents a number: before a run, the result card says there has been none; a
 * count is shown only as the database recorded it.
 */

export interface EntraChosen {
  id: string
  name: string
  /** the directory's members of the group at the last run (the mirror), when it has been read */
  members: number | null
}

export interface EntraGroupLabels {
  step3: string
  search: string
  searchPlaceholder: string
  searchButton: string
  loading: string
  fromDirectory: string
  /** "{count} medlemmer" with the count filled in per group by the server */
  members: Record<string, string>
  more: string
  noMatch: string
  order: string
  orderNote: string
  up: string
  down: string
  saveGroups: string
  saved: string
  groupNote: string
  step4: string
  modes: { nightly: { label: string; note: string }; manual: { label: string; note: string } }
  phone: string
  phoneNote: string
  leaverNote: string
  roundNote: string
  pending: string
  readOnly: string
  problems: Record<string, string>
}

const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (a, k: string) => v[k] ?? a)

export function EntraGroupsAndSync({
  chosen: initialChosen,
  mode: initialMode,
  includePhone: initialPhone,
  canWrite,
  labels,
}: {
  chosen: EntraChosen[]
  mode: 'nightly' | 'manual'
  includePhone: boolean
  canWrite: boolean
  labels: EntraGroupLabels
}) {
  const [chosen, setChosen] = useState<EntraChosen[]>(initialChosen)
  const [saved, setSaved] = useState<string>(initialChosen.map((g) => g.id).join(','))
  const [available, setAvailable] = useState<{ id: string; name: string }[] | null>(null)
  const [more, setMore] = useState(false)
  const [q, setQ] = useState('')
  const [mode, setMode] = useState(initialMode)
  const [phone, setPhone] = useState(initialPhone)
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pending, startTransition] = useTransition()

  const load = (query: string) => {
    if (!canWrite) return
    setLoading(true)
    startTransition(async () => {
      const r = await listEntraGroups(query)
      setLoading(false)
      if (r.ok) {
        setAvailable(r.groups)
        setMore(r.more)
        setProblem(null)
      } else {
        setAvailable([])
        setProblem(r.problem)
      }
    })
  }
  // the tenant's groups, once, when the card is shown to someone who can choose
  useEffect(() => {
    load('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const chips = useMemo(() => {
    const seen = new Set(chosen.map((g) => g.id))
    return [...chosen.map((g) => ({ id: g.id, name: g.name, on: true })), ...(available ?? []).filter((g) => !seen.has(g.id)).map((g) => ({ ...g, on: false }))]
  }, [chosen, available])

  const result = (r: EntraResult, after?: () => void) => {
    setProblem(r.ok ? null : r.problem)
    if (r.ok) after?.()
  }
  const toggle = (g: { id: string; name: string; on: boolean }) => {
    setDone(false)
    setChosen((c) => (g.on ? c.filter((x) => x.id !== g.id) : [...c, { id: g.id, name: g.name, members: null }]))
  }
  const move = (i: number, by: -1 | 1) =>
    setChosen((c) => {
      const next = [...c]
      const j = i + by
      if (j < 0 || j >= next.length) return c
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })
  const dirty = chosen.map((g) => g.id).join(',') !== saved
  const saveSettings = (m: 'nightly' | 'manual', p: boolean) =>
    startTransition(async () => result(await saveEntraSettings(m, p)))

  const card = 'rounded-panel border border-line bg-sf px-[24px] py-[22px]'
  const head = 'text-[11px] uppercase tracking-[0.11em] text-mut'

  return (
    <>
      {/* 3 · Hvilke grupper skal med */}
      <section className={card} aria-labelledby="entra-groups">
        <div id="entra-groups" className={head}>{labels.step3}</div>
        {canWrite ? (
          <form
            className="mt-[13px] flex max-w-[420px] items-end gap-[8px]"
            onSubmit={(e) => {
              e.preventDefault()
              load(q)
            }}
          >
            <label className="block min-w-0 flex-1">
              <span className="mb-[6px] block text-[12.5px] text-mut">{labels.search}</span>
              <input
                value={q}
                maxLength={60}
                onChange={(e) => setQ(e.target.value)}
                placeholder={labels.searchPlaceholder}
                className="box-border h-[42px] w-full rounded-btn border border-line bg-bg px-[14px] text-[14px] text-ink outline-none focus-visible:border-ink"
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="h-[42px] cursor-pointer rounded-btn border border-ink bg-transparent px-[14px] text-[12.5px] font-bold text-ink disabled:cursor-default"
            >
              {labels.searchButton}
            </button>
          </form>
        ) : null}

        <div className="mt-[13px] flex flex-wrap gap-[9px]">
          {chips.map((g) => {
            const count = chosen.find((c) => c.id === g.id)?.members
            return (
              <button
                key={g.id}
                type="button"
                role="checkbox"
                aria-checked={g.on}
                disabled={!canWrite}
                onClick={() => toggle(g)}
                className={`flex cursor-pointer items-center gap-[10px] rounded-cta border px-[15px] py-[10px] text-ink disabled:cursor-default ${
                  g.on ? 'border-ink bg-sbg' : 'border-line bg-transparent'
                }`}
              >
                <span
                  className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border-2 border-ink text-[11px] font-bold"
                  style={g.on ? { background: '#191510', color: '#FCF6E9' } : { background: 'transparent', color: 'transparent' }}
                  aria-hidden
                >
                  {g.on ? '✓' : ''}
                </span>
                <span className="text-left">
                  <span className={`block text-[13.5px] ${g.on ? 'font-bold' : 'font-medium'}`}>{g.name}</span>
                  <span className="block text-[11.5px] text-mut">
                    {count != null ? labels.members[String(count)] ?? labels.fromDirectory : labels.fromDirectory}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
        {loading ? <div className="mt-[10px] text-[12.5px] text-mut">{labels.loading}</div> : null}
        {available && available.length === 0 && q.trim() !== '' && !problem ? (
          <div className="mt-[10px] text-[12.5px] text-mut">{labels.noMatch}</div>
        ) : null}
        {more ? <div className="mt-[10px] text-[12.5px] text-mut">{labels.more}</div> : null}

        {chosen.length > 1 ? (
          <div className="mt-[16px] border-t border-line pt-[14px]">
            <div className="text-[13px] font-bold">{labels.order}</div>
            <div className="mt-[2px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">{labels.orderNote}</div>
            <ol className="m-0 mt-[10px] flex list-none flex-col gap-[6px] p-0">
              {chosen.map((g, i) => (
                <li key={g.id} className="flex items-center gap-[10px] rounded-cta border border-line bg-bg px-[12px] py-[8px] text-[13px]">
                  <span className="w-[18px] text-mut">{i + 1}</span>
                  <span className="min-w-0 flex-1 font-semibold">{g.name}</span>
                  {canWrite ? (
                    <>
                      <button
                        type="button"
                        aria-label={fill(labels.up, { name: g.name })}
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                        className="h-[28px] w-[30px] cursor-pointer rounded-focus border border-line bg-transparent text-[13px] text-ink disabled:cursor-default disabled:text-faint"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={fill(labels.down, { name: g.name })}
                        disabled={i === chosen.length - 1}
                        onClick={() => move(i, 1)}
                        className="h-[28px] w-[30px] cursor-pointer rounded-focus border border-line bg-transparent text-[13px] text-ink disabled:cursor-default disabled:text-faint"
                      >
                        ↓
                      </button>
                    </>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        <div className="mt-[12px] max-w-[580px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">{labels.groupNote}</div>
        {canWrite ? (
          <button
            type="button"
            disabled={!dirty || pending}
            onClick={() =>
              startTransition(async () =>
                result(await saveEntraGroups(chosen.map(({ id, name }) => ({ id, name }))), () => {
                  setSaved(chosen.map((g) => g.id).join(','))
                  setDone(true)
                }),
              )
            }
            className="mt-[14px] h-[38px] cursor-pointer rounded-ctl border border-ink bg-ac px-[14px] text-[12.5px] font-bold text-ink disabled:cursor-default disabled:border-line disabled:bg-transparent disabled:text-faint"
          >
            {labels.saveGroups}
          </button>
        ) : null}
        {done && !dirty ? <div role="status" className="mt-[8px] text-[12.5px] text-greendeep">{labels.saved}</div> : null}
      </section>

      {/* 4 · Synkronisering */}
      <section className={card}>
        <div id="entra-mode" className={head}>{labels.step4}</div>
        <div role="radiogroup" aria-labelledby="entra-mode" className="mt-[13px] flex flex-col gap-[8px]">
          {(['nightly', 'manual'] as const).map((k) => {
            const on = mode === k
            return (
              <label
                key={k}
                className={`flex items-start gap-[11px] rounded-cta border px-[15px] py-[13px] text-left text-ink ${
                  canWrite ? 'cursor-pointer' : 'cursor-default'
                } ${on ? 'border-ink bg-sbg' : 'border-line bg-transparent'}`}
              >
                <input
                  type="radio"
                  name="entra-mode"
                  value={k}
                  checked={on}
                  disabled={!canWrite}
                  onChange={() => {
                    setMode(k)
                    saveSettings(k, phone)
                  }}
                  className="peer absolute h-px w-px overflow-hidden opacity-0"
                />
                <span className="mt-[2px] flex h-[17px] w-[17px] flex-none items-center justify-center rounded-pill border-2 border-ink peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink">
                  <span className="block h-[8px] w-[8px] rounded-pill" style={{ background: on ? '#191510' : 'transparent' }} />
                </span>
                <span className="min-w-0">
                  <span className={`block text-[13.5px] ${on ? 'font-bold' : 'font-medium'}`}>{labels.modes[k].label}</span>
                  <span className="mt-[2px] block text-[12.5px] leading-[1.5] text-mut">{labels.modes[k].note}</span>
                </span>
              </label>
            )
          })}
        </div>

        <label
          className={`mt-[8px] flex items-start gap-[11px] rounded-cta border px-[15px] py-[13px] text-left text-ink ${
            canWrite ? 'cursor-pointer' : 'cursor-default'
          } ${phone ? 'border-ink bg-sbg' : 'border-line bg-transparent'}`}
        >
          <input
            type="checkbox"
            checked={phone}
            disabled={!canWrite}
            onChange={(e) => {
              setPhone(e.target.checked)
              saveSettings(mode, e.target.checked)
            }}
            className="peer absolute h-px w-px overflow-hidden opacity-0"
          />
          <span
            className="mt-[1px] flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border-2 border-ink text-[11px] font-bold peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink"
            style={phone ? { background: '#191510', color: '#FCF6E9' } : { background: 'transparent', color: 'transparent' }}
            aria-hidden
          >
            {phone ? '✓' : ''}
          </span>
          <span className="min-w-0">
            <span className={`block text-[13.5px] ${phone ? 'font-bold' : 'font-medium'}`}>{labels.phone}</span>
            <span className="mt-[2px] block text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">{labels.phoneNote}</span>
          </span>
        </label>

        <div className="mt-[12px] max-w-[580px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">{labels.leaverNote}</div>
        <div className="mt-[8px] max-w-[580px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">{labels.roundNote}</div>
        {!canWrite ? <div className="mt-[8px] text-[12.5px] text-mut">{labels.readOnly}</div> : null}
        {pending ? <div className="mt-[8px] text-[12.5px] text-mut">{labels.pending}</div> : null}
        {problem ? (
          <p role="alert" className="mb-0 mt-[10px] text-[12.5px] leading-[1.5] text-danger [text-wrap:pretty]">
            {labels.problems[problem] ?? labels.problems.denied}
          </p>
        ) : null}
      </section>
    </>
  )
}

export interface EntraPanelLabels {
  syncNow: string
  syncNote: string
  functionNotReady: string | null
  requestedNow: string
  disconnect: string
  disconnectConfirm: string
  pending: string
  problems: Record<string, string>
}

/** «Synkroniser nå» and «Stopp hentingen»; the result card above them is rendered by the server */
export function EntraSyncButtons({ canSync, canDisconnect, labels }: { canSync: boolean; canDisconnect: boolean; labels: EntraPanelLabels }) {
  const [problem, setProblem] = useState<string | null>(null)
  const [asked, setAsked] = useState(false)
  const [pending, startTransition] = useTransition()
  return (
    <>
      <button
        type="button"
        disabled={!canSync || pending}
        onClick={() =>
          startTransition(async () => {
            const r = await syncEntraNow()
            setProblem(r.ok ? null : r.problem)
            setAsked(r.ok)
          })
        }
        className="h-[46px] cursor-pointer rounded-cta border border-ink bg-ac text-[15px] font-bold text-ink disabled:cursor-default disabled:border-line disabled:bg-transparent disabled:text-faint"
      >
        {labels.syncNow}
      </button>
      <div className="text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">{labels.functionNotReady ?? labels.syncNote}</div>
      {asked ? (
        <div role="status" className="text-[12.5px] leading-[1.55] text-greendeep [text-wrap:pretty]">
          {labels.requestedNow}
        </div>
      ) : null}
      {pending ? <div className="text-[12.5px] text-mut">{labels.pending}</div> : null}
      {problem ? (
        <p role="alert" className="m-0 text-[12.5px] leading-[1.5] text-danger [text-wrap:pretty]">
          {labels.problems[problem] ?? labels.problems.denied}
        </p>
      ) : null}
      {canDisconnect ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(labels.disconnectConfirm)) return
            startTransition(async () => {
              const r = await disconnectEntra()
              setProblem(r.ok ? null : r.problem)
            })
          }}
          className="h-[38px] cursor-pointer self-start rounded-ctl border border-line bg-transparent px-[14px] text-[12.5px] font-bold text-mut disabled:cursor-default"
        >
          {labels.disconnect}
        </button>
      ) : null}
    </>
  )
}
