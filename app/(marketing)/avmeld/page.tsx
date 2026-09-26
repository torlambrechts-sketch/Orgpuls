import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { PreferenceCentre } from '@/components/site/NewsletterForms'
import { preferences } from '@/lib/crm/read'
import { CONTACT_MAIL } from '@/lib/marketing/site'

/**
 * The preference centre (D-101, D-103), from the link in every marketing mail: the lists this
 * recipient gets, to tick on or off, or leave all. Nothing changes until a button is pressed,
 * so a link scanner cannot unsubscribe anyone; a mail program's own "Unsubscribe" uses
 * /api/avmeld and leaves that mail's list at once. Mail about a survey or an account is not
 * affected.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('unsubscribe')
  return { title: `${t('title')} · Orgpuls`, robots: { index: false, follow: false } }
}

export default async function PreferencesPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t: token } = await searchParams
  const t = await getTranslations('unsubscribe')
  const lang = (await getLocale()) === 'en' ? 'en' : 'no'
  const prefs = typeof token === 'string' ? await preferences(token) : null
  const invalidLead = (t.raw('invalidLead') as string).replace('{mail}', CONTACT_MAIL)
  const name = (l: { name_no: string; name_en: string }) => (lang === 'en' ? l.name_en : l.name_no)
  const from = prefs?.campaign_list ? prefs.lists.find((l) => l.key === prefs.campaign_list) : undefined

  return (
    <div className="animate-entry mx-auto max-w-[560px] px-[26px] pb-[70px] pt-[44px]">
      <div className="rounded-card border border-line bg-sf p-[clamp(24px,3.5vw,32px)]">
        <span className="inline-block rounded-pill bg-sbg px-[12px] py-[5px] text-[11.5px] font-bold">{t('badge')}</span>
        <h1 className="mt-[13px] font-display text-[clamp(26px,3.6vw,31px)] font-semibold leading-[1.12]">
          {prefs ? t('prefsTitle') : t('invalidTitle')}
        </h1>
        <p className="mt-[10px] max-w-[46ch] text-[14px] leading-[1.6] text-mut [text-wrap:pretty]">{prefs ? t('prefsLead') : invalidLead}</p>
        {from ? <p className="mb-0 mt-[6px] text-[13px] text-body">{t('fromThis', { list: name(from) })}</p> : null}
        {prefs && token ? (
          <PreferenceCentre
            token={token}
            allOff={prefs.all_off}
            lists={prefs.lists.map((l) => ({
              key: l.key,
              name: name(l),
              description: lang === 'en' ? l.description_en : l.description_no,
              subscribed: l.subscribed,
            }))}
            words={{
              save: t('save'),
              saving: t('saving'),
              saved: t('saved'),
              all: t('all'),
              allTitle: t('allTitle'),
              allLead: t('allLead'),
              again: t('again'),
              failed: invalidLead,
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
