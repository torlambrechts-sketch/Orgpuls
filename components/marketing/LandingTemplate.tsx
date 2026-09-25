import { getTranslations } from 'next-intl/server'
import { LANDING_ARTICLES, LANDING_HERO, LANDING_RELATED, landingKey, type LandingSlug } from '@/lib/marketing/site'
import { PageTemplate } from './PageTemplate'

/**
 * A landing page: one search intent, one reader, one offer (D-79). It is a PageTemplate
 * whose words are `seo.lp.<slug>`, under Bruksområder, with a picture of the screen that
 * answers its reader, two neighbouring landing pages and the two articles that go with it.
 */
export async function LandingTemplate({ slug }: { slug: LandingSlug }) {
  const t = await getTranslations()
  return (
    <PageTemplate
      k={`seo.lp.${landingKey(slug)}`}
      path={`/${slug}`}
      parent={{ name: t('seo.pages.bruksomrader.crumb'), path: '/bruksomrader' }}
      articles={LANDING_ARTICLES[slug]}
      heroShot={LANDING_HERO[slug]}
      related={LANDING_RELATED[slug].map((r) => ({
        href: `/${r}`,
        title: t(`seo.lp.${landingKey(r)}.card.title`),
        text: t(`seo.lp.${landingKey(r)}.card.text`),
      }))}
    />
  )
}
