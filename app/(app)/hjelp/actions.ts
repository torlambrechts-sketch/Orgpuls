'use server'

import { z } from 'zod'
import { REQUEST_CATEGORIES } from '@/lib/help/request'
import { createClient } from '@/lib/supabase/server'

/**
 * The in-app help form (D-92): a ticket in the admin's queue through `submit_help_request`
 * (0051), which takes the member's organisation and role from the session and keeps only the
 * path of the page, never its query string.
 */

export type HelpResult = { ok: true; number: number } | { ok: false; problem: 'invalid' | 'rate_limited' | 'failed' }

const Input = z.object({
  category: z.enum(REQUEST_CATEGORIES),
  subject: z.string().trim().max(200),
  body: z.string().trim().min(1).max(5000),
  page: z.string().max(300),
  browser: z.string().max(400),
})

export async function sendHelpRequest(input: z.input<typeof Input>): Promise<HelpResult> {
  const parsed = Input.safeParse(input)
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const d = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('submit_help_request', {
    p_category: d.category,
    p_subject: d.subject,
    p_body: d.body,
    p_page: d.page,
    p_browser: d.browser,
  })
  if (error) return { ok: false, problem: 'failed' }
  const reply = z.object({ ok: z.boolean(), error: z.string().optional(), number: z.number().optional() }).safeParse(data)
  if (!reply.success) return { ok: false, problem: 'failed' }
  if (reply.data.ok && reply.data.number) return { ok: true, number: reply.data.number }
  return {
    ok: false,
    problem: reply.data.error === 'rate_limited' ? 'rate_limited' : reply.data.error === 'invalid' ? 'invalid' : 'failed',
  }
}
