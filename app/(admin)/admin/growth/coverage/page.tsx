import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { BulletRow, ExportButton, KpiStrip, SectionCard, StatusChip } from '@/components/admin/growth'
import { PageHead, Problem, Stat } from '@/components/admin/ui'
import { growthCoverage, isError, whoami } from '@/lib/admin/api'
import { dotTone } from '@/lib/admin/dots'
import { mayOpenGrowthView } from '@/lib/admin/growth'
import { COVERAGE_STATUSES } from '@/lib/admin/growthData'
import { countBy, mayFollow } from '@/lib/admin/growthMath'

const HEAD = 'text-[11px] uppercase tracking-[0.09em] text-mut'

/**
 * Sentral › Growth › Coverage review (design revision 3, `isCoverage`; 0142, D-183). Every feature of
 * the report is a registry row with where it lives and the status that is true for Orgpuls today; the
 * KPI row counts them. «Open» is a link to the page (the design's button stands in for navigation,
 * D-06), offered only where the viewer's role may open it. Recommended next and the report's cuts
 * are registry rows too.
 */
export default async function Page() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const who = await whoami()
  if (!mayOpenGrowthView(who?.role, 'growthCoverage')) return <Problem text={t('common.notAllowed')} />
  const res = await growthCoverage()
  if (isError(res)) return <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const g = (k: string, v?: Record<string, string | number>) => t(`growth.g2.${k}`, v)
  const n = countBy(res.coverage, COVERAGE_STATUSES)

  return (
    <div className="leading-[1.5]">
      <PageHead title={t('growth.view.growthCoverage.title')} lead={t('growth.view.growthCoverage.lead')} measure={false}>
        <ExportButton kind="review" label={g('export.review')} />
      </PageHead>
      <KpiStrip>
        {COVERAGE_STATUSES.map((s) => (
          <Stat key={s} label={g(`status.coverage.${s}`)} value={n[s]} hint={g(`coverage.kpi.${s}`)} />
        ))}
      </KpiStrip>
      <div className="mt-[18px] grid items-start gap-[18px] lg:[grid-template-columns:minmax(0,1.3fr)_minmax(300px,.7fr)]">
        <div className="relative min-w-0 overflow-x-auto rounded-panel border border-line bg-sf">
          <div role="table" aria-label={g('coverage.table')} className="min-w-[620px]">
            <div role="row" className={`flex items-center gap-[14px] border-b border-line px-[20px] pb-[10px] pt-[14px] ${HEAD}`}>
              <span role="columnheader" className="flex-[2]">{g('coverage.head.feature')}</span>
              <span role="columnheader" className="w-[150px]">{g('coverage.head.status')}</span>
              <span role="columnheader" className="flex-[1.2]">{g('coverage.head.note')}</span>
              <span role="columnheader" className="w-[70px]">
                <span className="sr-only">{g('coverage.head.where')}</span>
              </span>
            </div>
            {res.coverage.map((c) => (
              <div key={c.feature} role="row" className="flex items-center gap-[14px] border-b border-line px-[20px] py-[11px] text-[13px]">
                <span role="cell" className="flex-[2] font-semibold [text-wrap:pretty]">
                  {c.feature}
                </span>
                <span role="cell" className="w-[150px]">
                  <StatusChip tone={dotTone('coverage', c.status)}>{g(`status.coverage.${c.status}`)}</StatusChip>
                </span>
                <span role="cell" className="flex-[1.2] text-[12px] text-mut [text-wrap:pretty]">
                  {c.note}
                </span>
                <span role="cell" className="flex w-[70px] justify-end">
                  {mayFollow(who?.role, c.href) ? (
                    <Link
                      href={c.href as Route}
                      aria-label={g('coverage.openLabel', { feature: c.feature })}
                      className="inline-flex cursor-pointer items-center rounded-bar border border-line bg-transparent px-[10px] py-[6px] text-[12px] font-semibold leading-[normal] text-ink no-underline hover:bg-ink/5 hover:text-ink hover:no-underline"
                    >
                      {g('coverage.open')}
                    </Link>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-[18px]">
          <SectionCard flush title={g('coverage.recs')} sub={g('coverage.recsSub')}>
            <div className="mt-[10px] flex flex-col">
              {res.recommendations.map((r) => (
                <div key={r.n} className="flex gap-[12px] border-t border-line px-[20px] py-[12px]">
                  <span className="w-[22px] flex-none text-[12px] font-bold text-mut">{r.n}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-[8px]">
                      <span className="text-[13.5px] font-semibold">{r.title}</span>
                      <StatusChip tone={dotTone('priority', r.priority)} size="xs">
                        {g(`status.priority.${r.priority}`)}
                      </StatusChip>
                    </div>
                    <div className="mt-[3px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">{r.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard dashed title={g('coverage.cut')}>
            <div className="mt-[12px] flex flex-col gap-[8px]">
              {res.cuts.map((c) => (
                <BulletRow key={c} tone="mut">
                  {c}
                </BulletRow>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
