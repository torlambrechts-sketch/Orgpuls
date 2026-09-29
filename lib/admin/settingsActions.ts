'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { INDEXING_TAG } from '@/lib/site/indexing'
import { createClient } from '@/lib/supabase/server'
import type { AdminResult } from './actions'

/**
 * Admin › Site settings (0126, D-170): «Allow search engines». The database decides who may (a
 * super-admin) and logs it; this drops the public site's cached answer so the noindex and the
 * sitemap follow at once.
 */
const Reply = z.object({ ok: z.boolean(), error: z.string().optional() })

export async function siteIndexingSet(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const on = z.enum(['on', 'off']).safeParse(formData.get('on'))
  if (!on.success) return { ok: false, problem: 'invalid' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_site_indexing_set', { p_on: on.data === 'on' })
  const r = Reply.safeParse(data)
  if (error || !r.success) return { ok: false, problem: 'failed' }
  if (!r.data.ok) return { ok: false, problem: r.data.error ?? 'failed' }
  revalidateTag(INDEXING_TAG)
  revalidatePath('/admin/settings')
  return { ok: true }
}
