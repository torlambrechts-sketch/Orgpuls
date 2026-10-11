import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { callFailed, parseFailed, readFailed } from '@/lib/supabase/read'

/**
 * The people with access to an organisation, and the invitations still open. Migration
 * 0028. Both are the daglig leder's to read: `org_members` refuses anyone else, and
 * `member_invites` has a select policy for daglig leder only.
 *
 * A member's name and address are not readable through the tables — profiles are
 * self-read, and addresses live in Auth — which is why the list is a function.
 */
import { MEMBER_ROLES } from '@/lib/members/roles'
export { MEMBER_ROLES, type MemberRole } from '@/lib/members/roles'

const MemberRow = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  role: z.enum(MEMBER_ROLES),
  group_id: z.string().nullable(),
  active: z.boolean(),
  is_self: z.boolean(),
})
export type Member = z.infer<typeof MemberRow>

const MembersPayload = z.union([
  z.object({ ok: z.literal(true), members: z.array(MemberRow) }),
  z.object({ ok: z.literal(false), error: z.string() }),
])

export const getMembers = cache(async (orgId: string): Promise<Member[] | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('org_members', { p_org: orgId })
  if (callFailed('getMembers', error)) return null
  const parsed = MembersPayload.safeParse(data)
  if (parseFailed('getMembers', parsed)) return null
  return parsed.data.ok ? parsed.data.members : null
})

/** Whether this organisation issues invitations at all (0029: the shared demo does not). */
export const getMembersLocked = cache(async (orgId: string): Promise<boolean> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('members_locked', { p_org: orgId })
  if (callFailed('getMembersLocked', error)) return false
  const parsed = z.boolean().safeParse(data)
  if (parseFailed('getMembersLocked', parsed)) return false
  return parsed.data
})

const InviteRow = z.object({
  id: z.string(),
  email: z.string(),
  role: z.enum(MEMBER_ROLES),
  group_id: z.string().nullable(),
  expires_at: z.string(),
})
export type OpenInvite = z.infer<typeof InviteRow>

export const getOpenInvites = cache(async (orgId: string): Promise<OpenInvite[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('member_invites')
    .select('id, email, role, group_id, expires_at')
    .eq('org_id', orgId)
    .is('accepted_at', null)
    .order('created_at', { ascending: false })

  if (readFailed('getOpenInvites', error, data)) return []
  const parsed = z.array(InviteRow).safeParse(data)
  if (parseFailed('getOpenInvites', parsed)) return []
  return parsed.data
})

/**
 * People who signed up and found this organisation already here (0232, X-114, D-279), waiting on
 * the daglig leder. RLS gives the rows to the daglig leder only; the account behind a request is
 * not a column they can read. A request is held thirty days.
 */
const JoinRequestRow = z.object({
  id: z.string(),
  email: z.string(),
  full_name: z.string().nullable(),
  matched_by: z.enum(['org_number', 'name', 'domain']),
  company_name: z.string(),
  created_at: z.string(),
})
export type PendingJoinRequest = z.infer<typeof JoinRequestRow>

export const getJoinRequests = cache(async (orgId: string): Promise<PendingJoinRequest[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('join_requests')
    .select('id, email, full_name, matched_by, company_name, created_at')
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .gte('created_at', new Date(Date.now() - 30 * 86_400_000).toISOString())
    .order('created_at', { ascending: true })

  if (readFailed('getJoinRequests', error, data)) return []
  const parsed = z.array(JoinRequestRow).safeParse(data)
  if (parseFailed('getJoinRequests', parsed)) return []
  return parsed.data
})

/** What the page an invitation link opens may show. */
const PreviewPayload = z.union([
  z.object({
    ok: z.literal(true),
    org_name: z.string(),
    role: z.enum(MEMBER_ROLES),
    group_name: z.string().nullable(),
    email: z.string(),
    state: z.enum(['open', 'expired', 'accepted']),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
])
export type InvitePreview = z.infer<typeof PreviewPayload>

export async function getInvitePreview(token: string): Promise<InvitePreview | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('invite_preview', { p_token: token })
  if (callFailed('getInvitePreview', error)) return null
  const parsed = PreviewPayload.safeParse(data)
  if (parseFailed('getInvitePreview', parsed)) return null
  return parsed.data
}
