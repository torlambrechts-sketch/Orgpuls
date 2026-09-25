import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Faq } from '@/components/start/Faq'
import { Blocks as BlocksSchema, FaqItems } from '@/lib/marketing/blocks'
import { breadcrumbs, faqPage, graph, organization } from '@/lib/marketing/schema'
import type { ShotId } from '@/lib/marketing/shot-ids'
import { absolute } from '@/lib/marketing/site'
import { ArticleCards } from './ArticleCards'
import { BlockSections, LinkCards, sectionCount } from './Blocks'
import { CtaBand } from './CtaBand'
import { JsonLd } from './JsonLd'
import { ProductShot } from './ProductShot'
import { Rich } from './Rich'
import { Container, H2, Section } from './Section'
import { SignupStart } from './SignupStart'

/**
 * A public page: a hero whose H1 answers the reader's question, the page's blocks, its
 * questions if it has any, articles for the reader who wants more, and the start page's
 * closing offer. Landing pages, Plattform, Priser, Om oss and the rest are all this one
 * shape, with their words in `messages` under the key given (`seo.lp.*`, `seo.pages.*`).
 *
 * The hero keeps the start page's type, pill and buttons. Optional parts are read only when
 * the page's messages carry them: a second action (`tip`), `faq`, `cta`, the closing words.
 */
export async function PageTemplate({
  k,
  path,
  parent,
  articles,
  heroShot,
  related,
  schemaType = 'WebPage',
  extraSchema = [],
}: {
  /** the page's message key, e.g. `seo.pages.plattform` */
  k: string
  path: string
  /** a section the page sits under, for the breadcrumb: Bruksområder for a use case */
  parent?: { name: string; path: string }
  articles?: string[]
  /** a picture of the product beside the hero's words (D-85) */
  heroShot?: ShotId
  /** other pages for the same reader, as link cards before the articles */
  related?: { href: string; title: string; text: string }[]
  schemaType?: 'WebPage' | 'AboutPage' | 'ContactPage' | 'CollectionPage'
  extraSchema?: Record<string, unknown>[]
}) {
  const t = await getTranslations()
  const blocks = BlocksSchema.parse(t.raw(`${k}.blocks`))
  const faq = t.has(`${k}.faq`) ? FaqItems.parse(t.raw(`${k}.faq`)) : []
  const tip = t.has(`${k}.tip.label`)
    ? `mailto:?subject=${encodeURIComponent(t(`${k}.tip.subject`))}&body=${encodeURIComponent(t(`${k}.tip.body`))}`
    : null
  const trail = [{ name: t('seo.common.home'), path: '/' }, ...(parent ? [parent] : []), { name: t(`${k}.crumb`), path }]

  // bands alternate base and surface down the page: the hero is base, the body starts on surface
  const bodyBands = sectionCount(blocks)
  const tone = (n: number): 'base' | 'surface' => ((bodyBands + n) % 2 === 0 ? 'surface' : 'base')
  const extras = [faq.length > 0, !!related?.length, !!articles?.length]
  const toneOf = (which: number) => tone(extras.slice(0, which).filter(Boolean).length)

  return (
    <>
      <JsonLd
        data={graph(
          organization(),
          { '@type': schemaType, url: absolute(path), name: t(`${k}.title`), description: t(`${k}.description`), inLanguage: 'nb-NO' },
          breadcrumbs(trail),
          ...(faq.length ? [faqPage(faq)] : []),
          ...extraSchema,
        )}
      />

      {/* hero: words and the orgnr field on 7 of 12 columns, the product on 5 running past the edge (4.2) */}
      <section aria-labelledby="hero-title" className="w-full overflow-x-clip bg-bg pb-8 pt-4 sm:pt-8 lg:flex lg:min-h-[70svh] lg:items-center lg:py-16">
        <Container>
          <div className="grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-8">
            <div className={`min-w-0 ${heroShot ? 'lg:col-span-7' : 'lg:col-span-9'}`}>
              <nav aria-label={t('seo.common.breadcrumb')} className="hidden text-mk-small text-mut sm:block">
                {trail.slice(0, -1).map((c) => (
                  <span key={c.path}>
                    <Link href={c.path as Route}>{c.name}</Link>
                    <span aria-hidden="true"> / </span>
                  </span>
                ))}
                <span aria-current="page">{t(`${k}.crumb`)}</span>
              </nav>
              <span className="mt-4 hidden items-center gap-2 rounded-pill bg-sbg px-3 py-1 text-mk-small font-bold sm:inline-flex">
                <span className="block h-2 w-2 rounded-pill bg-link" />
                {t(`${k}.kicker`)}
              </span>
              <h1
                id="hero-title"
                className="m-0 font-display text-mk-h1 font-semibold [overflow-wrap:break-word] [text-wrap:balance] sm:mt-4"
              >
                {t(`${k}.h1`)}
              </h1>
              <p className="m-0 mt-4 max-w-prose text-mk-lead text-body [text-wrap:pretty] lg:mt-6">{t(`${k}.lead`)}</p>
              <div className="mt-5 lg:mt-8">
                <SignupStart
                  label={t.has(`${k}.signupLabel`) ? t(`${k}.signupLabel`) : t('seo.signup.label')}
                  submit={t('seo.signup.submit')}
                  invalid={t('seo.signup.invalid')}
                />
              </div>
              <p className="m-0 mt-3 text-mk-small text-mut">
                <span className="block">{t('seo.common.priceLine')}</span>
                <span className="block">{t('seo.common.anonymity')}</span>
              </p>
              {tip ? (
                <a
                  href={tip}
                  className="mt-6 inline-flex min-h-12 items-center rounded-tile border border-ink bg-transparent px-5 py-2 text-mk-card font-semibold text-ink no-underline hover:text-ink hover:no-underline"
                >
                  {t(`${k}.tip.label`)}
                </a>
              ) : null}
            </div>
            {heroShot ? (
              <div className="min-w-0 lg:col-span-5">
                <ProductShot id={heroShot} priority bleed testId="hero-image" />
              </div>
            ) : null}
          </div>
        </Container>
      </section>

      <BlockSections blocks={blocks} />

      {faq.length ? (
        <Section tone={toneOf(0)} label="faq-title">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-4">
              <H2 id="faq-title">{t('start.faqEyebrow')}</H2>
              <p className="m-0 mt-4 max-w-prose text-mk-lead text-mut [text-wrap:pretty]">
                <Rich text={t('seo.common.faqLead')} />
              </p>
            </div>
            <div className="min-w-0 lg:col-span-8">
              <Faq items={faq.map((f, i) => ({ key: String(i), q: f.q, a: f.a }))} />
            </div>
          </div>
        </Section>
      ) : null}

      {related?.length ? (
        <Section tone={toneOf(1)} label="related-title">
          <H2 id="related-title">{t('seo.common.related')}</H2>
          <div className="mt-8">
            <LinkCards items={related} />
          </div>
        </Section>
      ) : null}

      {articles?.length ? (
        <Section tone={toneOf(2)} label="articles-title">
          <H2 id="articles-title">{t('seo.common.articlesTitle')}</H2>
          <ArticleCards slugs={articles} />
        </Section>
      ) : null}

      <CtaBand
        title={t.has(`${k}.finalTitle`) ? t(`${k}.finalTitle`) : t('start.finalTitle')}
        body={t.has(`${k}.finalBody`) ? t(`${k}.finalBody`) : t('start.finalBody')}
      />
    </>
  )
}
