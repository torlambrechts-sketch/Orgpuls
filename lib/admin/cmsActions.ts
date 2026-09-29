'use server'

import type { Route } from 'next'
import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { CMS_LOCALES, TRANSLATION_STATES } from '@/lib/cms/content'
import { CMS_TAG } from '@/lib/cms/read'
import { NOTICE_TAG } from '@/lib/site/notice'
import { Block, FaqItems } from '@/lib/marketing/blocks'
import { SHOT_IDS } from '@/lib/marketing/shot-ids'
import { createClient } from '@/lib/supabase/server'
import type { AdminResult } from './actions'

/**
 * The CMS's writes (0114, X-094). The database decides who may do what, with a second factor,
 * checks every page's shape and logs each call; these actions shape the request, name the
 * refusal, and drop the site's cached copy so a published page is live at once.
 */
const Reply = z.object({ ok: z.boolean(), error: z.string().optional() }).passthrough()

async function rpc(fn: string, args: Record<string, unknown>): Promise<AdminResult & { data?: Record<string, unknown> }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return { ok: false, problem: 'failed' }
  const reply = Reply.safeParse(data)
  if (!reply.success) return { ok: false, problem: 'failed' }
  if (!reply.data.ok) return { ok: false, problem: reply.data.error ?? 'failed' }
  return { ok: true, data: reply.data }
}

/** the public site's copies: the cached pages and lists, the article index and the sitemap */
function refresh(id?: string) {
  revalidateTag(CMS_TAG)
  revalidatePath('/artikler')
  revalidatePath('/sitemap.xml')
  revalidatePath('/admin/cms')
  if (id) revalidatePath(`/admin/cms/${id}`)
}

const Id = z.string().uuid()
const Locale = z.enum(CMS_LOCALES)
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** What the editor sends: the page's fields, each block one of the site's own (lib/marketing/blocks) */
const Content = z
  .object({
    title: z.string().max(90),
    description: z.string().max(220),
    crumb: z.string().max(60),
    kicker: z.string().max(80),
    h1: z.string().max(150),
    lead: z.string().max(600),
    signupLabel: z.string().max(80).optional(),
    blocks: z.array(Block).max(60),
    faq: FaqItems.max(30),
    finalTitle: z.string().max(200).optional(),
    finalBody: z.string().max(600).optional(),
    sources: z.array(z.object({ label: z.string().min(1).max(200), url: z.string().url().startsWith('https://').max(500) })).max(20),
  })
  .strict()

const Meta = z
  .object({
    slug: z.string().regex(SLUG).min(2).max(80).optional(),
    focus_keyword: z.string().max(80).optional(),
    noindex: z.boolean().optional(),
    shot: z.union([z.enum(SHOT_IDS), z.literal('')]).optional(),
    translation: z.enum(TRANSLATION_STATES).optional(),
  })
  .strict()

/** Drops the optional texts left empty, so the page falls back to the site's own words */
function tidy(c: z.infer<typeof Content>) {
  const out: Record<string, unknown> = { ...c }
  for (const k of ['signupLabel', 'finalTitle', 'finalBody'] as const) if (!c[k]?.trim()) delete out[k]
  return out
}

export async function cmsCreate(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({
      template: z.string().regex(/^[a-z0-9-]{2,40}$/),
      slug: z.string().trim().toLowerCase().regex(SLUG).min(2).max(80),
      focus_keyword: z.string().trim().max(80),
      locales: z.array(Locale).min(1),
    })
    .safeParse({
      template: formData.get('template'),
      slug: formData.get('slug'),
      focus_keyword: formData.get('focus_keyword') ?? '',
      locales: formData.getAll('locales'),
    })
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0]
    return { ok: false, problem: field === 'slug' ? 'invalid_slug' : field === 'locales' ? 'invalid_locale' : 'invalid' }
  }
  const r = await rpc('admin_cms_create', { p: parsed.data })
  if (!r.ok) return r
  refresh()
  redirect(`/admin/cms/${String(r.data?.id)}` as Route)
}

/** One language's draft and the page's settings; content null saves the settings alone */
export async function cmsSave(input: { id: string; locale: string; content: unknown; meta: unknown }): Promise<AdminResult> {
  const id = Id.safeParse(input.id)
  const locale = Locale.safeParse(input.locale)
  const content = input.content === null ? null : Content.safeParse(input.content)
  const meta = Meta.safeParse(input.meta)
  if (!id.success || !locale.success || !meta.success) return { ok: false, problem: 'invalid' }
  if (content && !content.success) return { ok: false, problem: 'invalid_content' }
  const r = await rpc('admin_cms_save', { p_id: id.data, p_locale: locale.data, p_content: content ? tidy(content.data) : null, p_meta: meta.data })
  if (!r.ok) return r
  refresh(id.data)
  return { ok: true }
}

