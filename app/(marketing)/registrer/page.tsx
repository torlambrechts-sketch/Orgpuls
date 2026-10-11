import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { SignUpFlow } from '@/components/start/SignUpFlow'
import { googleEnabled } from '@/lib/auth/google'
import { microsoftEnabled } from '@/lib/auth/microsoft'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { marketOfHost } from '@/lib/hosts'
import { LEGAL_PACK, MARKET_K_FLOOR, REGISTRY_LOOKUP } from '@/lib/markets'
import { orgNumberInput } from '@/lib/org-number'
import { myJoinRequest, type JoinRequest } from '@/lib/signup/organisation'

/**
 * Registrering. Orgpuls_Start.dc.html lines 276-434, as one form since X-114 (D-279).
 *
 * The form and its outcomes live in one client component because nothing is written until it
 * submits: there is no half-created state for a URL to address, and none for a back button to replay.
 *
 * Three ways back in, each read on the server:
 *  - `?ferdig=1` — a Google (D-102) or Microsoft (D-201) sign-up, or a confirmation link, made the
 *    organisation: the page opens on what comes next;
 *  - `?venter=1` — the company was already here, and the request to join it stands, or was declined
 *    (0232): the page says which, with the company's name;
 *  - `?feil=<code>` — a refusal.
 */
export const dynamic = 'force-dynamic'

// the membership's organisation, embedded: one row through a foreign key, an object or a list of one
const Joined = z
  .object({
    organizations: z.union([z.object({ name: z.string() }), z.array(z.object({ name: z.string() })).length(1)]).nullable(),
  })
  .nullable()

export default async function RegistrerPage({
  searchParams,
}: {
  searchParams: Promise<{ feil?: string; ferdig?: string; venter?: string }>
}) {
  const { feil, ferdig, venter } = await searchParams
  const [google, microsoft] = await Promise.all([googleEnabled(), microsoftEnabled()])

  let done: { firstName: string; company: string } | null = null
  let waiting: JoinRequest | null = null
  let waitingUnread = false
  if (ferdig === '1' || venter === '1') {
    const supabase = await createClient()
    const { data: auth } = await supabase.auth.getUser()
    // a Microsoft sign-up that found the company is signed out after (the callback's rule for an
    // account with no membership): the request stands, and there is no session to read it by
    if (!auth.user && venter === '1') waitingUnread = true
    if (auth.user) {
      const { data: row } = await supabase
        .schema('app')
        .from('memberships')
        .select('organizations(name)')
        .eq('user_id', auth.user.id)
        .eq('active', true)
        .limit(1)
        .maybeSingle()
      const joined = Joined.safeParse(row)
      const orgs = joined.success ? joined.data?.organizations : null
      const org = Array.isArray(orgs) ? orgs[0]?.name : orgs?.name
      const meta = z.object({ full_name: z.string().optional(), name: z.string().optional() }).safeParse(auth.user.user_metadata)
      const name = (meta.success ? (meta.data.full_name ?? meta.data.name) : undefined) ?? ''
      if (ferdig === '1' && org) done = { firstName: name, company: org }
      // let in since: the product, not the waiting page
      if (venter === '1' && org) redirect('/innsikt' as Route)
      if (venter === '1' && !org) waiting = await myJoinRequest(supabase)
    }
  }

  // the host's market decides the number's rule and keyboard (D-254)
  const h = await headers()
  const market = marketOfHost(h.get('x-forwarded-host') ?? h.get('host'))
  const registry = REGISTRY_LOOKUP[market]

  return (
    <SignUpFlow
      google={google}
      microsoft={microsoft}
      problem={feil && /^[a-z_]{1,40}$/.test(feil) ? feil : null}
      done={done}
      waiting={waiting}
      waitingUnread={waitingUnread}
      registry={registry}
      floor={MARKET_K_FLOOR[market]}
      legal={LEGAL_PACK[market]}
      numberInput={orgNumberInput(market)}
    />
  )
}
