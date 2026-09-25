import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { readSupabaseEnv } from '@/lib/supabase/env'

/**
 * The public site's analytics beacon (D-91, 0050). It passes the request's IP address and
 * user agent to `track_web_event`, which turns them into a hash with the day's salt, drops
 * bots and paths it must not record, and stores neither. The answer is always 204: a beacon
 * has nobody to tell, and a different answer would tell a prober what was kept.
 */
const Body = z.object({
  k: z.enum(['view', 'cta']),
  p: z.string().min(1).max(200),
  r: z.string().max(253).optional(),
  u: z.record(z.string().max(20), z.string().max(200)).optional(),
  l: z.string().max(40).optional(),
})

const done = () => new NextResponse(null, { status: 204 })

export async function POST(request: NextRequest) {
  // a page on another site may not post views for this one
  const origin = request.headers.get('origin')
  if (origin) {
    try {
      if (new URL(origin).host !== request.headers.get('host')) return done()
    } catch {
      return done()
    }
  }
  const text = await request.text()
  if (text.length > 2000) return done()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return done()
  }
  const body = Body.safeParse(json)
  if (!body.success) return done()

  const env = readSupabaseEnv()
  if ('problem' in env) return done()
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || ''
  const supabase = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } })
  await supabase.rpc('track_web_event', {
    p_ip: ip,
    p_ua: request.headers.get('user-agent') ?? '',
    p_kind: body.data.k,
    p_path: body.data.p,
    p_referrer: body.data.r ?? null,
    p_utm: body.data.u ?? {},
    p_label: body.data.l ?? null,
  })
  return done()
}
