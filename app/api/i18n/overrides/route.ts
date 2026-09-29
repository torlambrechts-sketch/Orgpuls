import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { readSupabaseEnv } from '@/lib/supabase/env'

/**
 * The approved bokmål and English texts from admin › Translations (0101, 0109), for the weekly
 * fold-back (scripts/i18n/fold-overrides.mjs, X-090) to write into messages/. The same public data
 * public.message_overrides gives anyone, and that the site shows on its pages: approved text and
 * the hash of the file text it replaced, nothing else. Served here so the fold needs no key of its
 * own in GitHub. A failed read answers 502, never an empty list that would read as «nothing to fold».
 */
export const dynamic = 'force-dynamic'

const Flat = z.record(z.string(), z.union([z.string(), z.object({ text: z.string(), file: z.string().nullable() })]))

export async function GET() {
  const env = readSupabaseEnv()
  if ('problem' in env) return NextResponse.json({ error: 'unavailable' }, { status: 502 })
  const db = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } })
  const [no, en] = await Promise.all([db.rpc('message_overrides', { p_locale: 'no' }), db.rpc('message_overrides', { p_locale: 'en' })])
  const n = Flat.safeParse(no.data)
  const e = Flat.safeParse(en.data)
  if (no.error || en.error || !n.success || !e.success) return NextResponse.json({ error: 'unavailable' }, { status: 502 })
  return NextResponse.json({ no: n.data, en: e.data }, { headers: { 'cache-control': 'no-store' } })
}
