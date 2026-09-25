import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PageTemplate } from '@/components/marketing/PageTemplate'
import { pageMeta } from '@/lib/marketing/meta'

/** A page of the public site (seo.pages.sikkerhet, D-83); the words are messages, the shape is PageTemplate. */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return pageMeta({
    title: t('seo.pages.sikkerhet.title'),
    description: t('seo.pages.sikkerhet.description'),
    path: '/sikkerhet',
  })
}

export default async function Page() {
  return (
    <PageTemplate
      k="seo.pages.sikkerhet"
      path="/sikkerhet"
      schemaType="WebPage"
      articles={['anonym-medarbeiderundersokelse', 'verneombudets-rolle-i-kartleggingen']}
    />
  )
}