export async function cmsTranslate(input: { id: string; locale: string }): Promise<AdminResult> {
  const id = Id.safeParse(input.id)
  const locale = Locale.safeParse(input.locale)
  if (!id.success || !locale.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_cms_translate', { p_id: id.data, p_locale: locale.data })
  if (!r.ok) return r
  refresh(id.data)
  return { ok: true }
}

/** Now, or at a time (an ISO instant) up to a year ahead */
export async function cmsPublish(input: { id: string; locale: string; at: string | null }): Promise<AdminResult> {
  const id = Id.safeParse(input.id)
  const locale = Locale.safeParse(input.locale)
  const at = input.at === null ? null : z.string().datetime({ offset: true }).safeParse(input.at)
  if (!id.success || !locale.success || (at && !at.success)) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_cms_publish', { p_id: id.data, p_locale: locale.data, p_at: at ? at.data : null })
  if (!r.ok) return r
  refresh(id.data)
  return { ok: true }
}

export async function cmsUnpublish(input: { id: string; locale: string }): Promise<AdminResult> {
  const id = Id.safeParse(input.id)
  const locale = Locale.safeParse(input.locale)
  if (!id.success || !locale.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_cms_unpublish', { p_id: id.data, p_locale: locale.data })
  if (!r.ok) return r
  refresh(id.data)
  return { ok: true }
}

export async function cmsRestore(input: { revision: number }): Promise<AdminResult> {
  const rev = z.number().int().positive().safeParse(input.revision)
  if (!rev.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_cms_restore', { p_revision: rev.data })
  if (!r.ok) return r
  refresh(typeof r.data?.page === 'string' ? r.data.page : undefined)
  return { ok: true }
}

export async function cmsArchive(input: { id: string; archived: boolean }): Promise<AdminResult> {
  const id = Id.safeParse(input.id)
  if (!id.success || typeof input.archived !== 'boolean') return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_cms_archive', { p_id: id.data, p_archived: input.archived })
  if (!r.ok) return r
  refresh(id.data)
  return { ok: true }
}

/** A one-hour link that shows the page's draft: the editor's preview frame, or to send a reviewer */
export async function cmsPreviewToken(input: { id: string }): Promise<{ ok: true; token: string } | { ok: false; problem: string }> {
  const id = Id.safeParse(input.id)
  if (!id.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_cms_preview_token', { p_id: id.data })
  if (!r.ok) return r
  const token = z.string().regex(/^[0-9a-f]{64}$/).safeParse(r.data?.token)
  return token.success ? { ok: true, token: token.data } : { ok: false, problem: 'failed' }
}

export async function cmsRedirectSave(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ from: z.string().trim().toLowerCase().min(2).max(200), to: z.string().trim().min(1).max(500), permanent: z.boolean() })
    .safeParse({ from: formData.get('from'), to: formData.get('to'), permanent: formData.get('permanent') !== '0' })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_cms_redirect_save', { p_from: parsed.data.from, p_to: parsed.data.to, p_permanent: parsed.data.permanent })
  if (!r.ok) return r
  revalidatePath('/admin/cms/redirects')
  return { ok: true }
}

export async function cmsRedirectDelete(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const from = z.string().min(2).max(200).safeParse(formData.get('from'))
  if (!from.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_cms_redirect_delete', { p_from: from.data })
  if (!r.ok) return r
  revalidatePath('/admin/cms/redirects')
  return { ok: true }
}

/**
 * The site notice on or off (0123): the design's «Splash page», as a notice on the public pages,
 * in bokmål and English. The public site's cached copy is dropped at once.
 */
export async function siteNoticeSet(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ on: z.enum(['on', 'off']), no: z.string().max(300), en: z.string().max(300) })
    .safeParse({ on: formData.get('on'), no: formData.get('no') ?? '', en: formData.get('en') ?? '' })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_site_notice_set', { p_on: parsed.data.on === 'on', p_no: parsed.data.no, p_en: parsed.data.en })
  if (!r.ok) return r
  revalidateTag(NOTICE_TAG)
  revalidatePath('/admin/cms/landing')
  return { ok: true }
}

// ---------------------------------------------------------------- Content › Media (0124, D-169)
/**
 * An image the browser has already made web-sized (lib/cms/media.ts): its bytes as base64, its
 * size, its name and its words. The database reads the type from the bytes and refuses anything
 * but PNG, JPEG or WebP; the same bytes twice are one image.
 */
export async function mediaAdd(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(120),
      data: z.string().min(1).max(3_000_000),
      width: z.coerce.number().int().min(1).max(4000),
      height: z.coerce.number().int().min(1).max(4000),
      alt_no: z.string().max(300),
      alt_en: z.string().max(300),
    })
    .safeParse(Object.fromEntries(['name', 'data', 'width', 'height', 'alt_no', 'alt_en'].map((k) => [k, formData.get(k) ?? ''])))
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const d = parsed.data
  const r = await rpc('admin_media_add', { p_name: d.name, p_data: d.data, p_width: d.width, p_height: d.height, p_alt_no: d.alt_no, p_alt_en: d.alt_en })
  if (!r.ok) return r
  revalidatePath('/admin/cms/media')
  return { ok: true }
}

export async function mediaDescribe(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120), alt_no: z.string().max(300), alt_en: z.string().max(300) })
    .safeParse(Object.fromEntries(['id', 'name', 'alt_no', 'alt_en'].map((k) => [k, formData.get(k) ?? ''])))
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const d = parsed.data
  const r = await rpc('admin_media_describe', { p_id: d.id, p_name: d.name, p_alt_no: d.alt_no, p_alt_en: d.alt_en })
  if (!r.ok) return r
  revalidatePath('/admin/cms/media')
  return { ok: true }
}

export async function mediaDelete(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const id = z.string().uuid().safeParse(formData.get('id'))
  if (!id.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_media_delete', { p_id: id.data })
  if (!r.ok) return r
  revalidatePath('/admin/cms/media')
  redirect('/admin/cms/media' as Route)
}
