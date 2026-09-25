import 'server-only'
import { cookies } from 'next/headers'
import { isLocale, LOCALE_COOKIE, type Locale } from './locales'
import type { createClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createClient>>

const YEAR = 60 * 60 * 24 * 365

export async function setLocaleCookie(locale: Locale): Promise<void> {
  ;(await cookies()).set(LOCALE_COOKIE, locale, { path: '/', maxAge: YEAR, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
}

/**
 * At sign-in: the language saved on the profile, or else the organisation's default when no
 * language was chosen on this device. A choice already made on the device is kept and
 * saved to a profile that has none, so choosing English before signing in sticks. D-96.
 */
export async function restoreLocale(supabase: Supabase): Promise<void> {
  const { data: user } = await supabase.auth.getUser()
  if (!user.user) return
  const jar = await cookies()
  const chosen = jar.get(LOCALE_COOKIE)?.value
  const { data: profile } = await supabase.schema('app').from('profiles').select('lang').eq('id', user.user.id).maybeSingle()
  const saved = (profile as { lang?: string | null } | null)?.lang
  if (isLocale(saved)) {
    await setLocaleCookie(saved)
    return
  }
  if (isLocale(chosen)) {
    await supabase.schema('app').from('profiles').update({ lang: chosen }).eq('id', user.user.id)
    return
  }
  const { data: org } = await supabase.schema('app').from('memberships').select('organizations(default_lang)').eq('user_id', user.user.id).eq('active', true).limit(1).maybeSingle()
  const fallback = (org as { organizations?: { default_lang?: string } | null } | null)?.organizations?.default_lang
  if (isLocale(fallback)) await setLocaleCookie(fallback)
}
