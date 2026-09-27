import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { industryCards, NewChip } from '@/components/industry/IndustryCards'
import { JsonLd } from '@/components/marketing/JsonLd'
import { Crumbs, Eyebrow, StartBand } from '@/components/site/parts'
import { getIndustry, pageIn } from '@/content/industries'
import { moduleFile } from '@/content/industries/modules'
import { pageMeta } from '@/lib/marketing/meta'
import { breadcrumbs, graph, organization } from '@/lib/marketing/schema'

/**
 * /bransjer (D-125): the industries Orgpuls has its own page and question set for, linked
 * from the start page. Tor asked for it on 2026-09-27. The design has no page for it, so it is
 * the site's own parts — crumbs, the explore cards of the start page, the start band — with
 * words in `site.bransjer`. Each card's figures come from the module file, never typed here.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('seo.pages.bransjer')
  return pageMeta({ title: t('title'), description: t('description'), path: '/bransjer' })
}

const FILLS = ['bg-sbg', 'bg-mint'] as const

export default async function BransjerPage() {
  const t = await getTranslations('site.bransjer')
  const newLabel = (await getTranslations('site.home.industries'))('new')
  const lang = (await getLocale()) === 'en' ? 'en' : 'no'
  // an industry is shown once its address has a page to show, in the registry's order, «Ny» for 90 days (D-141)
  const cards = await industryCards()

  return (
    <div>
      <JsonLd
        data={graph(
          organization(),
          breadcrumbs([
            { name: 'Orgpuls', path: '/' },
            { name: t('crumb'), path: '/bransjer' },
          ]),
        )}
      />
      <section className="mx-auto max-w-[1120px] px-[26px] pt-[60px]">
        <Crumbs page={t('crumb')} />
        <h1 className="m-0 mt-[16px] max-w-[20ch] font-display text-[50px] font-semibold leading-[1.06] [text-wrap:balance] max-sm:text-[36px]">
          {t('h1')}
        </h1>
        <p className="m-0 mt-[16px] max-w-[58ch] text-[17px] leading-[1.65] text-body [text-wrap:pretty]">{t('lead')}</p>
      </section>

      <section className="mx-auto max-w-[1120px] px-[26px] pt-[40px]" aria-label={t('crumb')}>
        <div className="grid gap-[13px] [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
          {cards.map((c, i) => {
            const page = pageIn(getIndustry(c.slug), lang) ?? pageIn(getIndustry(c.slug), 'no')
            const mod = page?.module ? moduleFile(page.module.key, page.module.version, lang) : null
            return (
              <Link
                key={c.slug}
                href={`/${c.slug}` as Route}
                className={`flex min-h-[240px] flex-col gap-[10px] rounded-card border border-line p-[24px] text-ink hover:text-ink ${FILLS[i % FILLS.length]}`}
              >
                <span className="flex items-start justify-between gap-[10px]">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-mut">{c.k}</span>
                  {c.isNew ? <NewChip label={newLabel} /> : null}
                </span>
                <span className="font-display text-[26px] font-semibold leading-[1.15] [text-wrap:balance]">{c.t}</span>
                <span className="text-[14px] leading-[1.55] text-body [text-wrap:pretty]">{c.d}</span>
                {mod ? (
                  <span className="text-[12.5px] font-semibold text-mut">
                    {t('facts', {
                      factors: mod.factors.length,
                      statements: mod.factors.reduce((n, f) => n + f.items.length, 0),
                      minutes: mod.estimated_minutes,
                    })}
                  </span>
                ) : null}
                <span className="mt-auto text-[13.5px] font-bold text-link">{c.cta} →</span>
              </Link>
            )
          })}
        </div>
        <div className="mt-[26px] rounded-panel border border-line bg-sf px-[22px] py-[20px]">
          <Eyebrow>{t('other.k')}</Eyebrow>
          <p className="m-0 mt-[8px] max-w-[70ch] text-[14.5px] leading-[1.6] text-body [text-wrap:pretty]">
            {t.rich('other.d', {
              link: (chunks) => (
                <Link href="/bruksomrader" className="font-semibold underline underline-offset-[3px]">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
      </section>

      <StartBand />
    </div>
  )
}
