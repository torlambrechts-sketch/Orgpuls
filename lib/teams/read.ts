import 'server-only'
import { z } from 'zod'
import { onlyOrganisation } from '@/lib/org/current'
import { createClient } from '@/lib/supabase/server'
import { callFailed, parseFailed, readFailed } from '@/lib/supabase/read'

/**
 * Teams as a channel (0176, D-203): the organisation's choices, and what is true about reaching
 * people there — read, never described.
 */
export type TeamsWhen = 'mangler' | 'paaminn' | 'alle'
export type TeamsSettings = { enabled: boolean; when: TeamsWhen }

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * Whether this deployment has an Orgpuls bot for Teams: its Microsoft App ID (TEAMS_BOT_APP_ID,
 * server environment). The same id and the bot's credential are set on the edge functions; without
 * it there is no app to install and nothing can be sent in Teams.
 */
export function teamsBotConfigured(): boolean {
  return GUID.test((process.env.TEAMS_BOT_APP_ID ?? '').trim().toLowerCase())
}

const SettingsRow = z.object({ teams_enabled: z.boolean(), teams_when: z.enum(['mangler', 'paaminn', 'alle']) })

/** The organisation's Teams choices */
export async function getTeamsSettings(): Promise<TeamsSettings | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.schema('app').from('organizations').select('teams_enabled, teams_when').limit(2)
  if (readFailed('getTeamsSettings', error, data)) return null
  const parsed = z.array(SettingsRow).safeParse(data)
  if (parseFailed('getTeamsSettings', parsed)) return null
  const row = onlyOrganisation('getTeamsSettings', parsed.data)
  return row ? { enabled: row.teams_enabled, when: row.teams_when } : null
}

const n = z.number().int().nonnegative()
const Status = z.object({
  tenant_bound: z.boolean(),
  active: n,
  with_object_id: n,
  with_conversation: n,
  blocked: n,
  unreachable: n,
  last_problem_day: z.string().nullable(),
  sent_30d: n,
})
export type TeamsStatus = z.infer<typeof Status>

/** Counts for the daglig leder (public.teams_status); null for anyone else, or when unread */
export async function getTeamsStatus(orgId: string): Promise<TeamsStatus | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('teams_status', { p_org: orgId })
  if (callFailed('getTeamsStatus', error) || data === null) return null
  const parsed = Status.safeParse(data)
  if (parseFailed('getTeamsStatus', parsed)) return null
  return parsed.data
}
