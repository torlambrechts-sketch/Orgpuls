import { SignUpFlow } from '@/components/start/SignUpFlow'
import { googleEnabled } from '@/lib/auth/google'
import { microsoftEnabled } from '@/lib/auth/microsoft'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { marketOfHost } from '@/lib/hosts'
import { LEGAL_PACK, MARKET_K_FLOOR, REGISTRY_LOOKUP } from '@/lib/markets'

/**
 * Registrering. Orgpuls_Start.dc.html lines 276-434.
 *
 * All three steps live in one client component because nothing is written until step 2
 * submits: there is no half-created state for a URL to address, and none for a back
 * button to replay.
 *
 * A Google (D-102) or Microsoft (D-201) signup comes back from /auth/callback as `?ferdig=1` with the
 * organisation made, and opens on step 3; a refusal comes back as `?feil=<code>`.
 */
export const dynamic = 'force-dynamic'

export default async function RegistrerPage({ searchParams }: { searchParams: Promise<{ feil?: string; ferdig?: string }> }) {
  const { feil, ferdig } = await searchParams
  const [google, microsoft] = await Promise.all([googleEnabled(), microsoftEnabled()])

  let done: { firstName: string; company: string } | null = null
  if (ferdig === '1') {
    const supabase = await createClient()
    const { data: auth } = await supabase.auth.getUser()
    if (auth.user) {
      const { data: row } = await supabase
        .schema('app')
        .from('memberships')
        .select('organizations(name)')
        .eq('user_id', auth.user.id)
        .eq('active', true)
        .limit(1)
        .maybeSingle()
      const org = (row as { organizations?: { name?: unknown } | null } | null)?.organizations?.name
      const meta = auth.user.user_metadata as { full_name?: unknown; name?: unknown }
      const name = [meta.full_name, meta.name].find((v): v is string => typeof v === 'string') ?? ''
      if (typeof org === 'string') done = { firstName: name, company: org }
    }
  }

  // the host's market decides whether step 1 asks a register or the person (D-254)
  const h = await headers()
  const market = marketOfHost(h.get('x-forwarded-host') ?? h.get('host'))
  const registry = REGISTRY_LOOKUP[market]

  return (
    <SignUpFlow
      google={google}
      microsoft={microsoft}
      problem={feil && /^[a-z_]{1,40}$/.test(feil) ? feil : null}
      done={done}
      registry={registry}
      floor={MARKET_K_FLOOR[market]}
      legal={LEGAL_PACK[market]}
    />
  )
}
