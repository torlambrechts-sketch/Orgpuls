import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { LandingTemplate } from '@/components/marketing/LandingTemplate'
import { pageMeta } from '@/lib/marketing/meta'
import { landingKey } from '@/lib/marketing/site'

/** A landing page (seo.lp.lovkrav); the words are messages, the shape is LandingTemplate. */
export const dynamic = 'force-static'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  const k = `seo.lp.${landingKey('lovkrav')}`
  return pageMeta({ title: t(`${k}.title`), description: t(`${k}.description`), path: '/lovkrav', image: '/og/lovkrav.png' })
}

export default function Page() {
  return <LandingTemplate slug="lovkrav" />
}
