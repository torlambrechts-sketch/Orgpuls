'use server'

import type { Route } from 'next'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getCurrentOrgId } from '@/lib/org/current'
import { createClient } from '@/lib/supabase/server'
import { callFailed, parseFailed } from '@/lib/supabase/read'
import { writeFailed } from '@/lib/supabase/write'
import { getSlackStatus, slackAppFromEnv, slackRedirectUri } from '@/lib/slack/read'
import { ConnectStart, SimpleResult } from '@/lib/slack/schema'
import { authorizeUrl } from '@/supabase/functions/_shared/slack'

/**
 * The Slack screen's writes (0185, D-205).
 *
 * Connecting asks the database for a single-use nonce (slack_connect_start: the daglig leder, not
 * a demo), then sends the browser to Slack's authorisation page with it as `state`. The answer
 * comes back to /integrasjoner/slack/callback, where slack_connect_complete decides. Disconnecting
 * and asking for a new match are the daglig leder's alone, as the database checks; the switch and
 * the rule are the organisation row's (org_update: the daglig leder only), and Slack cannot be
 * switched on without a working installation.
 */
const SCREEN = '/integrasjoner/slack'

export async function startSlackConnect(): Promise<void> {
  const app = slackAppFromEnv()
  if (!app) redirect(`${SCREEN}?feil=not_configured` as Route)
  const orgId = await getCurrentOrgId()
  if (!orgId) redirect(`${SCREEN}?feil=not_allowed` as Route)

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('slack_connect_start', { p_org: orgId })
  if (callFailed('startSlackConnect', error)) redirect(`${SCREEN}?feil=failed` as Route)
  const parsed = ConnectStart.safeParse(data)
  if (parseFailed('startSlackConnect', parsed)) redirect(`${SCREEN}?feil=failed` as Route)
  if (!parsed.data.ok) redirect(`${SCREEN}?feil=${parsed.data.error}` as Route)

  redirect(authorizeUrl(app.clientId, await slackRedirectUri(), parsed.data.nonce) as never)
}

export async function disconnectSlack(): Promise<void> {
  const orgId = await getCurrentOrgId()
  if (!orgId) redirect(`${SCREEN}?feil=not_allowed` as Route)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('slack_disconnect', { p_org: orgId })
  if (callFailed('disconnectSlack', error)) redirect(`${SCREEN}?feil=failed` as Route)
  const parsed = SimpleResult.safeParse(data)
  if (parseFailed('disconnectSlack', parsed)) redirect(`${SCREEN}?feil=failed` as Route)
  if (!parsed.data.ok) redirect(`${SCREEN}?feil=${parsed.data.error}` as Route)
  revalidatePath(SCREEN)
  revalidatePath('/integrasjoner')
  revalidatePath('/oppsett')
  redirect(`${SCREEN}?frakoblet=1` as Route)
}

export type SlackResult = { ok: true } | { ok: false; problem: 'invalid' | 'denied' | 'noOrg' | 'notReady' }

export async function requestSlackSync(): Promise<SlackResult> {
  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, problem: 'noOrg' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('slack_request_sync', { p_org: orgId })
  if (callFailed('requestSlackSync', error)) return { ok: false, problem: 'denied' }
  const parsed = SimpleResult.safeParse(data)
  if (parseFailed('requestSlackSync', parsed)) return { ok: false, problem: 'denied' }
  if (!parsed.data.ok) return { ok: false, problem: parsed.data.error === 'not_connected' ? 'notReady' : 'denied' }
  revalidatePath(SCREEN)
  return { ok: true }
}

const Slack = z.object({
  enabled: z.enum(['true', 'false']),
  when: z.enum(['paaminn', 'alle']),
})

/** On or off, and when (organizations.slack_enabled / slack_when) */
export async function saveSlack(formData: FormData): Promise<SlackResult> {
  const parsed = Slack.safeParse({ enabled: formData.get('enabled'), when: formData.get('when') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, problem: 'noOrg' }

  const enabled = parsed.data.enabled === 'true'
  if (enabled) {
    const status = await getSlackStatus(orgId)
    if (!status?.connected || !status.working) return { ok: false, problem: 'notReady' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('organizations')
    .update({ slack_enabled: enabled, slack_when: parsed.data.when })
    .eq('id', orgId)
    .select('id')

  if (writeFailed('saveSlack', error, data)) return { ok: false, problem: 'denied' }
  revalidatePath(SCREEN)
  revalidatePath('/integrasjoner')
  revalidatePath('/oppsett')
  revalidatePath('/malinger')
  return { ok: true }
}
