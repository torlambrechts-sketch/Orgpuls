import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { LOCALES } from '@/lib/i18n/locales'
import { setLocaleCookie } from '@/lib/i18n/server'
import { safeReturn } from '@/lib/i18n/switch'
import { createClient } from '@/lib/supabase/server'

/**
 * Choosing a language on this host, then back to the page (D-109).
 *
 * The choice is a cookie, and a cookie belongs to one host, so a choice made for another host is
 * made through this route on the host it is going to: it saves the choice there (and on the
 * profile of a signed-in user, as the in-app switch does) and redirects to the page.
 *
 * `profil=0` saves it for this browser only. The moved English host sends its readers here
 * (lib/hosts.ts toEnglish, D-275): following an old link is not choosing a language for an
 * account, so a signed-in person's saved language stays as it was.
 */
export async function GET(request: NextRequest) {
  const locale = z.enum(LOCALES).safeParse(request.nextUrl.searchParams.get('l'))
  const to = new URL(safeReturn(request.nextUrl.searchParams.get('til')), request.nextUrl)
  if (locale.success) {
    await setLocaleCookie(locale.data)
    if (request.nextUrl.searchParams.get('profil') !== '0') {
      const supabase = await createClient()
      const { data } = await supabase.auth.getUser()
      if (data.user) await supabase.schema('app').from('profiles').update({ lang: locale.data }).eq('id', data.user.id)
    }
  }
  return NextResponse.redirect(to, 303)
}
