import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPulseNumbers } from '@/lib/rounds/read'
import { callFailed, parseFailed } from '@/lib/supabase/read'

/**
 * Reading conversations.
 *
 * An RPC, not a table read — `app.comment_threads` and `app.thread_messages` have RLS
 * with no policy and no grant, the same shape as `app.responses` and `app.answers`, so
 * `public.conversations()` is the only way anything leaves. What it applies before
 * returning anything is in migration 0018: a thread whose group did not clear
 * `app.k_threshold()` is absent, and the group never travels with the comment that is
 * released.
 *
 * Nothing in this file re-derives either of those. It parses what the server decided.
 * A second opinion about k on this side would eventually disagree with the database's,
 * and the one in the database is the one that is enforced.
 *
 * Rows are parsed rather than cast for the reason lib/results/read.ts gives: the shape
 * of a jsonb return is not checked by TypeScript, and a field that silently changed name
 * would become `undefined` on a screen rather than an error.
 */
const STATES = ['venter', 'dialog', 'lukket'] as const
export type ThreadState = (typeof STATES)[number]

const Message = z.object({
  author: z.enum(['ansatt', 'leder']),
  body: z.string(),
  sent_hour: z.string(),
})

const Thread = z.object({
  id: z.string(),
  factor_key: z.string(),
  state: z.enum(STATES),
  flagged_varsel: z.boolean(),
  opened_hour: z.string(),
  round_id: z.string(),
  round_kind: z.string(),
  round_year: z.coerce.number(),
  /** 1..5 on the statement the comment hangs on; null if that answer is gone */
  answer_value: z.number().nullable(),
  opening: z.string(),
  messages: z.array(Message),
})

const Payload = z.object({
  threshold: z.coerce.number(),
  threads: z.array(Thread),
})

const NotAvailable = z.object({ error: z.literal('not_available') })

export interface ConversationMessage {
  author: 'ansatt' | 'leder'
  body: string
  sentHour: string
}

export interface Conversation {
  id: string
  factorKey: string
  state: ThreadState
  /** marked by a person as a possible varsel under aml. kap. 2A — never inferred */
  flaggedVarsel: boolean
  openedHour: string
  roundId: string
  roundKind: string
  roundYear: number
  roundPulseNo: number | null
  answerValue: number | null
  opening: string
  messages: ConversationMessage[]
  /** whole days since it was opened, in the organisation's own zone */
  waitingDays: number
}

export interface Conversations {
  threshold: number
  items: Conversation[]
}

/**
 * Null means "nothing to show", never "not found" — the RPC merges the no-membership and
 * nothing-cleared-k branches on purpose, and a caller that distinguished them would hand
 * back the oracle the k gate exists to remove.
 */
export async function getConversations(roundId?: string | null): Promise<Conversations | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('conversations', { p_round: roundId ?? null })
  if (callFailed('getConversations', error)) return null
  if (NotAvailable.safeParse(data).success) return null

  const parsed = Payload.safeParse(data)
  if (parseFailed('getConversations', parsed)) return null

  const pulses = await getPulseNumbers()
  const now = Date.now()
  return {
    threshold: parsed.data.threshold,
    items: parsed.data.threads.map((t) => ({
      id: t.id,
      factorKey: t.factor_key,
      state: t.state,
      flaggedVarsel: t.flagged_varsel,
      openedHour: t.opened_hour,
      roundId: t.round_id,
      roundKind: t.round_kind,
      roundYear: t.round_year,
      roundPulseNo: pulses.get(t.round_id) ?? null,
      answerValue: t.answer_value,
      opening: t.opening,
      messages: t.messages.map((m) => ({
        author: m.author,
        body: m.body,
        sentHour: m.sent_hour,
      })),
      // whole days, floored: "venter 6 dager" should not become 7 at teatime
      waitingDays: Math.max(
        0,
        Math.floor((now - new Date(t.opened_hour).getTime()) / 86_400_000),
      ),
    })),
  }
}

/**
 * The design's tone chip, from the answer the comment hangs on.
 *
 * Not sentiment analysis of the text — that would be a guess about what somebody meant,
 * printed as a label next to their own words. It is the value they gave the statement:
 * 1 or 2 is the low end the comment field appears under, 4 or 5 the high end, 3 neither.
 */
export function toneOf(value: number | null): 'negativ' | 'noytral' | 'positiv' | null {
  if (value === null) return null
  if (value <= 2) return 'negativ'
  if (value >= 4) return 'positiv'
  return 'noytral'
}

/* -------------------------------------------------------------- "Hva de skrev" */

const Theme = z.object({
  key: z.string(),
  comments: z.coerce.number(),
  people: z.coerce.number(),
  low: z.coerce.number(),
  mid: z.coerce.number(),
  high: z.coerce.number(),
})

const ThemesPayload = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    n: z.coerce.number(),
    threshold: z.coerce.number(),
    wrote: z.coerce.number(),
    themes: z.array(Theme),
  }),
  z.object({ status: z.literal('insufficient_data'), n: z.coerce.number(), threshold: z.coerce.number() }),
])

export type CommentThemes = z.infer<typeof ThemesPayload>

/**
 * How many wrote, and which factors k or more people wrote about — counts only, from
 * `public.comment_themes` (0030). Null is every refusal and every failure, as for
 * `getConversations`: the RPC does not say which, on purpose.
 */
export async function getCommentThemes(roundId: string): Promise<CommentThemes | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('comment_themes', { p_round: roundId })
  if (callFailed('getCommentThemes', error)) return null
  if (NotAvailable.safeParse(data).success) return null
  const parsed = ThemesPayload.safeParse(data)
  if (parseFailed('getCommentThemes', parsed)) return null
  return parsed.data
}
