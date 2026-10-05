import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { IndustryLanding } from '@/components/industry/IndustryLanding'
import { PreviewBanner } from '@/components/industry/PreviewBanner'
import { JsonLd } from '@/components/marketing/JsonLd'
import { getIndustry, INDUSTRIES } from '@/content/industries'
import { landingFor } from '@/content/industries/landing'
import type { PageLang } from '@/content/industries/modules'
import { assertIndustries } from '@/content/industries/validate'
import { pageMeta } from '@/lib/marketing/meta'
import { breadcrumbs, faqPage, graph, organization } from '@/lib/marketing/schema'
import { absolute } from '@/lib/marketing/site'

/**
 * An industry page (bransjesider-og-tilleggsmoduler.md § B1): the landing template
 * (components/industry/IndustryLanding.tsx, content/industries/landing.ts, D-207) for each of the
 * registry's industries, in the site's language (www Norwegian, en.orgpuls.com English). Live in that
 * language, the page; not yet live there, the same with ?forhandsvis=1, marked noindex; otherwise
 * nothing. Each language launches on its own (D-120). The older industry template, and the landing
 * page bygg and helse had before it, are gone (D-213).
 *
 * Any other address is nothing: the CMS that could publish a page here is gone (D-230).
 */
export const dynamicParams = true

export function generateStaticParams() {
  assertIndustries()
  return INDUSTRIES.map((i) => ({ bransje: i.slug }))
}

type Props = { params: Promise<{ bransje: string }>; searchParams: Promise<{ forhandsvis?: string }> }

/** The landing template's page at this address in the site's language, live or previewed (D-207) */
async function landingAt(props: Props) {
  const landing = landingFor((await props.params).bransje)
  if (!landing) return null
  const lang: PageLang = (await getLocale()) === 'en' ? 'en' : 'no'
  const preview = (await props.searchParams).forhandsvis === '1'
  if (!landing.live[lang] && !preview) return null
  return { landing, lang, preview: !landing.live[lang] }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  if (!getIndustry((await props.params).bransje)) return {}
  const at = await landingAt(props)
  if (!at) return {}
  const t = await getTranslations(`site.bransje.${at.landing.msg}.seo`)
  const meta = await pageMeta({
    title: t('title'),
    description: t('description'),
    path: `/${at.landing.slug}`,
    image: `/og/${at.landing.slug}.png`,
    // hreflang names the other language only where that address shows a page (D-131)
    noTwin: !at.landing.live.no || !at.landing.live.en,
  })
  return at.preview ? { ...meta, robots: { index: false, follow: false } } : meta
}

export default async function IndustryRoute(props: Props) {
  const { bransje } = await props.params
  if (!getIndustry(bransje)) notFound()
  const at = await landingAt(props)
  if (!at) notFound()
  return <LandingRoute {...at} />
}

/** An industry on the landing template (D-207): its JSON-LD, the preview note, and the page */
async function LandingRoute({ landing, lang, preview }: NonNullable<Awaited<ReturnType<typeof landingAt>>>) {
  const t = await getTranslations()
  const own = (k: string) => t(`site.bransje.${landing.msg}.${k}`)
  const faq = (t.raw(`site.bransje.${landing.msg}.faq.items`) as { q: string; a: string }[]).slice(0, landing.faqCount)
  return (
    <>
      <JsonLd
        data={graph(
          organization(),
          {
            '@type': 'WebPage',
            url: absolute(`/${landing.slug}`),
            name: own('seo.title'),
            description: own('seo.description'),
            inLanguage: lang === 'en' ? 'en' : 'nb-NO',
          },
          breadcrumbs([
            { name: t('seo.common.home'), path: '/' },
            { name: t('seo.pages.bransjer.crumb'), path: '/bransjer' },
            { name: own('nav'), path: `/${landing.slug}` },
          ]),
          faqPage(faq),
        )}
      />
      {preview ? <PreviewBanner text={t('industry.preview')} /> : null}
      <IndustryLanding landing={landing} lang={lang} />
    </>
  )
}
