'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { DPA_VERSION } from '@/lib/legal/dpa'
import { getCurrentOrgId } from '@/lib/org/current'
import { createClient } from '@/lib/supabase/server'

/**
 * Signing the data processing agreement (D-87). The one write is `public.sign_dpa`, which
 * checks that the caller is the organisation's daglig leder, that the version is the one
 * in force, and copies that version's hash onto the signature itself. Nothing here decides
 * who may sign; it only shapes what is sent.
 */
export type DpaResult = { ok: true } | { ok: false; problem: string }

const Form = z.object({
  name: z.string().trim().min(2).max(120),
  title: z.string().trim().min(2).max(120),
  confirm: z.literal('on'),
})

export async function signDpa(_prev: DpaResult | null, formData: FormData): Promise<DpaResult> {
  const parsed = Form.safeParse({
    name: formData.get('name'),
    title: formData.get('title'),
    confirm: formData.get('confirm'),
  })
  if (!parsed.success) {
    const confirmed = formData.get('confirm') === 'on'
    return { ok: false, problem: confirmed ? 'invalid_signer' : 'not_confirmed' }
  }

  const org = await getCurrentOrgId()
  if (!org) return { ok: false, problem: 'not_allowed' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('sign_dpa', {
    p_org: org,
    p_version: DPA_VERSION,
    p_name: parsed.data.name,
    p_title: parsed.data.title,
  })
  if (error) return { ok: false, problem: 'failed' }

  const result = z.object({ ok: z.boolean(), error: z.string().optional() }).safeParse(data)
  if (!result.success) return { ok: false, problem: 'failed' }
  if (!result.data.ok) return { ok: false, problem: result.data.error ?? 'failed' }

  revalidatePath('/oppsett')
  return { ok: true }
}
