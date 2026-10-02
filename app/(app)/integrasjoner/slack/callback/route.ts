import type { Route } from 'next'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callFailed, parseFailed } from '@/lib/supabase/read'
import { slackAppFromEnv, slackRedirectUri } from '@/lib/slack/read'
import { ConnectResult, SlackCallback } from '@/lib/slack/schema'
import { exchangeCode, revokeToken, type FetchLike } from '@/supabase/functions/_shared/slack'

/**
 * Where Slack's authorisation sends the browser back (0185, D-205). Under the app's own root, so
 * the middleware has already required a session.
 *
 * Slack answers `?code=…&state=…`, or `?error=access_denied&state=…`. With a code, it is exchanged
 * for the installation here (oauth.v2.access, with the app's secret, which never leaves the
 * server) and handed with the state to slack_connect_complete, which keeps it only if the nonce is
 * this person's, unused and unexpired, from this session, the caller is still daglig leder, and
 * the workspace is no other organisation's. The tokens go from Slack's answer to the database and
 * nowhere else — not to the browser, not to a log. Refused, the token just issued is revoked,
 * except where the database says the workspace is another organisation's (its bot is the same).
 *
 * Every redirect is a fixed path with a code from a closed list: no open redirect.
 */
const SCREEN = '/integrasjoner/slack'

export async function GET(request: NextRequest) {
  const q = SlackCallback.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!q.success) redirect(`${SCREEN}?feil=nonce_invalid` as Route)
  const app = slackAppFromEnv()
  if (!app) redirect(`${SCREEN}?feil=not_configured` as Route)

  const fetchFn = fetch as unknown as FetchLike
  let installation: Record<string, unknown> | null = null
  if (q.data.code && !q.data.error) {
    const exchanged = await exchangeCode(fetchFn, app, q.data.code, await slackRedirectUri())
    if (!exchanged.ok) {
      console.error(`[slack] code exchange refused: ${exchanged.code}`)
      redirect(`${SCREEN}?feil=exchange_failed` as Route)
    }
    installation = { ...exchanged.installation }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('slack_connect_complete', { p_state: q.data.state, p_install: installation })
  const token = typeof installation?.access_token === 'string' ? installation.access_token : null
  if (callFailed('slackConnectCallback', error)) {
    if (token) await revokeToken(fetchFn, token)
    redirect(`${SCREEN}?feil=failed` as Route)
  }
  const parsed = ConnectResult.safeParse(data)
  if (parseFailed('slackConnectCallback', parsed)) {
    if (token) await revokeToken(fetchFn, token)
    redirect(`${SCREEN}?feil=failed` as Route)
  }
  if (!parsed.data.ok) {
    console.error(`[slack] connection refused: ${parsed.data.error}`)
    if (token && parsed.data.revoke) await revokeToken(fetchFn, token)
    redirect(`${SCREEN}?feil=${parsed.data.error}` as Route)
  }
  revalidatePath(SCREEN)
  revalidatePath('/integrasjoner')
  revalidatePath('/oppsett')
  redirect(`${SCREEN}?koblet=1` as Route)
}
