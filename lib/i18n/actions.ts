'use server'

import { z } from 'zod'
import { LOCALES } from './locales'
import { setLocaleCookie } from './server'
import { createClient } from '@/lib/supabase/server'

/**
 * The language switch (D-96): the choice is a cookie, so it holds on this device before
 * anyone signs in; for a signed-in user it is also saved on their profile, so it follows
 * them to another device. RLS lets a user write only their own profile row.
 */
export async function setLanguage(value: string): Promise<{ ok: boolean }> {
  const parsed = z.enum(LOCALES).safeParse(value)
  if (!parsed.success) return { ok: false }
  await setLocaleCookie(parsed.data)
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (data.user) await supabase.schema('app').from('profiles').update({ lang: parsed.data }).eq('id', data.user.id)
  return { ok: true }
}
