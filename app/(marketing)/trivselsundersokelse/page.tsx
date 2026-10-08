import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { LandingTemplate } from '@/components/marketing/LandingTemplate'
import { pageMeta } from '@/lib/marketing/meta'
import { landingKey } from '@/lib/marketing/site'

/** A landing page (seo.lp.trivselsundersokelse, D-249); the words are messages, the shape is LandingTemplate. */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  const k = `seo.lp.${landingKey('trivselsundersokelse')}`
  return pageMeta({ title: t(`${k}.title`), description: t(`${k}.description`), path: '/trivselsundersokelse', image: '/og/trivselsundersokelse.png' })
}

export default function Page() {
  return <LandingTemplate slug="trivselsundersokelse" />
}
