'use server'

import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { callFailed } from '@/lib/supabase/read'
import { getInvitePreview } from '@/lib/members/read'

/**
 * Accepting an invitation (0028). The token is the capability; `accept_invite` holds every
 * rule — the right address, once, before expiry, one organisation per account — and these
 * actions only get the invitee signed in first.
 */
export type JoinState = { problem?: string }

const Verdict = z.union([
  z.object({ ok: z.literal(true) }).passthrough(),
  z.object({ ok: z.literal(false), error: z.string() }),
])

const Token = z.string().regex(/^[0-9a-f]{64}$/)

async function accept(token: string): Promise<JoinState> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('accept_invite', { p_token: token })
  if (callFailed('acceptInvite', error)) return { problem: 'failed' }
  const verdict = Verdict.safeParse(data)
  if (!verdict.success) return { problem: 'failed' }
  if (!verdict.data.ok) return { problem: verdict.data.error }
  redirect('/innsikt')
}

/**
 * Not signed in: the password either signs in to the account that already has the invited
 * address, or becomes the password of a new one. Which of the two happened is not reported
 * separately from "wrong password", so the page cannot be used to learn whether an address
 * has an account beyond what the invitation already told its holder.
 */
export async function joinWithPassword(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const token = Token.safeParse(formData.get('token'))
  if (!token.success) return { problem: 'not_found' }
  const password = z.string().min(8).max(200).safeParse(formData.get('password'))
  if (!password.success) return { problem: 'short_password' }

  const preview = await getInvitePreview(token.data)
  if (!preview) return { problem: 'failed' }
  if (!preview.ok) return { problem: 'not_found' }
  if (preview.state !== 'open') return { problem: preview.state === 'expired' ? 'expired' : 'already_accepted' }

  const supabase = await createClient()
  const signedIn = await supabase.auth.signInWithPassword({ email: preview.email, password: password.data })
  if (signedIn.error) {
    const created = await supabase.auth.signUp({ email: preview.email, password: password.data })
    // an existing address answers with an error, or — where confirmation is on — with a
    // user that has no identities; both mean the password above was wrong for it
    if (created.error || (created.data.user && created.data.user.identities?.length === 0)) {
      return { problem: 'wrong_password' }
    }
    if (!created.data.session) return { problem: 'confirm_email' }
  }

  return accept(token.data)
}

/** Already signed in with the invited address. */
export async function acceptSignedIn(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const token = Token.safeParse(formData.get('token'))
  if (!token.success) return { problem: 'not_found' }
  return accept(token.data)
}

/** Signed in as somebody else: sign out and come back to the same link. */
export async function signOutForInvite(formData: FormData): Promise<void> {
  const token = Token.safeParse(formData.get('token'))
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect(token.success ? (`/bli-med/${token.data}` as Route) : '/logg-inn')
}
