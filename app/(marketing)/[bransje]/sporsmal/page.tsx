import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { QuestionView } from '@/components/industry/QuestionView'
import { JsonLd } from '@/components/marketing/JsonLd'
import { getIndustry, INDUSTRIES } from '@/content/industries'
import { assertIndustries } from '@/content/industries/validate'
import { pageMeta } from '@/lib/marketing/meta'
import { breadcrumbs, graph, organization } from '@/lib/marketing/schema'
import { absolute } from '@/lib/marketing/site'
import { PreviewBanner } from '../page'

/**
 * /<slug>/sporsmal (§ B1, D-118): the module's whole question set, generated from its file.
 * It exists only for an industry with a module; Norwegian only, so it has no English twin and
 * says so in its metadata; before launch only with ?forhandsvis=1, marked noindex.
 */
export const dynamicParams = false

export function generateStaticParams() {
  assertIndustries()
  return INDUSTRIES.filter((i) => i.page?.module && i.page.questionPage).map((i) => ({ bransje: i.slug }))
}

type Props = { params: Promise<{ bransje: string }>; searchParams: Promise<{ forhandsvis?: string }> }

async function resolve(props: Props) {
  const { bransje } = await props.params
  const page = getIndustry(bransje)?.page
  if (!page?.module || !page.questionPage) notFound()
  if ((await getLocale()) === 'en') notFound()
  const preview = (await props.searchParams).forhandsvis === '1'
  if (!page.launched && !preview) notFound()
  return { page: { ...page, module: page.module, questionPage: page.questionPage }, preview: !page.launched }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { page, preview } = await resolve(props)
  const meta = await pageMeta({
    title: `${page.questionPage.crumb}: ${page.navLabel} | Orgpuls`,
    description: page.questionPage.lead,
    path: `/${page.slug}/sporsmal`,
    image: `/og/${page.slug}.png`,
    norwegianOnly: true,
  })
  return preview ? { ...meta, robots: { index: false, follow: false } } : meta
}

export default async function QuestionRoute(props: Props) {
  const { page, preview } = await resolve(props)
  const t = await getTranslations()
  return (
    <>
      <JsonLd
        data={graph(
          organization(),
          { '@type': 'WebPage', url: absolute(`/${page.slug}/sporsmal`), name: page.questionPage.crumb, inLanguage: 'nb-NO' },
          breadcrumbs([
            { name: t('seo.common.home'), path: '/' },
            { name: page.navLabel, path: `/${page.slug}` },
            { name: page.questionPage.crumb, path: `/${page.slug}/sporsmal` },
          ]),
        )}
      />
      {preview ? <PreviewBanner text={t('industry.preview')} /> : null}
      <QuestionView page={page} />
    </>
  )
}
