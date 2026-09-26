import 'server-only'
import { headers } from 'next/headers'
import type { createClient } from '@/lib/supabase/server'

/**
 * Where the signup came from (D-91, D-104). The browser sends nothing: the database reads
 * the first and last touch from today's site events under the visitor hash that this
 * request's IP address and user agent make, and stores neither (0059). A signup never fails
 * for want of attribution, so nothing here can refuse one.
 */
export async function recordSource(supabase: Awaited<ReturnType<typeof createClient>>): Promise<void> {
  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || ''
  await supabase.rpc('record_signup_source', { p_ip: ip.slice(0, 64), p_ua: (h.get('user-agent') ?? '').slice(0, 400) })
}
