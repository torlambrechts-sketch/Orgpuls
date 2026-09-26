import 'server-only'
import { z } from 'zod'
import { callFailed, parseFailed } from '@/lib/supabase/read'
import { createClient } from '@/lib/supabase/server'

/**
 * Employees whose address does not take mail (0053, D-97): what the provider said after a mail
 * was accepted — the address does not exist, is blocked, or complained. Only the daglig leder
 * gets rows; anyone else gets an empty list. Nothing says which round, or when during it.
 */
const Problem = z.object({
  employee_id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  channel: z.enum(['email', 'sms']),
  problem: z.enum(['hard_bounce', 'invalid', 'blocked', 'spam', 'unsubscribed']),
  day: z.string(),
})
export type AddressProblem = z.infer<typeof Problem>

export async function getAddressProblems(orgId: string): Promise<AddressProblem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('address_problems', { p_org: orgId })
  if (callFailed('getAddressProblems', error) || !data) return []
  const parsed = z.array(Problem).safeParse(data)
  if (parseFailed('getAddressProblems', parsed)) return []
  return parsed.data
}
