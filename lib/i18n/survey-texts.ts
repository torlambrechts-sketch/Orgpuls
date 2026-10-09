import 'server-only'
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { readSupabaseEnv } from '@/lib/supabase/env'
import { isLocale, registryTexts } from './locales'
import type { RegistryText } from './registry-overlay'

/**
 * The instrument's approved texts in a platform language whose survey texts live in the registry
 * (Swedish), for the leader's views (0216, D-253). lib/i18n/registry-overlay.ts maps them onto the
 * catalogue; lib/i18n/request.ts lays them.
 *
 * Read anonymously (public.survey_texts returns approved texts only), cached for five minutes like
 * the overrides (lib/i18n/overrides.ts). A failed read is no texts: the English behind the
 * language is shown, never a gap.
 */
const Texts = z.record(z.string(), z.object({ t: z.string(), h: z.string().nullable() }))

const read = unstable_cache(
  async (locale: string): Promise<Record<string, RegistryText>> => {
    const env = readSupabaseEnv()
    if ('problem' in env) return {}
    const db = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await db.rpc('survey_texts', { p_locale: locale })
    if (error) return {}
    const parsed = Texts.safeParse(data)
    return parsed.success ? parsed.data : {}
  },
  ['survey-texts'],
  { revalidate: 300 },
)

export async function surveyTexts(locale: string): Promise<Record<string, RegistryText>> {
  if (!isLocale(locale) || !registryTexts(locale)) return {}
  try {
    return await read(locale)
  } catch {
    // outside a request (a build step, a script) or a cache failure: the catalogue as it is
    return {}
  }
}
