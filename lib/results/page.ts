import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { LogoKey } from '@/lib/org/logo'
import { createClient } from '@/lib/supabase/server'
import { parseFailed, readFailed } from '@/lib/supabase/read'
import { getMaskLabels } from '@/lib/text/labels'
import { unmask } from '@/lib/text/mask'

/**
 * The page «Dette sa dere, dette gjør vi» (0100, P1-3, D-151): one closed round, read by anyone
 * holding its link — anon, as the respondent page is. public.round_page applies k in the
 * database and answers for the whole organisation only; a link that is unknown, still open or
 * turned off answers `not_available`, and this returns null. A measure's title arrives with any
 * employee's name masked and leaves here with the marker resolved to «[navn]».
 */
const Band = z.enum(['lav', 'middels', 'hoy'])
const Step = z.enum(['besluttet', 'pagar', 'gjennomfort', 'effekt_malt', 'lukket'])

const RoundPage = z.object({
  status: z.enum(['ok', 'insufficient_data']),
  org: z.string(),
  // the organisation's logo by its address (0104)
  logo: LogoKey,
  round: z.object({
    kind: z.enum(['grunnlinje', 'puls']),
    year: z.coerce.number(),
    opens_at: z.string().nullable(),
    closes_at: z.string().nullable(),
  }),
  threshold: z.coerce.number(),
  // null when fewer than k answered: no figure there, the count included (0129, AUD-22)
  asked: z.coerce.number().nullable(),
  answered: z.coerce.number().nullable(),
  index: z.coerce.number().nullable(),
  band: Band.nullable(),
  factors: z.array(z.object({ key: z.string(), sort_order: z.coerce.number(), index: z.coerce.number(), band: Band })),
  measures: z.array(
    z.object({
      title: z.string(),
      factor: z.string().nullable(),
      step: Step,
      due: z.string().nullable(),
      done: z.string().nullable(),
    }),
  ),
})
export type RoundPage = z.infer<typeof RoundPage>
export type RoundPageStep = z.infer<typeof Step>

const SLUG = /^[A-Za-z0-9_-]{16}$/

export const getRoundPage = cache(async (slug: string): Promise<RoundPage | null> => {
  if (!SLUG.test(slug)) return null
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('round_page', { p_slug: slug })
  if (readFailed('round_page', error, data)) return null
  if (z.object({ error: z.string() }).safeParse(data).success) return null
  const parsed = RoundPage.safeParse(data)
  if (parseFailed('round_page', parsed)) return null
  const labels = await getMaskLabels()
  return { ...parsed.data, measures: parsed.data.measures.map((m) => ({ ...m, title: unmask(m.title, labels) })) }
})

/**
 * The daglig leder's view of a round's page (Resultater): its link, whether it is shown, and the
 * day it opens to employees (0105: `results_publish_on`, which also holds their results notice)
 */
const Share = z.object({
  share_slug: z.string().regex(SLUG),
  results_page: z.boolean(),
  results_publish_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
})
export type RoundShare = z.infer<typeof Share>

export const getRoundShare = cache(async (roundId: string): Promise<RoundShare | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.schema('app').from('rounds').select('share_slug, results_page, results_publish_on').eq('id', roundId).maybeSingle()
  if (readFailed('rounds.share_slug', error, data)) return null
  const parsed = Share.safeParse(data)
  if (parseFailed('rounds.share_slug', parsed)) return null
  return parsed.data
})
