import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { z } from 'zod'
import { readSupabaseEnv } from '@/lib/supabase/env'

/**
 * The site notice (0123, X-095): the design's «Splash page», as a notice above the public site's
 * header while it is switched on in Content › Landing & front pages. Cached for a minute and
 * dropped at once when it is changed (NOTICE_TAG). Off, or a failed read, shows nothing.
 */
export const NOTICE_TAG = 'site-notice'

const read = unstable_cache(
  async (lang: 'no' | 'en'): Promise<string | null> => {
    const env = readSupabaseEnv()
    if ('problem' in env) return null
    const db = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await db.rpc('site_notice', { p_locale: lang })
    if (error) return null
    const r = z.string().min(1).max(300).nullable().safeParse(data)
    return r.success ? r.data : null
  },
  ['site-notice'],
  { tags: [NOTICE_TAG], revalidate: 60 },
)

export async function siteNotice(lang: string): Promise<string | null> {
  try {
    return await read(lang === 'en' ? 'en' : 'no')
  } catch {
    return null
  }
}
