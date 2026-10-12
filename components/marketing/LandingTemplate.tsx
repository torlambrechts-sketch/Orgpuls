import { getTranslations } from 'next-intl/server'
import {
  INFORMATIONAL_PAGES,
  LANDING_HERO,
  LANDING_RELATED,
  LANDING_TEMPLATE,
  landingKey,
  type LandingSlug,
} from '@/lib/marketing/site'
import { PageTemplate } from './PageTemplate'
import { ownSite, serves, siteArticles } from '@/lib/site/own'
import { VoTip, type VoTipWords } from './VoTip'
import { MAIN_URL } from '@/lib/hosts'
import { LawArt } from './art/LawArt'
import { SafetyRepArt } from './art/SafetyRepArt'
import { SmallBizArt } from './art/SmallBizArt'

/**
 * A landing page: one search intent, one reader, one offer (D-79). It is a PageTemplate
 * whose words are `seo.lp.<slug>`, under Bruksområder (an industry's, under Bransjer), with a picture of the screen that
 * answers its reader, two neighbouring landing pages and the two articles that go with it.
 */
export async function LandingTemplate({ slug, parent }: { slug: LandingSlug; parent?: { name: string; path: string } }) {
  const t = await getTranslations()
  // a site of its own (D-270) serves only some neighbours, and files a page under its articles only
  // where it publishes some (Empvibe's own since UK-H, D-278; none on Sweden's)
  const own = await ownSite()
  const articles = (await siteArticles()).landing[slug]
  // an informational page (D-236): under Artikler, no product picture, no sales pages beside it
  if (INFORMATIONAL_PAGES.includes(slug))
    return (
      <PageTemplate
        k={`seo.lp.${landingKey(slug)}`}
        path={`/${slug}`}
        parent={serves(own, '/artikler') ? { name: t('seo.index.crumb'), path: '/artikler' } : undefined}
        articles={articles}
        template={LANDING_TEMPLATE[slug]}
        // «Tips ledelsen»: a finished e-mail to the daglig leder, written in the browser (D-246)
        extra={
          slug === 'verneombud' ? (
            <VoTip
              words={t.raw('seo.voTip') as VoTipWords}
              link={`${own?.site.url ?? MAIN_URL}/?utm_source=${own ? 'safety-representative' : 'verneombud'}&utm_medium=tips`}
            />
          ) : undefined
        }
        informational
        heroArt={slug === 'lovkrav' ? <LawArt className="h-auto w-full max-w-[440px]" seal={own ? '✓' : '§'} /> : <SafetyRepArt className="h-auto w-full max-w-[440px]" />}
      />
    )
  return (
    <PageTemplate
      k={`seo.lp.${landingKey(slug)}`}
      path={`/${slug}`}
      parent={parent ?? { name: t('seo.pages.bruksomrader.crumb'), path: '/bruksomrader' }}
      articles={articles}
      template={LANDING_TEMPLATE[slug]}
      heroShot={LANDING_HERO[slug]}
      heroArt={slug === 'smaa-bedrifter' ? <SmallBizArt className="h-auto w-full max-w-[440px]" /> : undefined}
      related={LANDING_RELATED[slug]
        .filter((r) => serves(own, `/${r}`))
        .slice(0, 2)
        .map((r) => ({
          href: `/${r}`,
          title: t(`seo.lp.${landingKey(r)}.card.title`),
          text: t(`seo.lp.${landingKey(r)}.card.text`),
        }))}
    />
  )
}
