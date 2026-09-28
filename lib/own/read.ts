import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseFailed, readFailed } from '@/lib/supabase/read'
import { getMaskLabels } from '@/lib/text/labels'
import { unmask } from '@/lib/text/mask'

/**
 * The organisation's own questions, answered (0095, D-145): the «Skala 1–5» ones as figures,
 * the «Fritekst» ones and the open field as texts. Both RPCs apply k in the database and answer
 * a closed round only: the figures to daglig leder and verneombud, the texts to the daglig leder
 * alone (a verneombud reads no single comment, 0022). For anyone else, or a round still open,
 * they refuse and this returns null. The texts arrive masked and leave here
 * with the markers resolved to «[navn]», «[avdeling]», «[sted]» (lib/text/mask.ts).
 */
const OwnResults = z.object({
  threshold: z.coerce.number(),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      text: z.string(),
      suppressed: z.boolean(),
      n: z.coerce.number().nullable(),
      mean: z.coerce.number().nullable(),
      high: z.coerce.number().nullable(),
    }),
  ),
})
export type OwnResults = z.infer<typeof OwnResults>

export const getOwnResults = cache(async (roundId: string): Promise<OwnResults | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('results_own_questions', { p_round: roundId })
  if (readFailed('results_own_questions', error, data)) return null
  if (z.object({ error: z.string() }).safeParse(data).success) return null
  const parsed = OwnResults.safeParse(data)
  if (parseFailed('results_own_questions', parsed)) return null
  return parsed.data
})

const OpenAnswers = z.union([
  z.object({ status: z.literal('insufficient_data'), threshold: z.coerce.number() }),
  z.object({
    status: z.literal('ok'),
    threshold: z.coerce.number(),
    items: z.array(
      z.object({
        key: z.string(),
        // the screening question's key for the open field, or null for an own question
        extra: z.string().nullable(),
        // an own question's words, or null for the open field (its words are a message key)
        text: z.string().nullable(),
        answers: z.array(z.string()),
      }),
    ),
  }),
])
export type OpenAnswers = z.infer<typeof OpenAnswers>

/*
 * The parse failure is logged by its path only: parseFailed never carries the values, and the
 * values here are what employees wrote (CLAUDE.md invariant 7).
 */
export const getOpenAnswers = cache(async (roundId: string): Promise<OpenAnswers | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('open_answers', { p_round: roundId })
  if (readFailed('open_answers', error, data)) return null
  if (z.object({ error: z.string() }).safeParse(data).success) return null
  const parsed = OpenAnswers.safeParse(data)
  if (parseFailed('open_answers', parsed)) return null
  if (parsed.data.status !== 'ok') return parsed.data
  const mask = await getMaskLabels()
  return { ...parsed.data, items: parsed.data.items.map((q) => ({ ...q, answers: q.answers.map((a) => unmask(a, mask)) })) }
})

/**
 * «Tiltakene etter forrige kartlegging har hatt positiv effekt» (0097, P1-7): the share who agree
 * and the mean, whole organisation, at k answers. Null when the round did not ask it.
 */
const Effect = z.union([
  z.object({ status: z.literal('insufficient_data'), threshold: z.coerce.number() }),
  z.object({
    status: z.literal('ok'),
    threshold: z.coerce.number(),
    n: z.coerce.number(),
    agree: z.coerce.number(),
    mean: z.coerce.number(),
  }),
])
export type EffectResult = z.infer<typeof Effect>

export const getEffect = cache(async (roundId: string): Promise<EffectResult | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('results_effect', { p_round: roundId })
  if (readFailed('results_effect', error, data)) return null
  if (z.object({ error: z.string() }).safeParse(data).success) return null
  const parsed = Effect.safeParse(data)
  if (parseFailed('results_effect', parsed)) return null
  return parsed.data
})
