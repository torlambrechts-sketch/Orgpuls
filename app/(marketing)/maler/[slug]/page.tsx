import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { PageTemplate } from '@/components/marketing/PageTemplate'
import { TemplateDownload, type TemplateDownloadWords } from '@/components/marketing/TemplateDownload'
import { pageMeta } from '@/lib/marketing/meta'
import { CONTACT_MAIL } from '@/lib/marketing/site'
import { granted, TEMPLATE_COOKIE, templateBySlug, TEMPLATES } from '@/lib/marketing/templates'

/**
 * A free template's page (D-241): what is in it and what it builds on, with the form beside the hero.
 * A browser that has asked for it before (its cookie names the template) sees the files at once.
 */
type Props = { params: Promise<{ slug: string }> }

/** the articles a template's page points on to */
const READ_ON: Record<string, string[]> = {
  pakke: ['krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'risikovurdering-av-psykososialt-arbeidsmiljo'],
  risikovurdering: ['risikovurdering-av-psykososialt-arbeidsmiljo', 'krav-til-kartlegging-av-psykososialt-arbeidsmiljo'],
  tiltaksbank: ['fra-resultater-til-tiltak', 'slik-gar-dere-gjennom-resultatene-med-de-ansatte'],
  arshjul: ['hvor-ofte-bor-dere-male-arbeidsmiljoet', 'krav-til-kartlegging-av-psykososialt-arbeidsmiljo'],
  qps: ['medarbeiderundersokelse-sporsmal', 'anonym-medarbeiderundersokelse'],
  informasjon: ['anonym-medarbeiderundersokelse', 'verneombudets-rolle-i-kartleggingen'],
}

const Words = z.object({
  title: z.string(),
  text: z.string(),
  name: z.string(),
  mail: z.string(),
  org: z.string(),
  orgPlaceholder: z.string(),
  role: z.string(),
  rolePlaceholder: z.string(),
  consent: z.string(),
  send: z.string(),
  invalid: z.string(),
  limited: z.string(),
  failed: z.string(),
  privacy: z.string(),
  readyTitle: z.string(),
  readyText: z.string(),
}) satisfies z.ZodType<TemplateDownloadWords>

export function generateStaticParams() {
  return TEMPLATES.map((t) => ({ slug: t.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tpl = templateBySlug((await params).slug)
  if (!tpl) return {}
  const t = await getTranslations()
  return pageMeta({ title: t(`seo.maler.${tpl.key}.title`), description: t(`seo.maler.${tpl.key}.description`), path: `/maler/${tpl.slug}` })
}

export default async function Page({ params }: Props) {
  const tpl = templateBySlug((await params).slug)
  if (!tpl) notFound()
  const t = await getTranslations()
  const labels = z.record(z.string(), z.string()).parse(t.raw(`seo.maler.${tpl.key}.files`))
  const ready = granted((await cookies()).get(TEMPLATE_COOKIE)?.value).includes(tpl.slug)
  return (
    <PageTemplate
      k={`seo.maler.${tpl.key}`}
      path={`/maler/${tpl.slug}`}
      parent={{ name: t('seo.maler.index.crumb'), path: '/maler' }}
      articles={READ_ON[tpl.key]}
      plain
      heroAside={
        <TemplateDownload
          slug={tpl.slug}
          files={tpl.files.map((f) => ({ name: f.name, format: f.format, label: labels[f.name] ?? f.name }))}
          ready={ready}
          to={CONTACT_MAIL}
          words={Words.parse(t.raw('seo.maler.form'))}
        />
      }
    />
  )
}
