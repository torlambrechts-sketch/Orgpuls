import type { Route } from 'next'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callFailed, parseFailed } from '@/lib/supabase/read'
import { BindResult, ConsentAnswer } from '@/lib/entra/schema'

/**
 * Where Microsoft's admin-consent request sends the browser back (0155, D-201). Under the app's
 * own root, so the middleware has already required a session.
 *
 * Microsoft answers `?admin_consent=True&tenant=…&state=…`, or `?error=…&error_description=…&state=…`.
 * The route decides nothing: it hands state, tenant, admin_consent and the error *code* to
 * entra_bind_complete, which binds only if the nonce is this person's, unused and unexpired, the
 * caller is still daglig leder in the same Microsoft session, consent was granted, and the
 * tenant is the caller's own identity's (never the parameter alone) and bound to nobody else.
 * error_description is free text and goes nowhere — not to the database, not to a log.
 *
 * Every redirect is a fixed path with a code from a closed list: no open redirect.
 */
const SCREEN = '/integrasjoner/entra'

export async function GET(request: NextRequest) {
  const q = ConsentAnswer.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!q.success) redirect(`${SCREEN}?feil=nonce_invalid` as Route)

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('entra_bind_complete', {
    p_state: q.data.state,
    p_tenant: q.data.tenant ?? null,
    p_admin_consent: q.data.admin_consent ?? null,
    p_error: q.data.error ?? null,
  })
  if (callFailed('entraConsentCallback', error)) redirect(`${SCREEN}?feil=failed` as Route)
  const parsed = BindResult.safeParse(data)
  if (parseFailed('entraConsentCallback', parsed)) redirect(`${SCREEN}?feil=failed` as Route)
  if (!parsed.data.ok) {
    console.error(`[entra] tenant binding refused: ${parsed.data.error}`)
    redirect(`${SCREEN}?feil=${parsed.data.error}` as Route)
  }
  revalidatePath(SCREEN)
  revalidatePath('/oppsett')
  redirect(`${SCREEN}?koblet=1` as Route)
}
