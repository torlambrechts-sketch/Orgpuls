import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { z } from 'zod'
import { readSupabaseEnv } from '@/lib/supabase/env'

/**
 * «Allow search engines» (0126, Admin › Site settings; D-170). Off, every public page carries
 * noindex and the sitemap is empty; the pages stay reachable so a crawler can read the noindex.
 * Cached for a minute and dropped at once when it is switched (INDEXING_TAG). A failed read counts
 * as allowed: a database hiccup must never take the site out of search.
 */
export const INDEXING_TAG = 'site-indexing'

const read = unstable_cache(
  async (): Promise<boolean> => {
    const env = readSupabaseEnv()
    if ('problem' in env) return true
    const db = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await db.rpc('site_indexing')
    if (error) return true
    const r = z.boolean().safeParse(data)
    return r.success ? r.data : true
  },
  ['site-indexing'],
  { tags: [INDEXING_TAG], revalidate: 60 },
)

export async function siteIndexing(): Promise<boolean> {
  try {
    return await read()
  } catch {
    return true
  }
}
