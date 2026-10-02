'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getEntraStatus } from '@/lib/entra/read'
import { getCurrentOrgId } from '@/lib/org/current'
import { createClient } from '@/lib/supabase/server'
import { writeFailed } from '@/lib/supabase/write'
import { teamsBotConfigured } from '@/lib/teams/read'

/**
 * The Teams screen's one write: on or off, and when (0176, D-203).
 *
 * The organisation row admits the daglig leder only (org_update); anybody else updates nothing
 * and is told so. Teams cannot be turned on before there is something to send with: a bound
 * Microsoft 365 tenant and this deployment's bot. Turning it off is always allowed.
 */
const Teams = z.object({
  enabled: z.enum(['true', 'false']),
  when: z.enum(['mangler', 'paaminn', 'alle']),
})

export type TeamsResult = { ok: true } | { ok: false; problem: 'invalid' | 'denied' | 'noOrg' | 'notReady' }

export async function saveTeams(formData: FormData): Promise<TeamsResult> {
  const parsed = Teams.safeParse({ enabled: formData.get('enabled'), when: formData.get('when') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, problem: 'noOrg' }

  const enabled = parsed.data.enabled === 'true'
  if (enabled) {
    const entra = await getEntraStatus(orgId)
    if (!entra?.bound || !teamsBotConfigured()) return { ok: false, problem: 'notReady' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('organizations')
    .update({ teams_enabled: enabled, teams_when: parsed.data.when })
    .eq('id', orgId)
    .select('id')

  if (writeFailed('saveTeams', error, data)) return { ok: false, problem: 'denied' }
  revalidatePath('/integrasjoner/teams')
  revalidatePath('/integrasjoner')
  revalidatePath('/oppsett')
  revalidatePath('/malinger')
  return { ok: true }
}
