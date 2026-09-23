'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/org/current'
import { callFailed } from '@/lib/supabase/read'
import { MEMBER_ROLES } from '@/lib/members/roles'

/**
 * Member management on the Roller tab. Every write is one of 0028's functions, which hold
 * the rules and answer with a verdict; these actions parse the input, call, and parse the
 * verdict — the Samtaler pattern (lib/supabase/write.ts). Nothing here writes a table.
 */
const Verdict = z.union([
  z.object({ ok: z.literal(true), token: z.string().optional() }).passthrough(),
  z.object({ ok: z.literal(false), error: z.string() }),
])

export type InviteResult =
  | { status: 'idle' }
  | { status: 'invited'; link: string; email: string }
  | { status: 'problem'; problem: string }

const Invite = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  role: z.enum(MEMBER_ROLES),
  group: z.string().uuid().nullable(),
})

/** The link is built from the address the request came in on, so a preview links to itself. */
async function origin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'www.orgpuls.com'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

export async function inviteMember(_prev: InviteResult, formData: FormData): Promise<InviteResult> {
  const parsed = Invite.safeParse({
    email: formData.get('email'),
    role: formData.get('role'),
    group: formData.get('group') || null,
  })
  if (!parsed.success) return { status: 'problem', problem: 'invalid_email' }

  const org = await getCurrentOrgId()
  if (!org) return { status: 'problem', problem: 'not_allowed' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('invite_member', {
    p_org: org,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_group: parsed.data.role === 'avdelingsleder' ? parsed.data.group : null,
  })
  if (callFailed('inviteMember', error)) return { status: 'problem', problem: 'failed' }
  const verdict = Verdict.safeParse(data)
  if (!verdict.success) return { status: 'problem', problem: 'failed' }
  if (!verdict.data.ok) return { status: 'problem', problem: verdict.data.error }
  if (!verdict.data.token) return { status: 'problem', problem: 'failed' }

  revalidatePath('/oppsett')
  return { status: 'invited', link: `${await origin()}/bli-med/${verdict.data.token}`, email: parsed.data.email }
}

export type MemberResult = { ok: true } | { ok: false; problem: string }

const SetMember = z.object({
  id: z.string().uuid(),
  role: z.enum(MEMBER_ROLES),
  group: z.string().uuid().nullable(),
  active: z.boolean(),
})

export async function setMember(input: z.input<typeof SetMember>): Promise<MemberResult> {
  const parsed = SetMember.safeParse(input)
  if (!parsed.success) return { ok: false, problem: 'invalid' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('set_member', {
    p_membership: parsed.data.id,
    p_role: parsed.data.role,
    p_group: parsed.data.role === 'avdelingsleder' ? parsed.data.group : null,
    p_active: parsed.data.active,
  })
  if (callFailed('setMember', error)) return { ok: false, problem: 'failed' }
  const verdict = Verdict.safeParse(data)
  if (!verdict.success) return { ok: false, problem: 'failed' }
  if (!verdict.data.ok) return { ok: false, problem: verdict.data.error }

  revalidatePath('/oppsett')
  return { ok: true }
}

export async function revokeInvite(id: string): Promise<MemberResult> {
  const parsed = z.string().uuid().safeParse(id)
  if (!parsed.success) return { ok: false, problem: 'invalid' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('revoke_invite', { p_invite: parsed.data })
  if (callFailed('revokeInvite', error)) return { ok: false, problem: 'failed' }
  const verdict = Verdict.safeParse(data)
  if (!verdict.success) return { ok: false, problem: 'failed' }
  if (!verdict.data.ok) return { ok: false, problem: verdict.data.error }

  revalidatePath('/oppsett')
  return { ok: true }
}
