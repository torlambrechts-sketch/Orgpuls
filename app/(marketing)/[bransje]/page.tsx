import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { IndustryView } from '@/components/industry/IndustryView'
import { JsonLd } from '@/components/marketing/JsonLd'
import { LandingTemplate } from '@/components/marketing/LandingTemplate'
import { getIndustry, INDUSTRIES, pageIn } from '@/content/industries'
import { stripCites } from '@/content/industries/cites'
import type { IndustryPage } from '@/content/industries/types'
import type { PageLang } from '@/content/industries/modules'
import { assertIndustries } from '@/content/industries/validate'
import { flag, type FlagName } from '@/lib/flags'
import { pageMeta } from '@/lib/marketing/meta'
import { breadcrumbs, faqPage, graph, organization } from '@/lib/marketing/schema'
import { absolute, landingKey, type LandingSlug } from '@/lib/marketing/site'

/**
 * An industry page (bransjesider-og-tilleggsmoduler.md § B1, D-118): /bygg-og-anlegg and
 * /helse-og-omsorg, from content/industries. Only the registry's slugs exist; the build fails
 * if a page quotes a statement its module does not have (assertIndustries).
 *
 * Which page a visitor gets, in the site's language (www Norwegian, en.orgpuls.com English):
 *   - an industry with a page in that language that is launched: the industry template;
 *   - the same before launch, only with ?forhandsvis=1, marked noindex, so it can be reviewed
 *     without the public site describing a module nobody can buy yet;
 *   - otherwise: the landing page the address had before, whose words are messages in both
 *     languages (seo.lp.*). Each language launches on its own (D-120).
 */
export const dynamicParams = false

export function generateStaticParams() {
  assertIndustries()
  return INDUSTRIES.map((i) => ({ bransje: i.slug }))
}

type Props = { params: Promise<{ bransje: string }>; searchParams: Promise<{ forhandsvis?: string }> }

async function resolve(props: Props) {
  const { bransje } = await props.params
  const entry = getIndustry(bransje)
  if (!entry) notFound()
  const preview = (await props.searchParams).forhandsvis === '1'
  const lang: PageLang = (await getLocale()) === 'en' ? 'en' : 'no'
  const own = pageIn(entry, lang)
  const page = own && (own.launched || preview) ? own : null
  return { slug: entry.slug, page, lang, preview: preview && !!page && !page.launched }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug, page, preview } = await resolve(props)
  if (!page) {
    const t = await getTranslations()
    const k = `seo.lp.${landingKey(slug as LandingSlug)}`
    return pageMeta({ title: t(`${k}.title`), description: t(`${k}.description`), path: `/${slug}`, image: `/og/${slug}.png` })
  }
  const meta = await pageMeta({ title: page.seo.title, description: page.seo.description, path: `/${slug}`, image: `/og/${slug}.png` })
  return preview ? { ...meta, robots: { index: false, follow: false } } : meta
}

export default async function IndustryRoute(props: Props) {
  const { slug, page, lang, preview } = await resolve(props)
  if (!page) return <LandingTemplate slug={slug as LandingSlug} />

  const t = await getTranslations()
  const core = (key: string, ordinal: number) => ({ factor: t(`factor.${key}.label`), text: t(`factor.${key}.s${ordinal}`) })
  const faq = page.faq.filter((f) => !f.featureFlag || flag(f.featureFlag as FlagName))

  return (
    <>
      <JsonLd
        data={graph(
          organization(),
          { '@type': 'WebPage', url: absolute(`/${slug}`), name: page.seo.title, description: page.seo.description, inLanguage: lang === 'en' ? 'en' : 'nb-NO' },
          breadcrumbs([
            { name: t('seo.common.home'), path: '/' },
            { name: t('seo.pages.bruksomrader.crumb'), path: '/bruksomrader' },
            { name: page.navLabel, path: `/${slug}` },
          ]),
          ...(faq.length ? [faqPage(faq.map((f) => ({ q: stripCites(f.q), a: stripCites(f.a) })))] : []),
        )}
      />
      {preview ? <PreviewBanner text={t('industry.preview')} /> : null}
      <IndustryView page={page as IndustryPage} core={core} lang={lang} />
    </>
  )
}

export function PreviewBanner({ text }: { text: string }) {
  return (
    <div role="note" className="bg-sbg px-[18px] py-[10px] text-center text-[13px] font-semibold text-ink">
      {text}
    </div>
  )
}
