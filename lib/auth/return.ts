import 'server-only'
import { headers } from 'next/headers'
import { getLocale } from 'next-intl/server'
import { outboundBase } from '@/lib/hosts'

/**
 * What an Auth mail needs to know about where it was asked for (UK-G, D-275), passed with a sign-up,
 * an invitation's sign-up and a request for a new password:
 *
 *   redirectTo   the site's own address to come back to. Auth holds it to its allow list and hands
 *                it to the send-email hook, which takes the link's base, the brand and, for an
 *                account that names no language, the language from it (supabase/functions/_shared/
 *                mail.ts authSite): a sign-up on Empvibe's site is confirmed on it, under its name.
 *   lang         the language the mail is written in: bokmål on a Norwegian page, English on any
 *                other, the two languages the Auth mail's catalogue has.
 */
export async function authReturn(): Promise<{ redirectTo: string; lang: 'no' | 'en' }> {
  const h = await headers()
  const base = outboundBase(h.get('x-forwarded-host') ?? h.get('host'), h.get('x-forwarded-proto'))
  return { redirectTo: `${base}/auth/confirm`, lang: (await getLocale()) === 'no' ? 'no' : 'en' }
}
