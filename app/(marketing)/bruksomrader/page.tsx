import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { JsonLd } from '@/components/marketing/JsonLd'
import { SectionNav } from '@/components/site/SectionNav'
import { Overview, StorySection, type MockShape } from '@/components/site/Story'
import { Crumbs, HeroButtons, SectionHead, StartBand } from '@/components/site/parts'
import { pageMeta } from '@/lib/marketing/meta'
import { breadcrumbs, graph, organization } from '@/lib/marketing/schema'
import { StoryWords, USES, type UseKey } from '@/lib/site/story'
import { zip } from '@/lib/site/zip'

/**
 * Bruksområder (D-88): design-reference/orgpuls/nettside/Bruksomrader.dc.html. Eight
 * situations, each beside a drawing of how the product meets it, then six industries. The
 * words are `site.bruksomrader`; the drawings' numbers are here.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return pageMeta({
    title: t('seo.pages.bruksomrader.title'),
    description: t('seo.pages.bruksomrader.description'),
    path: '/bruksomrader',
  })
}

const SECTIONS: { id: string; uses: UseKey[]; shape: MockShape }[] = [
  { id: 'kartlegging', uses: ['mal', 'rap'], shape: { kind: 'wheel', base: 8, pulses: [11, 2, 5] } },
  { id: 'puls', uses: ['mal', 'res'], shape: { kind: 'trend', values: [48, 41, 44, 48, 53], goal: 60 } },
  { id: 'uten-hr', uses: ['opp', 'ast'], shape: { kind: 'cards', tones: ['neg', 'neu', 'neu'], late: [false, false, true] } },
  {
    id: 'ett-team',
    uses: ['vis', 'tilt'],
    shape: {
      kind: 'heat',
      rows: [[49, 51, 70, 74, 81], [46, 31, 58, 59, 75], [28, 47, 55, 72, 77], null],
      marks: [undefined, 1, 0, undefined],
    },
  },
  { id: 'endring', uses: ['mal', 'vis'], shape: { kind: 'bars', values: [74, 58, 67, 49] } },
  { id: 'ny-leder', uses: ['res', 'kom'], shape: { kind: 'bars', values: [61, 63, 68, 60] } },
  { id: 'tilsyn', uses: ['rap', 'tilt'], shape: { kind: 'steps', states: ['done', 'done', 'now', ''] } },
  { id: 'amu', uses: ['rol', 'rap'], shape: { kind: 'cards', tones: ['pos', 'pos', 'neg'] } },
]

const Sector = z.object({ t: z.string(), d: z.string(), f: z.array(z.string()) })

export default async function BruksomraderPage() {
  const t = await getTranslations('site.bruksomrader')
  const story = await getTranslations('site.story')
  const chrome = await getTranslations('site.chrome')

  const sections = zip(SECTIONS, z.array(StoryWords).parse(t.raw('sections')))
  const sectors = z.array(Sector).parse(t.raw('sectors.items'))
  const wheel = {
    months: z.array(z.string()).length(12).parse(story.raw('months')),
    base: story('base'),
    pulse: story('pulse'),
    holiday: story('holiday'),
  }

  return (
    <div>
      <JsonLd
        data={graph(
          organization(),
          breadcrumbs([
            { name: 'Orgpuls', path: '/' },
            { name: t('crumb'), path: '/bruksomrader' },
          ]),
        )}
      />
      <SectionNav
        label={chrome('sections')}
        items={[...sections.map((s) => ({ id: s.id, label: s.k })), { id: 'bransjer', label: t('sectors.k') }]}
      />

      <section className="mx-auto max-w-[1120px] px-[26px] pt-[60px]">
        <Crumbs page={t('crumb')} />
        <h1 className="m-0 mt-[16px] max-w-[20ch] font-display text-[50px] font-semibold leading-[1.06] [text-wrap:balance]">
          {t('h1')}
        </h1>
        <p className="m-0 mt-[16px] max-w-[58ch] text-[17px] leading-[1.65] text-body [text-wrap:pretty]">{t('lead')}</p>
        <HeroButtons next={{ href: '/plattform', label: t('next') }} />
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
          shape={s.shape}
          words={s.m}
          wheel={wheel}
        />
      ))}

      <section id="bransjer" className="mx-auto max-w-[1120px] scroll-mt-[118px] px-[26px] pt-[56px]">
        <SectionHead k={t('sectors.k')} t={t('sectors.t')} d={t('sectors.d')} h2Max="max-w-[24ch]" pMax="max-w-[60ch]" />
        <div className="mt-[24px] grid gap-[13px] [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
          {sectors.map((b) => (
            <div key={b.t} className="flex flex-col gap-[9px] rounded-panel border border-line bg-sf px-[22px] py-[20px]">
              <span className="text-[16.5px] font-bold">{b.t}</span>
              <span className="text-[13.5px] leading-[1.55] text-body [text-wrap:pretty]">{b.d}</span>
              <span className="mt-[2px] flex flex-wrap gap-[6px]">
                {b.f.map((f) => (
                  <span key={f} className="rounded-pill bg-sbg px-[10px] py-[3px] text-[11px] font-bold">
                    {f}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      </section>

      <StartBand />
    </div>
  )
}
