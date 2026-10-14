import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { LandingTemplate } from '@/components/marketing/LandingTemplate'
import { pageMeta } from '@/lib/marketing/meta'
import { landingKey } from '@/lib/marketing/site'

/**
 * The hub (D-284): what the psychosocial working environment is, the factors the law names, what it
 * requires and how it is surveyed, with the eleven factor articles under it. An informational page
 * (D-236): seo.lp.psykososialtArbeidsmiljo, the shape is LandingTemplate.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  const k = `seo.lp.${landingKey('psykososialt-arbeidsmiljo')}`
  return pageMeta({ title: t(`${k}.title`), description: t(`${k}.description`), path: '/psykososialt-arbeidsmiljo', image: '/og/psykososialt-arbeidsmiljo.png' })
}

export default function Page() {
  return <LandingTemplate slug="psykososialt-arbeidsmiljo" />
}
