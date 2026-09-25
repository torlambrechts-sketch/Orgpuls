import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PageTemplate } from '@/components/marketing/PageTemplate'
import { pageMeta } from '@/lib/marketing/meta'

/** A page of the public site (seo.pages.plattform, D-83); the words are messages, the shape is PageTemplate. */
export const dynamic = 'force-static'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return pageMeta({
    title: t('seo.pages.plattform.title'),
    description: t('seo.pages.plattform.description'),
    path: '/plattform',
  })
}

export default async function Page() {
  return (
    <PageTemplate
      k="seo.pages.plattform"
      path="/plattform"
      schemaType="WebPage"
      articles={['nye-regler-psykososialt-arbeidsmiljo-2026', 'medarbeiderundersokelse-sporsmal']}
    />
  )
}
