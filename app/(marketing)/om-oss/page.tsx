import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PageTemplate } from '@/components/marketing/PageTemplate'
import { pageMeta } from '@/lib/marketing/meta'

/** A page of the public site (seo.pages.omOss, D-83); the words are messages, the shape is PageTemplate. */
export const dynamic = 'force-static'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return pageMeta({ title: t('seo.pages.omOss.title'), description: t('seo.pages.omOss.description'), path: '/om-oss' })
}

export default async function Page() {
  return <PageTemplate k="seo.pages.omOss" path="/om-oss" schemaType="AboutPage" />
}
