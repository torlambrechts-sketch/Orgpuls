import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { LOCALES } from '@/lib/i18n/locales'
import { setLocaleCookie } from '@/lib/i18n/server'
import { safeReturn } from '@/lib/i18n/switch'
import { createClient } from '@/lib/supabase/server'

/**
 * Choosing a language on this host, then back to the page (D-109).
 *
 * The choice is a cookie, and a cookie belongs to one host. The public site's switch links
 * across hosts (D-98): pressing NO on en.orgpuls.com, or on www when English was chosen
 * there before, went to www and found the old English choice still in its cookie, so the
 * page stayed English. The switch now goes through this route on the host it is going to,
 * which saves the choice there (and on the profile of a signed-in user, as the in-app
 * switch does) and redirects to the page.
 */
export async function GET(request: NextRequest) {
  const locale = z.enum(LOCALES).safeParse(request.nextUrl.searchParams.get('l'))
  const to = new URL(safeReturn(request.nextUrl.searchParams.get('til')), request.nextUrl)
  if (locale.success) {
    await setLocaleCookie(locale.data)
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    if (data.user) await supabase.schema('app').from('profiles').update({ lang: locale.data }).eq('id', data.user.id)
  }
  return NextResponse.redirect(to, 303)
}
