import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PageTemplate } from '@/components/marketing/PageTemplate'
import { pageMeta } from '@/lib/marketing/meta'

/** The free templates (seo.maler.index, D-241): what there is, each a link to its own page and form. */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return pageMeta({ title: t('seo.maler.index.title'), description: t('seo.maler.index.description'), path: '/maler' })
}

export default async function Page() {
  return <PageTemplate k="seo.maler.index" path="/maler" schemaType="CollectionPage" plain />
}
