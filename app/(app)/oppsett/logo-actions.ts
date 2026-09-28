'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrgId } from '@/lib/org/current'
import { createClient } from '@/lib/supabase/server'
import { callFailed } from '@/lib/supabase/read'

/**
 * The organisation's logo (0104, D-154): upload, remove, and «Hva står i toppen».
 *
 * Who may is the database's rule (set_org_logo and its siblings: the daglig leder), refused with
 * 42501 for anyone else. The type is decided there too, from the file's first bytes; the checks
 * here only spare a round trip for a file that could never be accepted.
 */
export type LogoResult = { ok: true } | { ok: false; problem: 'too_large' | 'type' | 'unreadable' | 'denied' }

const LOGO_MAX_BYTES = 262144
const TYPES = ['image/png', 'image/jpeg', 'image/webp']

const refresh = () => {
  // the header and rail are on every screen; Oppsett shows the card
  revalidatePath('/', 'layout')
}

export async function uploadLogo(form: FormData): Promise<LogoResult> {
  const file = form.get('logo')
  if (!(file instanceof File) || file.size === 0) return { ok: false, problem: 'unreadable' }
  if (file.size > LOGO_MAX_BYTES) return { ok: false, problem: 'too_large' }
  if (!TYPES.includes(file.type)) return { ok: false, problem: 'type' }

  const org = await getCurrentOrgId()
  if (!org) return { ok: false, problem: 'denied' }
  const supabase = await createClient()
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
  const { data, error } = await supabase.rpc('set_org_logo', { p_org: org, p_data: base64 })
  if (callFailed('uploadLogo', error)) return { ok: false, problem: 'denied' }
  const r = z.union([z.object({ key: z.string() }), z.object({ error: z.enum(['too_large', 'type', 'unreadable']) })]).safeParse(data)
  if (!r.success) return { ok: false, problem: 'denied' }
  if ('error' in r.data) return { ok: false, problem: r.data.error }
  refresh()
  return { ok: true }
}

export async function removeLogo(): Promise<LogoResult> {
  const org = await getCurrentOrgId()
  if (!org) return { ok: false, problem: 'denied' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('remove_org_logo', { p_org: org })
  if (callFailed('removeLogo', error)) return { ok: false, problem: 'denied' }
  refresh()
  return { ok: true }
}

export async function setLogoInHeader(on: boolean): Promise<LogoResult> {
  if (typeof on !== 'boolean') return { ok: false, problem: 'unreadable' }
  const org = await getCurrentOrgId()
  if (!org) return { ok: false, problem: 'denied' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('set_logo_in_header', { p_org: org, p_on: on })
  if (callFailed('setLogoInHeader', error)) return { ok: false, problem: 'denied' }
  if (!z.object({ ok: z.literal(true) }).safeParse(data).success) return { ok: false, problem: 'denied' }
  refresh()
  return { ok: true }
}
