'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { restoreLocale } from '@/lib/i18n/server'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'
import { authReturn } from '@/lib/auth/return'
import { completePendingSignup } from '@/lib/signup/pending'
import { myJoinRequest } from '@/lib/signup/organisation'

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

  // an account confirmed on another device signs in here first: its organisation is made now (D-200),
  // or the request to join it is filed where the company is already here (0232, D-279)
  const made = await completePendingSignup(supabase)
  if (made.kind === 'created') redirect('/registrer?ferdig=1' as Route)
  if (made.kind === 'requested') redirect('/registrer?venter=1' as Route)
  if (made.kind === 'failed') redirect(`/registrer?feil=${made.reason}` as Route)

  // somebody still waiting for a daglig leder to let them in is told so, not shown an empty product
  if (!(await hasMembership(supabase)) && (await myJoinRequest(supabase))) redirect('/registrer?venter=1' as Route)

  // the language saved on the profile, or the organisation's (D-96)
  await restoreLocale(supabase)
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
  // the link comes back to the site it was asked for on, under its name (D-275)
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: (await authReturn()).redirectTo })
  return { status: 'sent' }
}

/** Whether the signed-in account belongs to an organisation: a request is only waited on by one that does not */
async function hasMembership(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const { data: user } = await supabase.auth.getUser()
  if (!user.user) return false
  const { data } = await supabase.schema('app').from('memberships').select('org_id').eq('user_id', user.user.id).eq('active', true).limit(1)
  return Array.isArray(data) && data.length > 0
}
