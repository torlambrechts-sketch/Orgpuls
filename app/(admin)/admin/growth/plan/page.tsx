import { getTranslations } from 'next-intl/server'
import { BulletRow, ExportButton, StatusChip } from '@/components/admin/growth'
import { PageHead, Problem } from '@/components/admin/ui'
import { growthPlan, isError, whoami } from '@/lib/admin/api'
import { dotTone } from '@/lib/admin/dots'
import { mayOpenGrowthView } from '@/lib/admin/growth'
import { GATE_STATES } from '@/lib/admin/growthData'

const ROW = 'grid gap-[18px] px-[20px] [grid-template-columns:120px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,.8fr)]'

/**
 * Sentral › Growth › 90-day plan (design revision 3, `isPlan`; 0142, D-183). The plan's blocks and
 * gates are registry rows. A block's status is derived from the plan's start date, the calendar and
 * its gates (app.growth_plan_status): before a start date every block is «Planned», never a sample
 * «Done», and a block whose weeks are past is «Done» only when every gate is met — «Gates open»
 * otherwise. Each gate is read live where the schema can measure it (app.growth_gate_state): its dot
 * is teal when met, peach when not, and the design's plain dot where nothing measures it yet; the
 * state is also said in words for a screen reader.
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
      {/* relative: the gates' screen-reader words are absolutely positioned and must stay inside the scroller */}
      <div className="relative overflow-x-auto rounded-panel border border-line bg-sf">
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
                  <BulletRow key={gate.gate} tone={dotTone('gate', gate.state)} small>
                    {gate.gate}
                    <span className="sr-only"> ({g(`plan.gate.${gate.state}`)})</span>
                  </BulletRow>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* what a gate's dot says, in words: the design's gates have no state, so its colour needs a key */}
      <div className="mt-[12px] flex flex-wrap gap-x-[18px] gap-y-[6px] text-mut">
        {GATE_STATES.map((s) => (
          <BulletRow key={s} tone={dotTone('gate', s)} small>
            {g(`plan.gate.${s}`)}
          </BulletRow>
        ))}
      </div>
    </div>
  )
}
