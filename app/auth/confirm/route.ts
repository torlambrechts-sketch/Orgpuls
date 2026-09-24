import type { Route } from 'next'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * Where an Auth mail's link lands. D-65.
 *
 * The send-email hook (supabase/functions/orgpuls-auth-mail) links here with the token's
 * hash, and this verifies it on the server and sets the session cookie. A password reset
 * then opens /nytt-passord already signed in — no token in a URL fragment for a script to
 * read, and nothing for the browser to exchange.
 *
 * Everything in the query is parsed before it is used. `next` must be a path on this site:
 * a free redirect target after sign-in is an open redirect, the classic way to make a
 * phishing link look like it came from us.
 */
const Query = z.object({
  token_hash: z.string().min(8).max(300),
  type: z.enum(['recovery', 'invite', 'email']),
  next: z
    .string()
    .regex(/^\/[a-z0-9\-/]*$/i)
    .refine((p) => !p.startsWith('//'))
    .default('/innsikt'),
})

export async function GET(request: NextRequest) {
  const parsed = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) redirect('/logg-inn')

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    type: parsed.data.type,
    token_hash: parsed.data.token_hash,
  })

  if (error) {
    // the code only: the token is a credential until it expires
    console.error(`[auth] confirm refused: ${error.code ?? error.status ?? 'unknown'}`)
    // a used or expired reset link lands on the page that explains it
    if (parsed.data.type === 'recovery') redirect('/nytt-passord')
    redirect('/logg-inn')
  }

  // validated above as a path on this site
  redirect(parsed.data.next as Route)
}
