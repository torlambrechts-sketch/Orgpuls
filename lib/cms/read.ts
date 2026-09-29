import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { z } from 'zod'
import { readSupabaseEnv } from '@/lib/supabase/env'
import { CmsPublic, type CmsKind } from './content'

/**
 * The CMS's public reads (0114, X-094): a live page, the list of live pages, where an old address
 * goes now, and a draft through a preview link. Anonymous RPCs, parsed here.
 *
 * Live pages are cached for five minutes and dropped at once when the admin publishes
 * (CMS_TAG); a scheduled copy therefore appears within five minutes of its time. A preview and a
 * redirect are never cached: one is a draft, the other counts its visitors.
 */
export const CMS_TAG = 'cms-pages'

function anon() {
  const env = readSupabaseEnv()
  if ('problem' in env) return null
  return createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } })
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const locale = (l: string) => (l === 'en' ? 'en' : 'no')

const livePage = unstable_cache(
  async (kind: CmsKind, slug: string, lang: 'no' | 'en'): Promise<CmsPublic | null> => {
    const db = anon()
    if (!db) return null
    const { data, error } = await db.rpc('cms_page', { p_kind: kind, p_slug: slug, p_locale: lang })
    if (error || !data) return null
    const parsed = CmsPublic.safeParse(data)
    return parsed.success ? parsed.data : null
  },
  ['cms-page'],
  { tags: [CMS_TAG], revalidate: 300 },
)

/** A live page in a language, or null */
export async function cmsPage(kind: CmsKind, slug: string, lang: string): Promise<CmsPublic | null> {
  if (!SLUG.test(slug) || slug.length > 80) return null
  try {
    return await livePage(kind, slug, locale(lang))
  } catch {
    return null
  }
}

/** A draft through a preview link: its slug must be the address it is shown at */
export async function cmsPreview(token: string, kind: CmsKind, slug: string, lang: string): Promise<CmsPublic | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null
  const db = anon()
  if (!db) return null
  const { data, error } = await db.rpc('cms_preview', { p_token: token, p_locale: locale(lang) })
  if (error || !data) return null
  const parsed = CmsPublic.safeParse(data)
  return parsed.success && parsed.data.kind === kind && parsed.data.slug === slug ? parsed.data : null
}

const Listed = z.array(
  z.object({
    slug: z.string(),
    title: z.string().nullable(),
    description: z.string().nullable(),
    h1: z.string().nullable(),
    noindex: z.boolean(),
    updated_at: z.string().nullable(),
    twin: z.boolean(),
  }),
)
export type CmsListed = z.infer<typeof Listed>[number]

const list = unstable_cache(
  async (kind: CmsKind, lang: 'no' | 'en'): Promise<CmsListed[]> => {
    const db = anon()
    if (!db) return []
    const { data, error } = await db.rpc('cms_list', { p_kind: kind, p_locale: lang })
    if (error) return []
    const parsed = Listed.safeParse(data)
    return parsed.success ? parsed.data : []
  },
  ['cms-list'],
  { tags: [CMS_TAG], revalidate: 300 },
)

/** Every live page of a kind in a language: the sitemap, the article index */
export async function cmsList(kind: CmsKind, lang: string): Promise<CmsListed[]> {
  try {
    return await list(kind, locale(lang))
  } catch {
    return []
  }
}

const Redirect = z.object({ to: z.string(), permanent: z.boolean() })

/** Where an address the site does not own goes now, if an admin said so; counted */
export async function cmsRedirect(path: string): Promise<z.infer<typeof Redirect> | null> {
  if (!/^\/[a-z0-9_-]+(\/[a-z0-9_-]+)*$/.test(path) || path.length > 200) return null
  const db = anon()
  if (!db) return null
  const { data, error } = await db.rpc('cms_redirect', { p_path: path })
  if (error || !data) return null
  const parsed = Redirect.safeParse(data)
  return parsed.success ? parsed.data : null
}
