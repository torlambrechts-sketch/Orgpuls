'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * Sets the password of whoever the reset link signed in. D-65.
 *
 * The same rule as registration (at least eight characters, no composition rules; see
 * app/(marketing)/registrer/actions.ts). The user is read from the session, never from the
 * form, so this can only change the password of the account the link was sent to.
 */
export type NewPasswordState = { problem?: 'tooShort' | 'mismatch' | 'failed' }

export async function setNewPassword(_prev: NewPasswordState, formData: FormData): Promise<NewPasswordState> {
  const password = z.string().min(8).max(200).safeParse(formData.get('password'))
  if (!password.success) return { problem: 'tooShort' }
  if (formData.get('repeat') !== password.data) return { problem: 'mismatch' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { problem: 'failed' }

  const { error } = await supabase.auth.updateUser({ password: password.data })
  if (error) {
    console.error(`[auth] password update refused: ${error.code ?? error.status ?? 'unknown'}`)
    return { problem: 'failed' }
  }
  redirect('/innsikt')
}
