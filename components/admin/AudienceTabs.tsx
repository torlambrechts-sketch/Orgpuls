import { getTranslations } from 'next-intl/server'
import { SectionTabs } from './SectionTabs'

/** Marketing › Contacts & lists (X-097): contacts, lists and segments as one entry with three tabs */
export async function AudienceTabs({ on }: { on: 'contacts' | 'lists' | 'segments' }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  return (
    <SectionTabs
      label={t('nav.item.crmContacts')}
      items={(['contacts', 'lists', 'segments'] as const).map((k) => ({ key: k, label: t(`crm.audienceTabs.${k}`), href: `/admin/crm/${k}`, on: k === on }))}
    />
  )
}
