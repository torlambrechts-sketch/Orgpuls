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
  email: z.string().trim().email(),
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

/**
 * "Glemt passord?".
 *
 * The answer is the same whether or not the address has an account, for the reason above:
 * this endpoint is answerable by anybody, so a truthful "no such account" would turn it
 * into a directory. Supabase's own `resetPasswordForEmail` behaves the same way, and this
 * mirrors it rather than relying on it.
 */
export type ResetState = { status: 'idle' } | { status: 'sent' } | { status: 'invalid' }

export async function requestReset(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = z.string().trim().email().safeParse(formData.get('email'))
  if (!parsed.success) return { status: 'invalid' }

  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(parsed.data)
  return { status: 'sent' }
}
