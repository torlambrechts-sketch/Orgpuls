import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { z } from 'zod'
import { JsonLd } from '@/components/marketing/JsonLd'
import { SectionNav } from '@/components/site/SectionNav'
import { SiteFaq } from '@/components/site/SiteFaq'
import { Overview, StorySection, type MockShape } from '@/components/site/Story'
import { Crumbs, HeroButtons, SectionHead, StartBand } from '@/components/site/parts'
import { pageMeta } from '@/lib/marketing/meta'
import { breadcrumbs, faqPage, graph, organization } from '@/lib/marketing/schema'
import { StoryWords, USES, type UseKey } from '@/lib/site/story'
import { zip } from '@/lib/site/zip'

/**
 * Hvorfor Orgpuls (D-88): design-reference/orgpuls/nettside/Hvorfor.dc.html. The choices
 * the product is built on, each beside a drawing of it, then a comparison and the questions
 * people ask. The words are `site.hvorfor`; the drawings' numbers are here.
 */
export const dynamic = 'force-static'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.hvorfor')
  return pageMeta({ title: t('seoTitle'), description: t('seoDescription'), path: '/hvorfor' })
}

const SECTIONS: { id: string; uses: UseKey[]; shape: MockShape }[] = [
  { id: 'positivt', uses: ['res', 'kom'], shape: { kind: 'bars', values: [78, 76, 71, 66] } },
  { id: 'kontinuerlig', uses: ['mal', 'vis'], shape: { kind: 'trend', values: [36, 31, 39, 46, 55], goal: 60 } },
  { id: 'handling', uses: ['tilt'], shape: { kind: 'steps', states: ['done', 'done', 'now', '', ''] } },
  {
    id: 'anonymitet',
    uses: ['rol', 'svar'],
    shape: { kind: 'heat', rows: [[49, 51, 70, 74, 81], [46, 31, 58, 59, 75], null, null] },
  },
  { id: 'forskning', uses: ['svar', 'res'], shape: { kind: 'cards', tones: ['neu', 'neu', 'neu'] } },
  { id: 'loven', uses: ['rap', 'rol'], shape: { kind: 'cards', tones: ['pos', 'pos', 'pos'] } },
]

const Row = z.object({ k: z.string(), a: z.string(), b: z.string(), c: z.string() })
const Qa = z.object({ q: z.string(), a: z.string() })

export default async function HvorforPage() {
  const t = await getTranslations('site.hvorfor')
  const story = await getTranslations('site.story')
  const chrome = await getTranslations('site.chrome')

  const sections = zip(SECTIONS, z.array(StoryWords).parse(t.raw('sections')))
  const cols = z.array(z.string()).length(3).parse(t.raw('compare.cols'))
  const rows = z.array(Row).parse(t.raw('compare.rows'))
  const faq = z.array(Qa).parse(t.raw('faq.items'))
  const wheel = {
    months: z.array(z.string()).length(12).parse(story.raw('months')),
    base: story('base'),
    pulse: story('pulse'),
    holiday: story('holiday'),
  }
  const nav = [
    ...sections.map((s) => ({ id: s.id, label: s.k })),
    { id: 'sammenlignet', label: t('compare.k') },
    { id: 'sporsmal', label: t('faq.nav') },
  ]

  return (
    <div>
      <JsonLd
        data={graph(
          organization(),
          breadcrumbs([
            { name: 'Orgpuls', path: '/' },
            { name: t('crumb'), path: '/hvorfor' },
          ]),
          faqPage(faq.map((x) => ({ q: x.q, a: x.a }))),
        )}
      />
      <SectionNav label={chrome('sections')} items={nav} />

      <section className="mx-auto max-w-[1120px] px-[26px] pt-[60px]">
        <Crumbs page={t('crumb')} />
        <h1 className="m-0 mt-[16px] max-w-[20ch] font-display text-[50px] font-semibold leading-[1.06] [text-wrap:balance]">
          {t('h1')}
        </h1>
        <p className="m-0 mt-[16px] max-w-[58ch] text-[17px] leading-[1.65] text-body [text-wrap:pretty]">{t('lead')}</p>
        <HeroButtons next={{ href: '/bruksomrader', label: t('next') }} />
        <Overview items={sections.map((s) => ({ id: s.id, k: s.k, t: s.t }))} />
      </section>

      {sections.map((s, i) => (
        <StorySection
          key={s.id}
          id={s.id}
          index={i}
          k={s.k}
          t={s.t}
          d={s.d}
          points={s.points}
          usesLabel={t('usesLabel')}
          uses={s.uses.map((u) => ({ href: USES[u], label: story(`use.${u}`) }))}
          source={s.src ? story('source', { src: s.src }) : undefined}
          shape={s.shape}
          words={s.m}
          wheel={wheel}
        />
      ))}

      <section id="sammenlignet" className="mx-auto max-w-[1120px] scroll-mt-[118px] px-[26px] pt-[56px]">
        <SectionHead k={t('compare.k')} t={t('compare.t')} d={t('compare.d')} h2Max="max-w-[24ch]" pMax="max-w-[60ch]" />
        <div className="mt-[24px] overflow-x-auto" tabIndex={0} role="region" aria-label={t('compare.t')}>
          <div className="min-w-[560px] overflow-hidden rounded-panel border border-line bg-sf">
            <div className="grid border-b border-line bg-bg px-[22px] py-[14px] text-[12.5px] font-bold [grid-template-columns:minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
              <span />
              <span className="text-center text-mut">{cols[0]}</span>
              <span className="text-center text-mut">{cols[1]}</span>
              <span className="rounded-[8px] bg-sbg py-[6px] text-center">{cols[2]}</span>
            </div>
            {rows.map((r) => (
              <div
                key={r.k}
                className="grid items-center border-t border-line px-[22px] py-[14px] text-[13.5px] [grid-template-columns:minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]"
              >
                <span className="font-semibold">{r.k}</span>
                <span className="text-center text-mut">{r.a}</span>
                <span className="text-center text-mut">{r.b}</span>
                <span className="text-center font-bold">{r.c}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="sporsmal"
        className="mx-auto grid max-w-[1120px] scroll-mt-[118px] items-start gap-[36px] px-[26px] pt-[56px] [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]"
      >
        <div>
          <SectionHead k={t('faq.k')} t={t('faq.t')} h2Max="max-w-[18ch]" />
          <p className="m-0 mt-[12px] max-w-[44ch] text-[15px] leading-[1.65] text-body [text-wrap:pretty]">
            {t.rich('faq.d', {
              link: (chunks) => (
                <Link href="/kontakt#skriv" className="font-bold">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
        <SiteFaq items={faq} />
      </section>

      <StartBand />
    </div>
  )
}
