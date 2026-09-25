import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { LandingTemplate } from '@/components/marketing/LandingTemplate'
import { pageMeta } from '@/lib/marketing/meta'
import { landingKey } from '@/lib/marketing/site'

/** A landing page (seo.lp.smaa-bedrifter); the words are messages, the shape is LandingTemplate. */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  const k = `seo.lp.${landingKey('smaa-bedrifter')}`
  return pageMeta({ title: t(`${k}.title`), description: t(`${k}.description`), path: '/smaa-bedrifter', image: '/og/smaa-bedrifter.png' })
}

export default function Page() {
  return <LandingTemplate slug="smaa-bedrifter" />
}
