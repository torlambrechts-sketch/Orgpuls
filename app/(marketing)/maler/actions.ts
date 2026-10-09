'use server'

import { cookies } from 'next/headers'
import { getLocale } from 'next-intl/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { granted, TEMPLATE_COOKIE, templateBySlug } from '@/lib/marketing/templates'
import { contentLang } from '@/lib/i18n/locales'

/**
 * A free template for an address (D-241): `request_template` hands the request to the platform as a
 * `template.requested` event (0208), with the box the person ticked for e-mail about new templates
 * and articles. Then the browser's cookie names the template, and the page shows its files. Nothing
 * the person wrote is logged.
 */
export type TemplateResult = { ok: true } | { ok: false; problem: 'invalid' | 'rate_limited' | 'failed' }

const Input = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,80}$/),
  name: z.string().trim().min(1).max(120),
  mail: z.string().trim().email().max(254),
  org: z.string().trim().max(200),
  role: z.string().trim().max(80),
  consent: z.boolean(),
  trap: z.string().max(500),
})
const Reply = z.object({ ok: z.boolean(), error: z.string().optional() })

export async function requestTemplate(input: z.input<typeof Input>): Promise<TemplateResult> {
  const parsed = Input.safeParse(input)
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const d = parsed.data
  const template = templateBySlug(d.slug)
  if (!template) return { ok: false, problem: 'invalid' }
  const lang = contentLang(await getLocale())
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('request_template', {
    p_template: d.slug,
    p_name: d.name,
    p_email: d.mail,
    p_org: d.org,
    p_role: d.role,
    p_consent: d.consent,
    p_lang: lang,
    p_trap: d.trap,
  })
  if (error) return { ok: false, problem: 'failed' }
  const reply = Reply.safeParse(data)
  if (!reply.success) return { ok: false, problem: 'failed' }
  if (!reply.data.ok)
    return { ok: false, problem: reply.data.error === 'rate_limited' ? 'rate_limited' : reply.data.error === 'invalid' ? 'invalid' : 'failed' }

  const jar = await cookies()
  const slugs = [...new Set([...granted(jar.get(TEMPLATE_COOKIE)?.value), d.slug])]
  jar.set(TEMPLATE_COOKIE, slugs.join(','), { httpOnly: true, secure: true, sameSite: 'lax', path: '/maler', maxAge: 60 * 60 * 24 * 365 })
  return { ok: true }
}
