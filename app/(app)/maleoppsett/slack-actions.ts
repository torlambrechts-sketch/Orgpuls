'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { writeFailed } from '@/lib/supabase/write'
import type { SetupActionResult } from './actions'

/**
 * One round's Slack rule (rounds.slack_when, 0185, D-205): null follows the organisation's. Saved
 * as it is picked, like the round's SMS rule (saveRoundDelivery); only while the round is planned —
 * the database fixes it once the round has opened (round_slack_when_fixed) — and the column grant
 * admits nobody else's write.
 */
const Values = z.object({
  roundId: z.string().uuid(),
  slackWhen: z.enum(['paaminn', 'alle']).nullable(),
})

export async function saveRoundSlack(values: z.infer<typeof Values>): Promise<SetupActionResult> {
  const v = Values.safeParse(values)
  if (!v.success) return { ok: false, problem: 'invalid' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('rounds')
    .update({ slack_when: v.data.slackWhen })
    .eq('id', v.data.roundId)
    .eq('status', 'planlagt')
    .select('id')
  if (writeFailed('saveRoundSlack', error, data)) return { ok: false, problem: 'denied' }
  revalidatePath('/maleoppsett')
  return { ok: true }
}
