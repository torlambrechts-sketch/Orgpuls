import 'server-only'
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { readSupabaseEnv } from '@/lib/supabase/env'
import { applyOverrides } from './override-tree'

export { applyOverrides }

/**
 * Bokmål and English texts replaced from admin › Translations (0101, D-152).
 *
 * messages/ stays the source. An approved override replaces one string in it, by its dotted path,
 * wherever the application loads its messages (lib/i18n/request.ts), and the legal review reads
 * the texts as they are shown (lib/legal/inputs.ts). An override for a path the file does not
 * have, or where the file has a branch rather than a string, is ignored: an import can change
 * what a string says, never the shape of the catalogue.
 *
 * Read anonymously (public.message_overrides returns approved text only), cached for five
 * minutes and dropped at once when the admin writes (OVERRIDES_TAG). A failed read is no
 * overrides: the files alone are always a complete catalogue.
 */
export const OVERRIDE_LOCALES = ['no', 'en'] as const
export type OverrideLocale = (typeof OVERRIDE_LOCALES)[number]
export const isOverrideLocale = (v: unknown): v is OverrideLocale => v === 'no' || v === 'en'
export const OVERRIDES_TAG = 'message-overrides'

const Flat = z.record(z.string(), z.string())

const read = unstable_cache(
  async (locale: OverrideLocale): Promise<Record<string, string>> => {
    const env = readSupabaseEnv()
    if ('problem' in env) return {}
    const db = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await db.rpc('message_overrides', { p_locale: locale })
    if (error) return {}
    const parsed = Flat.safeParse(data)
    return parsed.success ? parsed.data : {}
  },
  ['message-overrides'],
  { tags: [OVERRIDES_TAG], revalidate: 300 },
)

export async function messageOverrides(locale: string): Promise<Record<string, string>> {
  if (!isOverrideLocale(locale)) return {}
  try {
    return await read(locale)
  } catch {
    // outside a request (a build step, a script) or a cache failure: the files as they are
    return {}
  }
}

/** Both platform languages as they are shown now: the files with their approved overrides */
export async function effectiveMessages<T>(no: T, en: T): Promise<{ no: T; en: T }> {
  const [o, e] = await Promise.all([messageOverrides('no'), messageOverrides('en')])
  return { no: applyOverrides(no, o), en: applyOverrides(en, e) }
}
