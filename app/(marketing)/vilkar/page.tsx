import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PageTemplate } from '@/components/marketing/PageTemplate'
import { pageMeta } from '@/lib/marketing/meta'

/**
 * The terms of use (D-194): the footer's «Vilkår», which had no page (D-88). Published from the
 * draft docs/legal/vilkar-utkast.md, which stays the source record of the decisions it took. The
 * words are messages, the shape is PageTemplate, as the privacy statement's (D-104).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return pageMeta({
    title: t('seo.pages.vilkar.title'),
    description: t('seo.pages.vilkar.description'),
    path: '/vilkar',
  })
}

export default async function Page() {
  return <PageTemplate k="seo.pages.vilkar" path="/vilkar" schemaType="WebPage" plain />
}
