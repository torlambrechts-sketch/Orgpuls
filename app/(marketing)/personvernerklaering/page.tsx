import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PageTemplate } from '@/components/marketing/PageTemplate'
import { pageMeta } from '@/lib/marketing/meta'

/**
 * The privacy statement (D-104): the footer's "Personvernerklæring", which had no page (D-88).
 * Orgpuls AS as controller for the site, signups, the newsletter and support; the survey
 * itself is the customer's, and /sikkerhet explains it. The words are messages, the shape is
 * PageTemplate, as every other page of the site.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return pageMeta({
    title: t('seo.pages.personvernerklaering.title'),
    description: t('seo.pages.personvernerklaering.description'),
    path: '/personvernerklaering',
  })
}

export default async function Page() {
  return <PageTemplate k="seo.pages.personvernerklaering" path="/personvernerklaering" schemaType="WebPage" plain />
}
