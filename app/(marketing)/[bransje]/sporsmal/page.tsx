import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { QuestionView } from '@/components/industry/QuestionView'
import { JsonLd } from '@/components/marketing/JsonLd'
import { getIndustry, INDUSTRIES, pageIn } from '@/content/industries'
import type { PageLang } from '@/content/industries/modules'
import { assertIndustries } from '@/content/industries/validate'
import { pageMeta } from '@/lib/marketing/meta'
import { breadcrumbs, graph, organization } from '@/lib/marketing/schema'
import { absolute } from '@/lib/marketing/site'
import { PreviewBanner } from '../page'

/**
 * /<slug>/sporsmal (§ B1, D-118): the module's whole question set, generated from its file.
 * It exists only for an industry with a module, in each language that has a page for it (the
 * English one reads the module's translation, D-120); before launch only with ?forhandsvis=1,
 * marked noindex. Its hreflang names the other language only once that one is launched too.
 */
export const dynamicParams = false

export function generateStaticParams() {
  assertIndustries()
  return INDUSTRIES.filter((i) => [i.page, i.pageEn].some((p) => p?.module && p.questionPage)).map((i) => ({ bransje: i.slug }))
}

type Props = { params: Promise<{ bransje: string }>; searchParams: Promise<{ forhandsvis?: string }> }

async function resolve(props: Props) {
  const { bransje } = await props.params
  const entry = getIndustry(bransje)
  const lang: PageLang = (await getLocale()) === 'en' ? 'en' : 'no'
  const page = pageIn(entry, lang)
  if (!page?.module || !page.questionPage) notFound()
  const preview = (await props.searchParams).forhandsvis === '1'
  if (!page.launched && !preview) notFound()
  const twin = pageIn(entry, lang === 'en' ? 'no' : 'en')
  return {
    page: { ...page, module: page.module, questionPage: page.questionPage },
    lang,
    preview: !page.launched,
    twinLive: !!(page.launched && twin?.launched && twin.questionPage),
  } as const
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { page, preview, twinLive } = await resolve(props)
  const meta = await pageMeta({
    title: `${page.questionPage.crumb}: ${page.navLabel} | Orgpuls`,
    description: page.questionPage.lead,
    path: `/${page.slug}/sporsmal`,
    image: `/og/${page.slug}.png`,
    noTwin: !twinLive,
  })
  return preview ? { ...meta, robots: { index: false, follow: false } } : meta
}

export default async function QuestionRoute(props: Props) {
  const { page, lang, preview } = await resolve(props)
  const t = await getTranslations()
  return (
    <>
      <JsonLd
        data={graph(
          organization(),
          { '@type': 'WebPage', url: absolute(`/${page.slug}/sporsmal`), name: page.questionPage.crumb, inLanguage: lang === 'en' ? 'en' : 'nb-NO' },
          breadcrumbs([
            { name: t('seo.common.home'), path: '/' },
            { name: page.navLabel, path: `/${page.slug}` },
            { name: page.questionPage.crumb, path: `/${page.slug}/sporsmal` },
          ]),
        )}
      />
      {preview ? <PreviewBanner text={t('industry.preview')} /> : null}
      <QuestionView page={page} lang={lang} />
    </>
  )
}
