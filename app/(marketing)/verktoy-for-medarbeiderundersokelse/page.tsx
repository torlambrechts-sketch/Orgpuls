import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { LandingTemplate } from '@/components/marketing/LandingTemplate'
import { pageMeta } from '@/lib/marketing/meta'
import { landingKey } from '@/lib/marketing/site'

/**
 * A landing page (seo.lp.verktoy-for-medarbeiderundersokelse, D-281): the «which tool» searches, answered with
 * what the product enforces. The words are messages, the shape is LandingTemplate.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  const k = `seo.lp.${landingKey('verktoy-for-medarbeiderundersokelse')}`
  return pageMeta({
    title: t(`${k}.title`),
    description: t(`${k}.description`),
    path: '/verktoy-for-medarbeiderundersokelse',
    image: '/og/verktoy-for-medarbeiderundersokelse.png',
  })
}

export default function Page() {
  return <LandingTemplate slug="verktoy-for-medarbeiderundersokelse" />
}
