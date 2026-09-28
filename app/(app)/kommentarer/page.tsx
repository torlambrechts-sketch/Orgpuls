import { countView } from '@/lib/analytics/product'
import type { Route } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { Kommentarer, type CommentItem, type RoundChip } from '@/components/kommentarer/Kommentarer'
import { ResultaterShell } from '@/components/resultater/ResultaterShell'
import { getConversations, toneOf } from '@/lib/conversations/read'
import { getOpenAnswers } from '@/lib/own/read'
import { OpenAnswers } from '@/components/kommentarer/OpenAnswers'
import { getMeasures } from '@/lib/measures/read'
import { getViewerRole } from '@/lib/org/read'
import { roundNamer } from '@/lib/rounds/design-name'
import { getRoundRows } from '@/lib/rounds/read'
import { getUnansweredCount } from '@/lib/shell/read'

/**
 * Kommentarer — design 3 (bundle `v2IsKom`, v3 2640-2720; logic in `v2()`). D-73.
 *
 * Every comment from every round, under Resultater's frame. One RPC carries them:
 * `public.conversations()` has applied k per thread and stripped the group before anything
 * reaches this file (0018), so there is nothing here to withhold. The filters are
 * presentation over what survived, and the group is not one of them (D2): a comment never
 * travels with its group, so there is no "Gruppe" row and no group on a comment.
 *
 * A comment waits for a reply when nobody has answered it, or when the person who wrote it
 * has answered back. Its age is counted from the last thing they wrote.
 */
export const dynamic = 'force-dynamic'

const DAY = 86_400_000

const Params = z.object({
  maling: z.string().uuid().optional().catch(undefined),
  faktor: z
    .string()
    .regex(/^[a-z]+$/)
    .optional()
    .catch(undefined),
  status: z.enum(['alle', 'ubesvart', 'besvart']).optional().catch(undefined),
})

export default async function KommentarerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = await searchParams
  const params = Params.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])))
  const t = await getTranslations()
  const locale = await getLocale()

  const [rows, conversations, role, unanswered, measures] = await Promise.all([
    getRoundRows(),
    getConversations(null),
    getViewerRole(),
    getUnansweredCount(),
    getMeasures(),
    countView('comments_viewed'),
  ])

  const name = roundNamer(t, locale)
  /*
   * The open answers (0095, D-145) of one closed round: the one the address names, else the
   * latest. Only a daglig leder is answered (open_answers refuses anyone else), so for other
   * roles this is null and the section is absent.
   */
  const openRound = rows.find((r) => r.id === params.maling && r.status === 'lukket') ?? null
  const byId = new Map(rows.map((r) => [r.id, r]))
  const latestClosed = rows
    .filter((r) => r.status === 'lukket')
    .sort((a, b) => (b.closesAt ?? '').localeCompare(a.closesAt ?? ''))[0]
  const openFor = openRound ?? latestClosed ?? null
  const open = role === 'daglig_leder' && openFor ? await getOpenAnswers(openFor.id) : null

  const dateOf = (iso: string) =>
    new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Oslo', day: 'numeric', month: 'short', year: 'numeric' })
      .format(new Date(iso))
      .replace(/(\p{L})\./u, '$1')

  const now = Date.now()
  const items: CommentItem[] = (conversations?.items ?? []).map((c) => {
    const last = c.messages.at(-1)
    const needsReply = c.state !== 'lukket' && (!last || last.author === 'ansatt')
    const since = last?.author === 'ansatt' ? last.sentHour : c.openedHour
    const round = byId.get(c.roundId)
    const tone = toneOf(c.answerValue)
    return {
      id: c.id,
      factorKey: c.factorKey,
      roundId: c.roundId,
      roundTitle: round ? name(round).title : String(c.roundYear),
      // the design dates the comments of earlier rounds; the current round's go without
      date: c.roundId === latestClosed?.id ? null : dateOf(c.openedHour),
      tone: tone === 'noytral' ? 'blandet' : tone,
      value: c.answerValue,
      text: c.opening,
      thread: c.messages.map((m) => ({ author: m.author, body: m.body })),
      needsReply,
      closed: c.state === 'lukket',
      flagged: c.flaggedVarsel,
      waitingDays: Math.max(0, Math.floor((now - new Date(since).getTime()) / DAY)),
      openedHour: c.openedHour,
      contact: c.contact,
    }
  })

  // the rounds that have comments, newest first
  const rounds: RoundChip[] = [...new Set(items.map((i) => i.roundId))]
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => (b.closesAt ?? b.opensAt ?? '').localeCompare(a.closesAt ?? a.opensAt ?? ''))
    .map((r) => ({ id: r.id, title: name(r).title }))

  return (
    <ResultaterShell
      kicker={t('kommentarer.kicker')}
      title={t('kommentarer.title')}
      active="comments"
      resultHref={'/resultater' as Route}
      unanswered={unanswered}
      planCount={measures.filter((m) => m.step === 'besluttet' || m.step === 'pagar').length}
    >
      {role === 'verneombud' ? (
        // 0022: a verneombud keeps every figure and loses the read of single comments,
        // which they could never answer; the screen says so rather than showing an empty list
        <div className="rounded-note border border-dashed border-rule px-[22px] py-[20px] text-[13px] leading-[1.55] text-mut">
          {t('kommentarer.notYours')}
        </div>
      ) : (
        <Kommentarer
          items={items}
          rounds={rounds}
          // styling only; reply_to_thread checks the role itself against auth.uid()
          canReply={role === 'daglig_leder' || role === 'avdelingsleder'}
          initial={{
            round: rounds.some((r) => r.id === params.maling) ? params.maling! : 'alle',
            factor: params.faktor && items.some((i) => i.factorKey === params.faktor) ? params.faktor : null,
            status: params.status ?? 'alle',
          }}
        />
      )}
      {/* only when somebody wrote: a round without texts keeps the design's screen as it is */}
      {open && openFor && open.status === 'ok' && open.items.some((q) => q.answers.length) ? (
        <OpenAnswers data={{ ...open, items: open.items.filter((q) => q.answers.length) }} round={name(openFor).title} />
      ) : null}
    </ResultaterShell>
  )
}
