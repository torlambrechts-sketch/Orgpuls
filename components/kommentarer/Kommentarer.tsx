'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { replyToThread, requestContact, withdrawContact } from '@/app/(app)/kommentarer/actions'
import { LATE_AFTER_DAYS, TONE_STYLE, type ThemeTone } from '@/lib/conversations/rules'
import { ORG } from '@/lib/results/resultater'

/**
 * Kommentarer's body (v3 2640-2720): Temaer on the left, the comments on the right, with
 * the status, round and theme as filters mirrored to the URL. Nothing here is fetched:
 * the page hands over every comment the reader may see, so a filter is instant.
 *
 * A reply goes through `replyToThread`, the one write path for a conversation. The page
 * is re-rendered by the action, and the comment comes back with "Du svarte:" read from
 * the thread, not from the draft typed here.
 */
export type CommentTone = 'negativ' | 'blandet' | 'positiv'

export interface CommentItem {
  id: string
  factorKey: string
  roundId: string
  roundTitle: string
  date: string | null
  tone: CommentTone | null
  /** the answer the comment hangs on, 1..5 — for the theme's tone, never shown */
  value: number | null
  text: string
  thread: { author: 'ansatt' | 'leder'; body: string }[]
  needsReply: boolean
  closed: boolean
  flagged: boolean
  waitingDays: number
  openedHour: string
  /** a request for direct contact (0046, D-82): who asked, and whether it was you */
  contact: { name: string | null; mine: boolean } | null
}

export interface RoundChip {
  id: string
  title: string
}

type Status = 'alle' | 'ubesvart' | 'besvart'

/**
 * A theme's tone on this screen is the design's rule (v3 `themes`): more answers at the low
 * end than the high names it Negativ, the other way Positiv, otherwise Blandet. Read from
 * the answers the comments hang on, never from the text.
 */
const majority = (low: number, high: number): ThemeTone => (low > high ? 'negativ' : high > low ? 'positiv' : 'blandet')

