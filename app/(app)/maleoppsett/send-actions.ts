'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { callFailed } from '@/lib/supabase/read'

/**
 * The send settings of a round (0105, engagement phase 2 P2.1): its introduction and the date
 * the results are shared with everyone. `set_round_send` decides who may (the daglig leder),
 * when (the introduction while the round is planned; the date until it closes) and what range
 * the date may take; this only parses the input and names the refusal.
 */
const Send = z.object({
  roundId: z.string().uuid(),
  intro: z.string().max(600),
  publishOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
})

const Result = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ error: z.enum(['closed', 'too_long', 'opened', 'publish_range']) }),
])

export type SendProblem = 'closed' | 'too_long' | 'opened' | 'publish_range' | 'denied'

export async function saveRoundSend(
  values: z.infer<typeof Send>,
): Promise<{ ok: true } | { ok: false; problem: SendProblem }> {
  const v = Send.safeParse(values)
  if (!v.success) return { ok: false, problem: 'denied' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('set_round_send', {
    p_round: v.data.roundId,
    p_intro: v.data.intro,
    p_publish_on: v.data.publishOn,
  })
  if (callFailed('saveRoundSend', error)) return { ok: false, problem: 'denied' }
  const parsed = Result.safeParse(data)
  if (!parsed.success) return { ok: false, problem: 'denied' }
  if ('error' in parsed.data) return { ok: false, problem: parsed.data.error }
  revalidatePath('/maleoppsett')
  return { ok: true }
}
