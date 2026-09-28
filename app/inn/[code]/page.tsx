import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { EntryForm } from '@/components/entry/EntryForm'
import { callFailed } from '@/lib/supabase/read'
import { createClient } from '@/lib/supabase/server'
import { LogoKey, logoPath } from '@/lib/org/logo'

/**
 * The QR poster's page (0076, D-126): a door, not a key. The code names the organisation and
 * nothing else; the person gives their mobile number or e-mail address, and if it is on an
 * open survey's list their own link is sent to it. The answer is the same whatever is typed.
 *
 * Public, like /s: no session and no cookie that identifies anyone. The design has no screen
 * for it, so it is built as the respondent surface's own card (app/s/[token]) and the sign-in
 * panel's field and button.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { robots: { index: false, follow: false } }

const Info = z.union([
  z.object({ org: z.string(), logo: LogoKey, lang: z.string(), open: z.boolean(), email: z.boolean(), sms: z.boolean() }),
  z.object({ error: z.literal('unknown') }),
])
const Code = z.string().regex(/^[a-hjkmnp-z2-9]{8}$/)

export default async function EntryPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params
  const t = await getTranslations('entry')
  const code = Code.safeParse(raw.toLowerCase())

  let info: z.infer<typeof Info> = { error: 'unknown' }
  if (code.success) {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('entry_info', { p_code: code.data })
    if (!callFailed('entryInfo', error)) {
      const parsed = Info.safeParse(data)
      if (parsed.success) info = parsed.data
    }
  }

  const card = (title: string, lead: string, body?: React.ReactNode) => (
    <main className="animate-entry mx-auto min-h-screen max-w-[420px] px-[20px] py-[60px]">
      <div className="rounded-card border border-line bg-sf px-[22px] py-[26px]">
        {'org' in info && info.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- the organisation's logo (0104), same-origin; its name follows
          <img src={logoPath(info.logo)} alt="" className="mb-[10px] block h-[32px] w-auto max-w-[140px] object-contain" />
        ) : null}
        {'org' in info ? (
          <span className="block text-[11.5px] font-bold uppercase tracking-[.08em] text-mut">{info.org}</span>
        ) : null}
        <h1 className="m-0 mt-[6px] font-display text-[24px] font-semibold leading-[1.2]">{title}</h1>
        <p className="mt-[10px] text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">{lead}</p>
        {body}
      </div>
    </main>
  )

  if (!code.success || 'error' in info) return card(t('unknown'), t('unknownLead'))
  if (!info.open || !info.email) return card(t('closed'), t('closedLead', { org: info.org }))

  return card(
    t('title'),
    t(info.sms ? 'lead' : 'leadEmail'),
    <>
      <EntryForm
        code={code.data}
        labels={{
          field: t(info.sms ? 'field' : 'fieldEmail'),
          placeholder: t(info.sms ? 'placeholder' : 'placeholderEmail'),
          submit: t('submit'),
          sending: t('sending'),
          sentTitle: t('sentTitle'),
          sentLead: t(info.sms ? 'sentLead' : 'sentLeadEmail'),
          again: t('again'),
          invalid: t(info.sms ? 'invalid' : 'invalidEmail'),
          busy: t('busy'),
          failed: t('failed'),
        }}
      />
      <p className="mb-0 mt-[18px] border-t border-line pt-[14px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">
        {t('privacy')}
      </p>
    </>,
  )
}
