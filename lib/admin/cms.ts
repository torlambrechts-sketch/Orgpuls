import 'server-only'
import { z } from 'zod'
import { CMS_KINDS, CMS_LOCALES, LAYOUTS, TRANSLATION_STATES } from '@/lib/cms/content'
import { SHOT_IDS } from '@/lib/marketing/shot-ids'
import { call } from './api'

/**
 * The CMS's reads for the admin (0114, X-094). Each function checks the admin's role and second
 * factor; this file parses what comes back.
 */
const num = z.coerce.number()
const tsn = z.string().nullable()

const Template = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  kind: z.enum(CMS_KINDS),
  layout: z.enum(LAYOUTS),
  shot: z.enum(SHOT_IDS).nullable(),
  content_no: z.unknown(),
  content_en: z.unknown(),
  sort: num,
})
export type CmsTemplate = z.infer<typeof Template>
export const cmsTemplates = () => call('admin_cms_templates', {}, z.object({ rows: z.array(Template) }))

const Locale = z.object({
  locale: z.enum(CMS_LOCALES),
  draft: z.unknown(),
  live: z.unknown().nullable(),
  live_at: tsn,
  pending: z.unknown().nullable(),
  pending_at: tsn,
  translation: z.enum(TRANSLATION_STATES),
  updated_at: z.string(),
  /** what a reader gets now: the live copy, or a scheduled one whose time has come */
  current: z.unknown().nullable(),
  /** the draft differs from what is (or will be) live */
  changed: z.boolean(),
})
export type CmsPageLocale = z.infer<typeof Locale>

const Page = z.object({
  id: z.string(),
  kind: z.enum(CMS_KINDS),
  slug: z.string(),
  template: z.string(),
  layout: z.enum(LAYOUTS),
  focus_keyword: z.string().nullable(),
  noindex: z.boolean(),
  shot: z.enum(SHOT_IDS).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  archived: z.boolean(),
  locales: z.array(Locale),
  /** 0123: who last saved or published it, else who made it (the Pages list only) */
  author: z.string().nullable().optional(),
})
export type CmsPage = z.infer<typeof Page>
export const cmsPages = () => call('admin_cms_pages', {}, z.object({ rows: z.array(Page) }))

const Revision = z.object({
  id: num,
  locale: z.enum(CMS_LOCALES),
  action: z.enum(['save', 'publish', 'schedule', 'unpublish', 'restore']),
  at: z.string(),
  by: z.string().nullable(),
  title: z.string().nullable(),
})
export type CmsRevision = z.infer<typeof Revision>
export const cmsPage = (id: string) => call('admin_cms_page', { p_id: id }, z.object({ page: Page, revisions: z.array(Revision) }))

const Traffic = z.object({ path: z.string(), views: num, visitors: num, cta: num, signups: num })
export type CmsTraffic = z.infer<typeof Traffic>
export const cmsTraffic = (days = 30) => call('admin_cms_traffic', { p_days: days }, z.object({ days: num, rows: z.array(Traffic) }))

const Redirect = z.object({ from: z.string(), to: z.string(), permanent: z.boolean(), hits: num, last_hit_at: tsn, created_at: z.string() })
export type CmsRedirectRow = z.infer<typeof Redirect>
export const cmsRedirects = () => call('admin_cms_redirects', {}, z.object({ rows: z.array(Redirect) }))

/** A language's state, as one word: what a reader gets and whether more is waiting */
export type LocaleState = 'live' | 'changed' | 'scheduled' | 'draft'
export function localeState(l: CmsPageLocale): LocaleState {
  if (l.pending_at && !l.current) return 'scheduled'
  if (l.pending_at && l.current && new Date(l.pending_at) > new Date()) return 'scheduled'
  if (l.current) return l.changed ? 'changed' : 'live'
  return 'draft'
}

// 0123 (X-095): the site notice, the design's «Splash page»
const SiteNotice = z.object({ on: z.boolean(), no: z.string().nullable(), en: z.string().nullable(), at: tsn, by: z.string().nullable() })
export type SiteNotice = z.infer<typeof SiteNotice>
export const siteNoticeAdmin = () => call('admin_site_notice', {}, SiteNotice)

// 0124 (X-095, D-169): Content › Media
const MediaPage = z.object({ id: z.string(), kind: z.enum(['page', 'article']), slug: z.string(), title: z.string(), archived: z.boolean() })
const Media = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  bytes: num,
  width: num,
  height: num,
  alt_no: z.string(),
  alt_en: z.string(),
  created_at: z.string(),
  by: z.string().nullable(),
  pages: z.array(MediaPage),
})
export type Media = z.infer<typeof Media>
export const cmsMedia = () => call('admin_media', {}, z.object({ rows: z.array(Media) }))
