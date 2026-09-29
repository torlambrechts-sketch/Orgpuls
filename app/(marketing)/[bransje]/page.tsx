import type { Metadata, Route } from 'next'
import { notFound, permanentRedirect, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { IndustryView } from '@/components/industry/IndustryView'
import { PreviewBanner } from '@/components/industry/PreviewBanner'
import { CmsView, cmsMetadata } from '@/components/marketing/CmsView'
import { JsonLd } from '@/components/marketing/JsonLd'
import { LandingTemplate } from '@/components/marketing/LandingTemplate'
import { getIndustry, hasPublicPage, INDUSTRIES, pageIn } from '@/content/industries'
import { stripCites } from '@/content/industries/cites'
import type { IndustryPage } from '@/content/industries/types'
import type { PageLang } from '@/content/industries/modules'
import { assertIndustries } from '@/content/industries/validate'
import { cmsPage, cmsPreview, cmsRedirect } from '@/lib/cms/read'
import { flag, type FlagName } from '@/lib/flags'
import { pageMeta } from '@/lib/marketing/meta'
import { breadcrumbs, faqPage, graph, organization } from '@/lib/marketing/schema'
import { absolute, LANDING_PAGES, landingKey, type LandingSlug } from '@/lib/marketing/site'

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
 *
 * Any other address is a page made in the CMS (0114, X-094), when one is live at it in the site's
 * language, or a draft through its preview link (?cms=<token>); else an old address the admin has
 * redirected; else nothing. The site's own routes and the industries win over all of these.
 */
export const dynamicParams = true

export function generateStaticParams() {
  assertIndustries()
  return INDUSTRIES.map((i) => ({ bransje: i.slug }))
}

type Props = { params: Promise<{ bransje: string }>; searchParams: Promise<{ forhandsvis?: string; cms?: string; cmsl?: string }> }

/** A page from the CMS at this address, live or previewed */
async function cmsAt(props: Props) {
  const { bransje } = await props.params
  const { cms: token, cmsl } = await props.searchParams
  const lang = await getLocale()
  // a preview names the draft's language, since one host serves both languages outside production
  return token ? cmsPreview(token, 'page', bransje, cmsl === 'en' || cmsl === 'no' ? cmsl : lang) : cmsPage('page', bransje, lang)
}

async function resolve(props: Props) {
  const { bransje } = await props.params
  const entry = getIndustry(bransje)
  if (!entry) notFound()
  const preview = (await props.searchParams).forhandsvis === '1'
  const lang: PageLang = (await getLocale()) === 'en' ? 'en' : 'no'
  const own = pageIn(entry, lang)
  const page = own && (own.launched || preview) ? own : null
  // an industry that never had a landing page has nothing to show before launch
  if (!page && !(LANDING_PAGES as readonly string[]).includes(entry.slug)) notFound()
  // hreflang names the other language only where that address shows a page (D-131)
  const twinLive = hasPublicPage(entry, lang === 'en' ? 'no' : 'en')
  return { slug: entry.slug, page, lang, preview: preview && !!page && !page.launched, twinLive }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  if (!getIndustry((await props.params).bransje)) {
    const cms = await cmsAt(props)
    return cms ? cmsMetadata(cms) : {}
  }
  const { slug, page, preview, twinLive } = await resolve(props)
  if (!page) {
    const t = await getTranslations()
    const k = `seo.lp.${landingKey(slug as LandingSlug)}`
    return pageMeta({ title: t(`${k}.title`), description: t(`${k}.description`), path: `/${slug}`, image: `/og/${slug}.png` })
  }
  const meta = await pageMeta({ title: page.seo.title, description: page.seo.description, path: `/${slug}`, image: `/og/${slug}.png`, noTwin: !twinLive })
  return preview ? { ...meta, robots: { index: false, follow: false } } : meta
}

export default async function IndustryRoute(props: Props) {
  const { bransje } = await props.params
  if (!getIndustry(bransje)) {
    const cms = await cmsAt(props)
    if (cms) return <CmsView page={cms} />
    const moved = await cmsRedirect(`/${bransje}`)
    if (moved) (moved.permanent ? permanentRedirect : redirect)(moved.to as Route)
    notFound()
  }
  const { slug, page, lang, preview } = await resolve(props)
  const t = await getTranslations()
  // under Bransjer, as the header's menu has it (D-129), whichever page the address shows
  const parent = { name: t('seo.pages.bransjer.crumb'), path: '/bransjer' }
  if (!page) return <LandingTemplate slug={slug as LandingSlug} parent={parent} />

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
            parent,
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
