import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { callFailed, parseFailed } from '@/lib/supabase/read'
import { LogoKey } from '@/lib/org/logo'

/**
 * What a round's invitation will carry (0105, `round_send_preview`), for Måleoppsett's send
 * preview (engagement phase 2, P2.1). The same facts `dispatch_claim` puts in a job, read the
 * same way, so the preview is rendered by the renderer the dispatcher sends with.
 */
const Iso = z.string().min(1)
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const Since = z.union([
  z.object({ first: z.literal(true) }),
  z.object({
    first: z.literal(false),
    since: Iso,
    items: z.array(z.object({ title: z.string(), status: z.enum(['gjennomfort', 'pagar']) })).max(3),
    done: z.number().int().min(0),
  }),
])

const Preview = z.object({
  org: z.string(),
  lang: z.string(),
  k: z.number().int().min(5),
  status: z.enum(['planlagt', 'apen', 'lukket']),
  round: z.object({
    kind: z.string(),
    year: z.number().int(),
    pulse: z.number().int().nullable(),
    opens_at: Iso.nullable(),
    closes_at: Iso.nullable(),
  }),
  close_on: Day.nullable(),
  publish_on: Day.nullable(),
  intro: z.string().nullable(),
  intro_by: z.string().nullable(),
  org_greeting: z.object({ text: z.string(), by: z.string().nullable() }).nullable(),
  minutes: z.number().int().nullable(),
  results_shared: z.boolean(),
  since: Since.nullable(),
  logo: LogoKey,
  results_page: z.string().nullable(),
})

export type SendPreview = z.infer<typeof Preview>

export async function getSendPreview(roundId: string): Promise<SendPreview | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('round_send_preview', { p_round: roundId })
  if (callFailed('getSendPreview', error)) return null
  const parsed = Preview.safeParse(data)
  if (parseFailed('getSendPreview', parsed)) return null
  return parsed.data
}

/**
 * What a round needs before it opens (0127, `round_ready`), for the send card's check: whom the
 * invitation reaches and how, invited groups too small for any figure, the two consultations, and
 * the viewer's last test. Counts and group names only; the daglig leder's.
 */
const Ready = z.object({
  status: z.enum(['planlagt', 'apen', 'lukket']),
  mail: z.boolean(),
  sms: z.boolean(),
  k: z.number().int().min(5),
  audience: z.number().int().min(0),
  email: z.number().int().min(0),
  phone_only: z.number().int().min(0),
  neither: z.number().int().min(0),
  small_groups: z.array(z.string()),
  consultations: z.object({ verneombud_raad: z.boolean(), droftet_tillitsvalgte: z.boolean() }),
  test: z
    .object({ to: z.string(), status: z.enum(['pending', 'sending', 'sent', 'failed']), at: Iso, sent_at: Iso.nullable() })
    .nullable(),
})

export type RoundReady = z.infer<typeof Ready>

export async function getRoundReady(roundId: string): Promise<RoundReady | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('round_ready', { p_round: roundId })
  if (callFailed('getRoundReady', error)) return null
  const parsed = Ready.safeParse(data)
  if (parseFailed('getRoundReady', parsed)) return null
  return parsed.data
}
