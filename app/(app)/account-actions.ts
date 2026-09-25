'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Sign out from the account menu. Ends this browser's session only (Supabase's `local`
 * scope), so being signed in on another device is not affected, and lands on the sign-in
 * page, which is public.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/logg-inn')
}
