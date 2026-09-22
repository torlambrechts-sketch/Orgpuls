'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * Zod at the server boundary, per the security contract. The schema is deliberately
 * unhelpful about *why* a value failed: a sign-in form that distinguishes "no such
 * account" from "wrong password" is an account-enumeration oracle, so both paths
 * return the same message.
 */
const SignIn = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export type SignInState = { error?: string }

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = SignIn.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { error: 'invalid' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: 'invalid' }

  redirect('/innsikt')
}
