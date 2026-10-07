import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { EN_HOST, EN_URL, hostOf, MAIN_URL } from '@/lib/hosts'
import { ARTICLES, LANDING_PAGES, landingKey, SITE_PAGES } from '@/lib/marketing/site'
import { TEMPLATES } from '@/lib/marketing/templates'
import { getIndustry, INDUSTRIES, liveQuestionPages, pageIn } from '@/content/industries'
import { landingFor } from '@/content/industries/landing'
import { siteIndexing } from '@/lib/site/indexing'

/**
 * /llms.txt (llmstxt.org): the public site as a reading list for language models and AI search —
 * what Orgpuls is, and each page a person would want an answer from, with its own description.
 * The same pages as the sitemap (app/sitemap.ts), in the host's language, and the same words as
 * each page's own <title> and meta description, so nothing here can say what the site does not.
 */
export const revalidate = 3600

export async function GET() {
  if (!(await siteIndexing())) return new Response('Not found', { status: 404 })
  const en = hostOf((await headers()).get('host')) === EN_HOST
  const locale = en ? 'en' : 'no'
  const base = en ? EN_URL : MAIN_URL
  const t = await getTranslations({ locale })
  const line = (path: string, title: string, description: string) => `- [${title.replace(/ \| Orgpuls$/, '')}](${base}${path}): ${description}`

  const industries = INDUSTRIES.flatMap((i) => {
    const page = pageIn(i, locale)
    const landing = landingFor(i.slug)
    if (!page?.launched || !landing?.live[locale]) return []
    const seo = (k: string) => t(`site.bransje.${landing.msg}.seo.${k}`)
    const out = [line(`/${i.slug}`, seo('title'), seo('description'))]
    if (page.questionPage && liveQuestionPages(locale).includes(i.slug))
      out.push(line(`/${i.slug}/sporsmal`, page.questionPage.metaTitle, page.questionPage.metaDescription))
    return out
  })

  const body = [
    '# Orgpuls',
    '',
    `> ${t('seo.home.description')}`,
    '',
    `## ${t('seo.llms.pages')}`,
    line('/', t('seo.home.title'), t('seo.home.description')),
    ...SITE_PAGES.map((p) =>
      // Hvorfor keeps its words with the page (site.hvorfor), the others under seo.pages
      p.key === 'hvorfor'
        ? line('/hvorfor', t('site.hvorfor.seoTitle'), t('site.hvorfor.seoDescription'))
        : line(`/${p.slug}`, t(`seo.pages.${p.key}.title`), t(`seo.pages.${p.key}.description`)),
    ),
    line('/demo', t('demo.metaTitle'), t('demo.metaDescription')),
    '',
    `## ${t('seo.llms.forWho')}`,
    ...LANDING_PAGES.filter((p) => !getIndustry(p)).map((p) =>
      line(`/${p}`, t(`seo.lp.${landingKey(p)}.title`), t(`seo.lp.${landingKey(p)}.description`)),
    ),
    '',
    `## ${t('seo.llms.industries')}`,
    ...industries,
    '',
    `## ${t('seo.llms.articles')}`,
    line('/artikler', t('seo.index.title'), t('seo.index.description')),
    ...ARTICLES.map((a) => line(`/artikler/${a.slug}`, t(`seo.articles.${a.key}.title`), t(`seo.articles.${a.key}.description`))),
    '',
    `## ${t('seo.llms.templates')}`,
    line('/maler', t('seo.maler.index.title'), t('seo.maler.index.description')),
    ...TEMPLATES.map((m) => line(`/maler/${m.slug}`, t(`seo.maler.${m.key}.title`), t(`seo.maler.${m.key}.description`))),
    '',
  ].join('\n')

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
