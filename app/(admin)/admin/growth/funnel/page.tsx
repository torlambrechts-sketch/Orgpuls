import { getTranslations } from 'next-intl/server'
import { BenchmarkRow, BulletRow, SectionCard } from '@/components/admin/growth'
import { PageHead, Problem } from '@/components/admin/ui'
import { growthFunnel, isError, whoami } from '@/lib/admin/api'
import { mayOpenGrowthView } from '@/lib/admin/growth'
import { fmt, funnelRows, leadMath } from '@/lib/admin/growthMath'

/** the design's chart palette (`D.viz`), one per stage in turn */
const VIZ = ['bg-viz1', 'bg-viz2', 'bg-viz3', 'bg-viz4', 'bg-viz5'] as const

/**
 * Sentral › Growth › Funnel & lead math (design revision 3, `isFunnel`; 0142, D-183). Computed, this
 * month: the visitors are the site's own sessions (app.web_events, cookieless), every other stage an
 * organisation count from the event stream (0141), each as the stage's definition says. PQL has no
 * source — there is no PQL flag — so it shows «—», not a number. The lead math's «now» is the month's
 * trials by first-touch channel, for the sources the attribution can name; the others show «—». The
 * base, stretch, assumptions and benchmarks are the report's, labelled as such.
 */
export default async function Page() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const who = await whoami()
  if (!mayOpenGrowthView(who?.role, 'growthFunnel')) return <Problem text={t('common.notAllowed')} />
  const res = await growthFunnel()
  if (isError(res)) return <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const g = (k: string, v?: Record<string, string | number>) => t(`growth.g2.${k}`, v)
  const dash = g('dash')
  const rows = funnelRows(res.stages)
  const lm = leadMath(res.lead)

  return (
    <div className="leading-[1.5]">
      <PageHead title={t('growth.view.growthFunnel.title')} lead={t('growth.view.growthFunnel.lead')} measure={false} />
      <div className="grid items-start gap-[18px] lg:[grid-template-columns:minmax(0,1.1fr)_minmax(300px,.9fr)]">
        <SectionCard title={g('funnel.title')} aside={<span className="text-[12.5px] text-mut">{g('funnel.aside')}</span>}>
          <div className="mt-[18px] flex flex-col gap-[14px]">
            {rows.map((f, i) => (
              <div key={f.key} className="flex flex-col gap-[6px]">
                <div className="flex flex-wrap items-baseline gap-[10px]">
                  <span className="min-w-[90px] text-[13.5px] font-semibold">{f.stage}</span>
                  <span className="text-[11.5px] text-mut [font-family:ui-monospace,Menlo,monospace]">{f.event}</span>
                  <span className="flex-1" />
                  <b className="text-[13px]">{f.n === null ? dash : fmt(f.n)}</b>
                  <span className="min-w-[120px] whitespace-nowrap text-right text-[12px] text-mut">
                    {f.n === null
                      ? g('funnel.noSource')
                      : g('funnel.share', {
                          pct: f.pct === null ? dash : g('funnel.pct', { pct: f.pct }),
                          step: i === 0 ? g('funnel.first') : f.step === null ? dash : g('funnel.step', { step: f.step }),
                        })}
                  </span>
                </div>
                <span className="block h-[14px] overflow-hidden rounded-[5px] bg-ink/[.05]">
                  <span className={`block h-full rounded-[5px] ${VIZ[i % VIZ.length]}`} style={{ width: `${f.bar}%` }} />
                </span>
                <div className="text-[12px] text-mut [text-wrap:pretty]">{f.definition}</div>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="flex min-w-0 flex-col gap-[18px]">
          <SectionCard
            flush
            title={g('funnel.lead.title')}
            sub={g('funnel.lead.sub', { now: lm.now === null ? dash : fmt(lm.now), base: fmt(lm.base), stretch: fmt(lm.stretch) })}
          >
            <div className="mt-[10px] flex flex-col">
              {lm.rows.map((l) => (
                <div key={l.key} className="border-t border-line px-[20px] py-[12px]">
                  <div className="flex items-center gap-[10px]">
                    <span className="flex-1 text-[13.5px] font-semibold">{l.source}</span>
                    <span className="whitespace-nowrap text-[12.5px]">
                      {t.rich('growth.g2.funnel.lead.figures', {
                        now: l.now === null ? dash : fmt(l.now),
                        base: fmt(l.base),
                        stretch: fmt(l.stretch),
                        b: (c) => <b>{c}</b>,
                        mut: (c) => <span className="text-mut">{c}</span>,
                      })}
                    </span>
                  </div>
                  <div className="mt-[6px] flex items-center gap-[10px]">
                    <span className="block h-[7px] flex-1 overflow-hidden rounded-pill bg-ink/[.08]">
                      <span className="block h-full rounded-pill bg-ac" style={{ width: `${l.nowPct ?? 0}%` }} />
                    </span>
                    <span className="whitespace-nowrap text-[11.5px] text-mut">
                      {l.nowPct === null ? g('funnel.lead.noChannel') : g('funnel.lead.ofBase', { pct: l.nowPct })}
                    </span>
                  </div>
                  <div className="mt-[6px] text-[12px] text-mut">{l.needs}</div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title={g('funnel.assumptions')}>
            <div className="mt-[12px] flex flex-col gap-[8px]">
              {res.assumptions.map((a) => (
                <BulletRow key={a} tone="yellow">
                  {a}
                </BulletRow>
              ))}
            </div>
          </SectionCard>

          <SectionCard title={g('funnel.benchmarks')}>
            <div className="mt-[8px] flex flex-col">
              {res.benchmarks.map((b) => (
                <BenchmarkRow key={b.metric} metric={b.metric} value={b.value} source={b.source} />
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
