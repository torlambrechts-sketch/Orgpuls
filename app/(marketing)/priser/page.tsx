import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PageTemplate } from '@/components/marketing/PageTemplate'
import { pageMeta } from '@/lib/marketing/meta'
import { software } from '@/lib/marketing/schema'

/** A page of the public site (seo.pages.priser, D-83); the words are messages, the shape is PageTemplate. */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return pageMeta({ title: t('seo.pages.priser.title'), description: t('seo.pages.priser.description'), path: '/priser' })
}

export default async function Page() {
  const t = await getTranslations()
  return (
    <PageTemplate k="seo.pages.priser" path="/priser" schemaType="WebPage" extraSchema={[software(t('seo.home.description'))]} />
  )
}
