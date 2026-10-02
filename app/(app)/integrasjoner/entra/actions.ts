'use server'

import type { Route } from 'next'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrgId } from '@/lib/org/current'
import { createClient } from '@/lib/supabase/server'
import { callFailed, parseFailed } from '@/lib/supabase/read'
import { entraClientId } from '@/lib/entra/read'
import { BindResult, BindStart, adminConsentUrl } from '@/lib/entra/schema'

/**
 * «Koble til Microsoft 365» (0155, D-201): the two writes on the Entra screen.
 *
 * Starting asks the database for a single-use nonce (entra_bind_start: daglig leder, signed in
 * with Microsoft in this very session, organisation not yet bound, tenant not bound elsewhere),
 * then sends the browser to Microsoft's admin-consent endpoint *of the leader's own tenant*. The
 * answer comes back to /integrasjoner/entra/callback, where entra_bind_complete decides.
 *
 * Without ENTRA_CLIENT_ID there is nothing to start: the screen offers no button then, and this
 * says so rather than sending anyone to a consent page for an application that does not exist.
 */
const SCREEN = '/integrasjoner/entra'

async function origin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'www.orgpuls.com'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

export async function startEntraBinding(): Promise<void> {
  const clientId = entraClientId()
  if (!clientId) redirect(`${SCREEN}?feil=not_configured` as Route)
  const orgId = await getCurrentOrgId()
  if (!orgId) redirect(`${SCREEN}?feil=not_allowed` as Route)

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('entra_bind_start', { p_org: orgId })
  if (callFailed('startEntraBinding', error)) redirect(`${SCREEN}?feil=failed` as Route)
  const parsed = BindStart.safeParse(data)
  if (parseFailed('startEntraBinding', parsed)) redirect(`${SCREEN}?feil=failed` as Route)
  if (!parsed.data.ok) redirect(`${SCREEN}?feil=${parsed.data.error}` as Route)

  redirect(
    adminConsentUrl({
      tenant: parsed.data.tenant,
      clientId,
      redirectUri: `${await origin()}${SCREEN}/callback`,
      state: parsed.data.nonce,
    }) as never,
  )
}

export async function unbindEntra(): Promise<void> {
  const orgId = await getCurrentOrgId()
  if (!orgId) redirect(`${SCREEN}?feil=not_allowed` as Route)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('entra_unbind', { p_org: orgId })
  if (callFailed('unbindEntra', error)) redirect(`${SCREEN}?feil=failed` as Route)
  const parsed = BindResult.safeParse(data)
  if (parseFailed('unbindEntra', parsed)) redirect(`${SCREEN}?feil=failed` as Route)
  if (!parsed.data.ok) redirect(`${SCREEN}?feil=${parsed.data.error}` as Route)
  revalidatePath(SCREEN)
  revalidatePath('/oppsett')
  redirect(`${SCREEN}?frakoblet=1` as Route)
}
