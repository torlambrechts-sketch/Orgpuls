import 'server-only'
import { headers } from 'next/headers'
import { z } from 'zod'
import { outboundBase } from '@/lib/hosts'
import { onlyOrganisation } from '@/lib/org/current'
import { createClient } from '@/lib/supabase/server'
import { callFailed, parseFailed, readFailed } from '@/lib/supabase/read'
import { slackApp, type SlackApp } from '@/supabase/functions/_shared/slack'
import { SlackStatus, type SlackWhen } from '@/lib/slack/schema'

/**
 * Slack as a channel (0185, D-205): the organisation's choices and what is true about reaching
 * people there — read, never described.
 */

/**
 * The Orgpuls Slack app's client id and secret (SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, server
 * environment), or null when either is missing. The same two are set on the dispatcher, which
 * refreshes the tokens with them. Never sent to a browser.
 */
export function slackAppFromEnv(): SlackApp | null {
  return slackApp(process.env.SLACK_CLIENT_ID, process.env.SLACK_CLIENT_SECRET)
}

export const slackConfigured = (): boolean => slackAppFromEnv() !== null

/**
 * Where Slack sends the browser back, on the host the leader is on so their session is there:
 * https://www.orgpuls.com/integrasjoner/slack/callback in production (en.orgpuls.com on the English
 * host; both are in the app's manifest), the loopback host locally, and never a preview's or a
 * spoofed Host header's (lib/hosts.ts outboundBase). The same value goes to the authorisation
 * request and to the code exchange, as Slack requires.
 */
export async function slackRedirectUri(): Promise<string> {
  const h = await headers()
  return `${outboundBase(h.get('x-forwarded-host') ?? h.get('host'), h.get('x-forwarded-proto'))}/integrasjoner/slack/callback`
}

const SettingsRow = z.object({ slack_enabled: z.boolean(), slack_when: z.enum(['paaminn', 'alle']) })
export type SlackSettings = { enabled: boolean; when: SlackWhen }

/** The organisation's Slack choices */
export async function getSlackSettings(): Promise<SlackSettings | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.schema('app').from('organizations').select('slack_enabled, slack_when').limit(2)
  if (readFailed('getSlackSettings', error, data)) return null
  const parsed = z.array(SettingsRow).safeParse(data)
  if (parseFailed('getSlackSettings', parsed)) return null
  const row = onlyOrganisation('getSlackSettings', parsed.data)
  return row ? { enabled: row.slack_enabled, when: row.slack_when } : null
}

/** The installation and, for the daglig leder, its counts (public.slack_status); null when unread */
export async function getSlackStatus(orgId: string): Promise<SlackStatus | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('slack_status', { p_org: orgId })
  if (callFailed('getSlackStatus', error)) return null
  // a non-member is answered {ok:false}; there is nothing to show then
  if (data && typeof data === 'object' && 'ok' in data && data.ok === false) return null
  const parsed = SlackStatus.safeParse(data)
  if (parseFailed('getSlackStatus', parsed)) return null
  return parsed.data
}