export function Kommentarer({
  items,
  rounds,
  canReply,
  initial,
}: {
  items: CommentItem[]
  rounds: RoundChip[]
  canReply: boolean
  initial: { round: string; factor: string | null; status: Status }
}) {
  const t = useTranslations()
  const [round, setRound] = useState(initial.round)
  const [factor, setFactor] = useState(initial.factor)
  const [status, setStatus] = useState<Status>(initial.status)

  useEffect(() => {
    const url = new URL(window.location.href)
    const set = (k: string, v: string | null, dflt: string | null) =>
      v === dflt || v === null ? url.searchParams.delete(k) : url.searchParams.set(k, v)
    set('maling', round, 'alle')
    set('faktor', factor, null)
    set('status', status, 'alle')
    window.history.replaceState(null, '', url)
  }, [round, factor, status])

  const inRound = items.filter((c) => round === 'alle' || c.roundId === round)
  const waiting = items.filter((c) => c.needsReply).length

  // Temaer: the factors the selected rounds have comments on, most comments first
  const themes = [...new Set(inRound.map((c) => c.factorKey))]
    .map((key) => {
      const cs = inRound.filter((c) => c.factorKey === key)
      const valued = cs.filter((c) => c.value !== null)
      return {
        key,
        n: cs.length,
        tone: valued.length
          ? majority(valued.filter((c) => c.value! <= 2).length, valued.filter((c) => c.value! >= 4).length)
          : null,
      }
    })
    .sort((a, b) => b.n - a.n)

  const byStatus = (c: CommentItem, s: Status) => s === 'alle' || (s === 'ubesvart' ? c.needsReply : !c.needsReply)
  const shown = inRound
    .filter((c) => (factor === null || c.factorKey === factor) && byStatus(c, status))
    // what waits first, longest first; then the answered, newest first
    .sort((a, b) =>
      a.needsReply !== b.needsReply
        ? Number(b.needsReply) - Number(a.needsReply)
        : a.needsReply
          ? b.waitingDays - a.waitingDays || a.openedHour.localeCompare(b.openedHour)
          : b.openedHour.localeCompare(a.openedHour),
    )
  const inScope = inRound.filter((c) => factor === null || c.factorKey === factor)

  const chip = (on: boolean) => (on ? 'border-ink bg-ink text-bg' : 'border-line bg-sf text-ink')
  const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

  return (
    <div className="grid grid-cols-1 items-start gap-[16px] lg:grid-cols-[300px_1fr]">
      <div className="flex flex-col gap-[12px]">
        <div className="rounded-note border border-line bg-sf px-[18px] pb-[14px] pt-[18px]">
          <h2 className="text-[15px] font-bold">{t('kommentarer.themes')}</h2>
          <div className="mt-[3px] text-[12px] leading-[1.45] text-mut">
            {t('kommentarer.total', { count: items.length, rounds: rounds.length, waiting })}
          </div>
          <div className="mt-[12px] flex flex-col gap-[6px]">
            {[{ key: null, n: inRound.length, tone: null as ThemeTone | null }, ...themes].map((th) => {
              const on = factor === th.key
              const tone = th.tone ? TONE_STYLE[th.tone] : null
              return (
                <button
                  key={th.key ?? 'alle'}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFactor(th.key)}
                  className={`flex w-full cursor-pointer items-center gap-[10px] rounded-btn border px-[12px] py-[10px] text-left leading-[normal] text-ink ${focus} ${
                    on ? 'border-ink bg-sbg' : 'border-line bg-sf'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold">
                      {th.key ? t(`factor.${th.key}.name`) : t('kommentarer.allThemes')}
                    </span>
                    <span className="mt-px block text-[11px] text-mut">{t('kommentarer.count', { count: th.n })}</span>
                  </span>
                  {tone && th.tone ? (
                    <span
                      className="flex-none rounded-pill px-[9px] py-[3px] text-[10.5px] font-bold"
                      style={{ background: tone.background, color: tone.color }}
                    >
                      {t(`kommentarer.tone.${th.tone}`)}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
        <div className="rounded-opt bg-sbg px-[16px] py-[14px] text-[12.5px] leading-[1.55] [text-wrap:pretty]">
          {t('kommentarer.note')}
        </div>
      </div>

      <div className="min-w-0 rounded-note border border-line bg-sf px-[22px] py-[20px]">
        <div className="flex flex-wrap items-center justify-between gap-[12px]">
          <span className="flex items-baseline gap-[12px]">
            <h2 className="font-display text-[22px] font-semibold">
              {factor ? t(`factor.${factor}.name`) : t('kommentarer.all')}
            </h2>
            {factor ? (
              <Link
                href={`/resultater?${new URLSearchParams({ gruppe: ORG, faktor: factor }).toString()}` as Route}
                className={`text-[12.5px] font-bold text-link hover:text-linkhover ${focus}`}
              >
                {t('kommentarer.toResults')}
              </Link>
            ) : null}
          </span>
          <span className="flex flex-wrap gap-[6px]">
            {(['alle', 'ubesvart', 'besvart'] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
                className={`cursor-pointer rounded-pill border px-[13px] py-[7px] text-[12.5px] font-bold leading-[normal] ${focus} ${chip(status === s)}`}
              >
                {t(`kommentarer.status.${s}`, { count: inScope.filter((c) => byStatus(c, s)).length })}
              </button>
            ))}
          </span>
        </div>
        <div className="mt-[12px] flex flex-wrap items-center gap-[6px]">
          <span className="mr-[4px] text-[11px] uppercase tracking-[.09em] text-mut">{t('kommentarer.round')}</span>
          {[{ id: 'alle', title: t('kommentarer.allRounds') }, ...rounds].map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={round === r.id}
              onClick={() => {
                setRound(r.id)
                setFactor(null)
              }}
              className={`cursor-pointer rounded-pill border px-[12px] py-[6px] text-[12px] font-bold leading-[normal] ${focus} ${chip(round === r.id)}`}
            >
              {r.title} · {r.id === 'alle' ? items.length : items.filter((c) => c.roundId === r.id).length}
            </button>
          ))}
        </div>
        <div className="mt-[16px] flex flex-col gap-[10px]">
          {shown.map((c) => (
            <Comment key={c.id} c={c} canReply={canReply} />
          ))}
          {shown.length === 0 ? (
            <div className="rounded-cta border border-dashed border-rule p-[18px] text-center text-[13px] text-mut">
              {t('kommentarer.empty')}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Comment({ c, canReply }: { c: CommentItem; canReply: boolean }) {
  const t = useTranslations()
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const tone = c.tone ? TONE_STYLE[c.tone] : null

  const age = c.needsReply
    ? {
        text: t('kommentarer.waiting', { days: c.waitingDays }),
        colour: c.waitingDays >= LATE_AFTER_DAYS ? '#A33A16' : '#5F5849',
      }
    : c.closed && !c.thread.some((m) => m.author === 'leder')
      ? { text: t('kommentarer.closed'), colour: '#5F5849' }
      : { text: t('kommentarer.answered'), colour: '#2F5D2A' }

  const send = () => {
    const body = draft.trim()
    if (!body) return
    start(async () => {
      const data = new FormData()
      data.set('id', c.id)
      data.set('body', body)
      const result = await replyToThread(data)
      if (result.ok) setDraft('')
      setProblem(result.ok ? null : result.problem)
    })
  }

  return (
    <div className="rounded-tile border border-line bg-bg px-[16px] py-[14px]">
      <div className="flex flex-wrap items-center gap-[8px]">
        <span className="rounded-pill border border-line bg-sf px-[9px] py-[2px] text-[11px] font-bold">
          {t(`factor.${c.factorKey}.name`)}
        </span>
        <span className="text-[11.5px] text-mut">{c.date ? `${c.roundTitle} · ${c.date}` : c.roundTitle}</span>
        {tone && c.tone ? (
          <span
            className="rounded-pill px-[9px] py-[2px] text-[10.5px] font-bold"
            style={{ background: tone.background, color: tone.color }}
          >
            {t(`kommentarer.tone.${c.tone}`)}
          </span>
        ) : null}
        <span className="ml-auto text-[11.5px] font-semibold" style={{ color: age.colour }}>
          {age.text}
        </span>
      </div>
      <div className="mt-[9px] text-[14px] leading-[1.55] [text-wrap:pretty]">«{c.text}»</div>
      {c.flagged ? (
        <div className="mt-[10px] rounded-ctl bg-peach px-[12px] py-[10px] text-[12.5px] leading-[1.5] text-rustdeep">
          {t('kommentarer.varselNote')}
        </div>
      ) : null}
      {c.thread.map((m, i) =>
        m.author === 'leder' ? (
          <div key={i} className="mt-[10px] rounded-ctl bg-mint px-[12px] py-[10px] text-[13px] leading-[1.5] [text-wrap:pretty]">
            <strong>{t('kommentarer.youReplied')}</strong> {m.body}
          </div>
        ) : (
          <div key={i} className="mt-[10px] text-[14px] leading-[1.55] [text-wrap:pretty]">
            <span className="text-[11.5px] font-semibold text-mut">{t('kommentarer.theyReplied')}</span> «{m.body}»
          </div>
        ),
      )}
      {c.needsReply && canReply ? (
        <form
          className="mt-[11px] flex gap-[8px]"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('kommentarer.placeholder')}
            aria-label={t('kommentarer.replyAria', { factor: t(`factor.${c.factorKey}.name`) })}
            maxLength={4000}
            className="h-[38px] min-w-0 flex-1 rounded-ctl border border-line bg-sf px-[13px] font-sans text-[13px] text-ink outline-none focus-visible:border-ink"
          />
          <button
            type="submit"
            disabled={pending || !draft.trim()}
            className="h-[38px] flex-none cursor-pointer rounded-ctl border border-ink bg-ac px-[16px] text-[12.5px] font-bold text-ink disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {t('kommentarer.send')}
          </button>
        </form>
      ) : null}
      {canReply && !c.closed ? <ContactRow c={c} onProblem={setProblem} /> : null}
      {problem ? (
        <div role="alert" className="mt-[6px] text-[11.5px] text-danger">
          {t.has(`kommentarer.problem.${problem}`) ? t(`kommentarer.problem.${problem}`) : t('kommentarer.problem.denied')}
        </div>
      ) : null}
    </div>
  )
}

/**
 * A request for direct contact (D-82). The leader asks; the author's private thread page
 * then offers them an e-mail to this leader, from their own mail program. Only sending it
 * tells the leader who they are, so the leader is told exactly that before asking, and
 * nothing here ever shows whether the author has seen the request.
 */
function ContactRow({ c, onProblem }: { c: CommentItem; onProblem: (p: string | null) => void }) {
  const t = useTranslations('kommentarer.contact')
  const [confirming, setConfirming] = useState(false)
  const [pending, start] = useTransition()

  const call = (fn: typeof requestContact) =>
    start(async () => {
      const data = new FormData()
      data.set('id', c.id)
      const result = await fn(data)
      onProblem(result.ok ? null : result.problem)
      if (result.ok) setConfirming(false)
    })

  const quiet =
    'h-[30px] flex-none cursor-pointer rounded-ctl border border-line bg-sf px-[11px] text-[12px] font-semibold text-ink disabled:cursor-default disabled:opacity-60'

  if (c.contact) {
    return (
      <div className="mt-[10px] flex flex-wrap items-center gap-[10px] rounded-ctl border border-line bg-sf px-[12px] py-[9px] text-[12.5px] leading-[1.5]">
        <span className="min-w-0 flex-1 [text-wrap:pretty]">
          {c.contact.mine
            ? t('mine')
            : c.contact.name
              ? t('other', { name: c.contact.name })
              : t('otherUnnamed')}
        </span>
        {c.contact.mine ? (
          <button type="button" disabled={pending} onClick={() => call(withdrawContact)} className={quiet}>
            {t('withdraw')}
          </button>
        ) : null}
      </div>
    )
  }

  if (!confirming) {
    return (
      <div className="mt-[9px]">
        <button type="button" onClick={() => setConfirming(true)} className={quiet}>
          {t('ask')}
        </button>
      </div>
    )
  }

  return (
    <div className="mt-[10px] rounded-ctl border border-ink bg-sbg px-[12px] py-[11px]">
      <p className="m-0 text-[12.5px] leading-[1.55] [text-wrap:pretty]">{t('explain')}</p>
      <div className="mt-[9px] flex flex-wrap gap-[8px]">
        <button
          type="button"
          disabled={pending}
          onClick={() => call(requestContact)}
          className="h-[30px] flex-none cursor-pointer rounded-ctl border border-ink bg-ac px-[12px] text-[12px] font-bold text-ink disabled:cursor-default disabled:opacity-60"
        >
          {t('confirm')}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className={quiet}>
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}
