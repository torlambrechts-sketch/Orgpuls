import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * Into the demo (0094, D-143), once /auth/confirm has signed the visitor in from their link.
 * demo_enter makes their copy the first time, a fresh one when the last is a day old, and
 * otherwise leaves it as they left it. Somebody with a real organisation goes to it instead.
 */
const Reply = z.object({ ok: z.boolean(), state: z.string().optional(), error: z.string().optional() })

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('demo_enter')
  if (error) {
    console.error(`[demo] enter refused: ${error.code ?? 'unknown'}`)
    redirect('/demo?feil=failed' as Route)
  }
  const r = Reply.safeParse(data)
  if (!r.success) redirect('/demo?feil=failed' as Route)
  if (r.data.ok) redirect('/innsikt')
  if (r.data.error === 'not_signed_in') redirect('/demo' as Route)
  redirect(`/demo?feil=${r.data.error === 'closed' ? 'closed' : 'failed'}` as Route)
}
