import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { readSupabaseEnv } from '@/lib/supabase/env'

/**
 * The CRM's public reads (0056, D-103): the lists a visitor may sign up for, the preference
 * centre behind a mail's token, and the newsletter's web archive. Anonymous RPCs, parsed
 * here; none returns an address.
 */
function anon() {
  const env = readSupabaseEnv()
  if ('problem' in env) return null
  return createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } })
}

const PublicList = z.object({ key: z.string(), name_no: z.string(), name_en: z.string(), description_no: z.string(), description_en: z.string() })
export type PublicList = z.infer<typeof PublicList>

export async function publicLists(): Promise<PublicList[]> {
  const db = anon()
  if (!db) return []
  const { data, error } = await db.rpc('crm_public_lists')
  if (error) return []
  const parsed = z.array(PublicList).safeParse(data)
  return parsed.success ? parsed.data : []
}

const Preferences = z.object({
  ok: z.literal(true),
  lang: z.enum(['no', 'en']),
  all_off: z.boolean(),
  campaign_list: z.string().nullable(),
  lists: z.array(PublicList.extend({ subscribed: z.boolean() })),
})
export type Preferences = z.infer<typeof Preferences>

export async function preferences(token: string): Promise<Preferences | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null
  const db = anon()
  if (!db) return null
  const { data, error } = await db.rpc('crm_preferences', { p_token: token })
  if (error) return null
  const parsed = Preferences.safeParse(data)
  return parsed.success ? parsed.data : null
}

const ArchiveRow = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  preheader: z.string(),
  lang: z.enum(['no', 'en']),
  kind: z.string(),
  published_at: z.string(),
})
export type ArchiveRow = z.infer<typeof ArchiveRow>

export async function archive(): Promise<ArchiveRow[]> {
  const db = anon()
  if (!db) return []
  const { data, error } = await db.rpc('crm_archive', { p_limit: 100 })
  if (error) return []
  const parsed = z.array(ArchiveRow).safeParse(data)
  return parsed.success ? parsed.data : []
}

const WebBlock = z.object({
  type: z.enum(['heading', 'text', 'button', 'article', 'bullets', 'image', 'divider', 'quote', 'event', 'ps']),
  text: z.string().optional(),
  url: z.string().optional(),
  title: z.string().optional(),
  label: z.string().optional(),
  alt: z.string().optional(),
  href: z.string().optional(),
})
export type WebBlock = z.infer<typeof WebBlock>

const ArchiveItem = ArchiveRow.extend({ style: z.enum(['branded', 'letter']), signature: z.string(), blocks: z.array(WebBlock), utm_campaign: z.string() })
export type ArchiveItem = z.infer<typeof ArchiveItem>

export async function archiveItem(slug: string): Promise<ArchiveItem | null> {
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) return null
  const db = anon()
  if (!db) return null
  const { data, error } = await db.rpc('crm_archive_item', { p_slug: slug })
  if (error || !data) return null
  const parsed = ArchiveItem.safeParse(data)
  return parsed.success ? parsed.data : null
}
