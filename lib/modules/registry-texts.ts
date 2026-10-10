import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { registryTexts } from '@/lib/i18n/locales'
import { sourceHash } from '@/lib/i18n/survey-catalogue'
import { parseFailed, readFailed } from '@/lib/supabase/read'

/**
 * A module's statements, options and factor names in a leader's language whose survey texts live in
 * the translation registry (Swedish, D-253; D-262). The registry holds them as `module:` and
 * `mfactor:` rows, each with the SHA-256 of the bokmål it was translated from. A text is shown only
 * while that bokmål is still the module's: matched on the hash, so a reader that has the bokmål and
 * no id (the results, which carry codes) is served the same way as one that has ids, and a changed
 * statement falls back to English until its translation is approved again. Approved rows only:
 * a draft is never shown to a leader.
 *
 * The rest of a module (summaries, rationale, legal basis, suggestions, its name) is not in the
 * registry and is shown in English, the language behind every platform language but bokmål
 * (contentLang).
 */
export type Translate = (nb: string) => string | null

const Row = z.object({ text: z.string(), source_hash: z.string().nullable() })

/** Pure: bokmål → translation, from the language's approved rows */
export function translatorFrom(rows: readonly { text: string; source_hash: string | null }[]): Translate {
  const byHash = new Map<string, string>()
  for (const r of rows) if (r.source_hash && r.text.trim() && !byHash.has(r.source_hash)) byHash.set(r.source_hash, r.text)
  return (nb) => (nb ? (byHash.get(sourceHash(nb)) ?? null) : null)
}

const none: Translate = () => null

export const getModuleTranslations = cache(async (locale: string): Promise<Translate> => {
  if (!registryTexts(locale)) return none
  const supabase = await createClient()
  const read = (prefix: string) =>
    supabase
      .schema('app')
      .from('item_translations')
      .select('text, source_hash')
      .eq('locale', locale)
      .eq('status', 'approved')
      .like('item_id', `${prefix}:%`)
  const [items, factors] = await Promise.all([read('module'), read('mfactor')])
  if (readFailed('item_translations.module', items.error, items.data)) return none
  if (readFailed('item_translations.mfactor', factors.error, factors.data)) return none
  const parsed = z.array(Row).safeParse([...(items.data ?? []), ...(factors.data ?? [])])
  if (parseFailed('item_translations.module', parsed)) return none
  return translatorFrom(parsed.data)
})
