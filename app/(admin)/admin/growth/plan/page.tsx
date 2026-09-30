import { getTranslations } from 'next-intl/server'
import { BulletRow, ExportButton, StatusChip } from '@/components/admin/growth'
import { PageHead, Problem } from '@/components/admin/ui'
import { growthPlan, isError, whoami } from '@/lib/admin/api'
import { dotTone } from '@/lib/admin/dots'
import { mayOpenGrowthView } from '@/lib/admin/growth'

const ROW = 'grid gap-[18px] px-[20px] [grid-template-columns:120px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,.8fr)]'

/**
 * Sentral › Growth › 90-day plan (design revision 3, `isPlan`; 0142, D-183). The plan's blocks and
 * gates are registry rows. A block's status is derived from the plan's start date and the calendar
 * (app.growth_plan_status): before a start date is set every block is «Planned», never a sample
 * «Done». The gates are the report's, drawn as the design draws them.
 */
export default async function Page() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const who = await whoami()
  if (!mayOpenGrowthView(who?.role, 'growthPlan')) return <Problem text={t('common.notAllowed')} />
  const res = await growthPlan()
  if (isError(res)) return <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const g = (k: string, v?: Record<string, string | number>) => t(`growth.g2.${k}`, v)

  return (
    <div className="leading-[1.5]">
      <PageHead title={t('growth.view.growthPlan.title')} lead={t('growth.view.growthPlan.lead')} measure={false}>
        <ExportButton kind="plan" label={g('export.plan')} />
      </PageHead>
      <div className="overflow-x-auto rounded-panel border border-line bg-sf">
        <div role="table" aria-label={g('plan.table')} className="min-w-[960px]">
          <div role="row" className={`${ROW} border-b border-line pb-[10px] pt-[14px] text-[11px] uppercase tracking-[0.09em] text-mut`}>
            <span role="columnheader">{g('plan.head.weeks')}</span>
            <span role="columnheader">{g('plan.head.foundation')}</span>
            <span role="columnheader">{g('plan.head.lead')}</span>
            <span role="columnheader">{g('plan.head.gates')}</span>
          </div>
          {res.blocks.map((b) => (
            <div key={b.key} role="row" className={`${ROW} border-b border-line py-[16px]`}>
              <div role="cell">
                <div className="text-[14px] font-bold">{g('plan.weeks', { range: g('plan.range', { from: b.from, to: b.to }) })}</div>
                <StatusChip tone={dotTone('plan', b.status)} className="mt-[6px]">
                  {g(`status.plan.${b.status}`)}
                </StatusChip>
              </div>
              <div role="cell" className="text-[13px] leading-[1.55] [text-wrap:pretty]">
                {b.foundation}
              </div>
              <div role="cell" className="text-[13px] leading-[1.55] [text-wrap:pretty]">
                {b.lead}
              </div>
              <div role="cell" className="flex flex-col gap-[6px]">
                {b.gates.map((gate) => (
                  <BulletRow key={gate} tone="line" small>
                    {gate}
                  </BulletRow>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
