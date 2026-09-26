import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { readSupabaseEnv } from '@/lib/supabase/env'

/**
 * One-click unsubscribe (RFC 8058, D-101). A marketing mail's List-Unsubscribe header points
 * here, and a mail program that offers "Unsubscribe" POSTs `List-Unsubscribe=One-Click`
 * without the person opening anything. The token is the mail's own; the database keeps
 * only its hash. The answer is 200 either way, as the RFC expects. A GET (a person who
 * copied the address) goes to the page, which asks before it acts.
 */
const Token = z.string().regex(/^[0-9a-f]{64}$/)

export async function POST(request: NextRequest) {
  const t = Token.safeParse(request.nextUrl.searchParams.get('t'))
  if (t.success) {
    const env = readSupabaseEnv()
    if (!('problem' in env)) {
      const supabase = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } })
      await supabase.rpc('crm_unsubscribe', { p_token: t.data })
    }
  }
  return new NextResponse(null, { status: 200 })
}

export async function GET(request: NextRequest) {
  const t = request.nextUrl.searchParams.get('t') ?? ''
  const to = new URL('/avmeld', request.nextUrl)
  if (Token.safeParse(t).success) to.searchParams.set('t', t)
  return NextResponse.redirect(to, 303)
}
