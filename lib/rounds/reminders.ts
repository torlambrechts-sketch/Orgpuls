import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { callFailed } from '@/lib/supabase/read'

/**
 * What the Deltakelse card says about reminders while a round is open (0133): how many the
 * round has sent from every source — the ladder, the day before, the extension, the leader —
 * when the last went, the two it may send, and N, the round's outstanding invitations.
 *
 * N is one count for the whole round, never a group's, and the server withholds it (null) when
 * fewer than k were asked in the whole round (D-123's rule for a group). There is no reader for
 * who has not answered, here or anywhere.
 */
const Status = z.object({
  open: z.boolean(),
  sent: z.number().int().min(0),
  last_at: z.string().nullable(),
  max: z.number().int().min(1),
  outstanding: z.number().int().min(0).nullable(),
})

export interface ReminderStatus {
  sent: number
  lastAt: string | null
  max: number
  outstanding: number | null
}

export async function getReminderStatus(roundId: string): Promise<ReminderStatus | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('reminder_status', { p_round: roundId })
  if (callFailed('reminder_status', error)) return null
  const parsed = Status.safeParse(data)
  // a status that could not be read is not a zero
  if (!parsed.success || !parsed.data.open) return null
  const s = parsed.data
  return { sent: s.sent, lastAt: s.last_at, max: s.max, outstanding: s.outstanding }
}
