import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PageTemplate } from '@/components/marketing/PageTemplate'
import { pageMeta } from '@/lib/marketing/meta'

/**
 * Anonymity, step by step (seo.pages.anonymitet, D-285): what happens to an answer from the invitation to the
 * report, what the threshold does, how a leader answers a comment without learning who wrote it, and the one
 * exception (X-103). A Plattform page on the Norwegian site: the words are messages, the shape is PageTemplate,
 * the picture the anonymous conversation.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return pageMeta({
    title: t('seo.pages.anonymitet.title'),
    description: t('seo.pages.anonymitet.description'),
    path: '/anonymitet',
    image: '/og/anonymitet.png',
  })
}

export default async function Page() {
  const t = await getTranslations()
  return (
    <PageTemplate
      k="seo.pages.anonymitet"
      path="/anonymitet"
      parent={{ name: t('seo.pages.plattform.crumb'), path: '/plattform' }}
      articles={['anonym-medarbeiderundersokelse', 'slik-gar-dere-gjennom-resultatene-med-de-ansatte']}
      template="informasjonsskriv-og-sjekkliste"
      heroShot="samtaler"
    />
  )
}
