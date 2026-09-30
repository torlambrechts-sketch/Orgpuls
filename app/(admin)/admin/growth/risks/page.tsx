import { getTranslations } from 'next-intl/server'
import { DecideButton } from '@/components/admin/GrowthDialogs'
import { KpiStrip, SectionCard, StatusChip } from '@/components/admin/growth'
import { PageHead, Problem } from '@/components/admin/ui'
import { growthRisks, isError, whoami } from '@/lib/admin/api'
import { dotTone } from '@/lib/admin/dots'
import { mayOpenGrowthView } from '@/lib/admin/growth'

const HEAD = 'text-[11px] uppercase tracking-[0.09em] text-mut'
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Oslo' })

/**
 * Sentral › Growth › Risks & decisions (design revision 3, `isRisks`; 0142, D-183). The guardrails,
 * risks and open decisions are registry rows; the sub-line counts them, and counts only the decisions
 * still open. «Decide» records a decision and who gave it (an audited write); a decided one shows
 * what was decided, by whom and when, in place of its default.
 */
export default async function Page() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const who = await whoami()
  if (!mayOpenGrowthView(who?.role, 'growthRisks')) return <Problem text={t('common.notAllowed')} />
  const res = await growthRisks()
  if (isError(res)) return <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const g = (k: string, v?: Record<string, string | number>) => t(`growth.g2.${k}`, v)
  const open = res.decisions.filter((d) => d.decided === null).length
  const word = (n: number, cap = false) => g(cap ? 'word.cap' : 'word.low', { n: String(n) })
  const labels = {
    cancel: g('dialog.cancel'),
    close: g('dialog.close'),
    save: g('dialog.save'),
    saving: g('dialog.saving'),
    failed: g('dialog.failed'),
    open: g('risks.decide'),
    value: g('risks.value'),
    by: g('risks.by'),
    record: g('risks.record'),
  }

  return (
    <div className="leading-[1.5]">
      <PageHead
        title={t('growth.view.growthRisks.title')}
        lead={t('growth.view.growthRisks.lead', {
          guardrails: res.guardrails.length,
          guardrailsWord: word(res.guardrails.length, true),
          risks: res.risks.length,
          risksWord: word(res.risks.length),
          open,
          openWord: word(open),
        })}
        measure={false}
      />
      <KpiStrip min={240}>
        {res.guardrails.map((x) => (
          <div key={x.title} className="rounded-panel border border-ink bg-sf px-[22px] py-[20px]">
            <div className={HEAD}>{g('risks.guardrail')}</div>
            <div className="mt-[6px] text-[15px] font-bold">{x.title}</div>
            <div className="mt-[6px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">{x.body}</div>
          </div>
        ))}
      </KpiStrip>
      <div className="mt-[18px] grid items-start gap-[18px] lg:[grid-template-columns:minmax(0,1.3fr)_minmax(300px,.7fr)]">
        <div className="min-w-0 overflow-x-auto rounded-panel border border-line bg-sf">
          <div role="table" aria-label={g('risks.table')} className="min-w-[600px]">
            <div role="row" className={`flex items-center gap-[14px] border-b border-line px-[20px] pb-[10px] pt-[14px] ${HEAD}`}>
              <span role="columnheader" className="flex-[1.4]">{g('risks.head.risk')}</span>
              <span role="columnheader" className="w-[150px]">{g('risks.head.likelihood')}</span>
              <span role="columnheader" className="flex-[1.6]">{g('risks.head.mitigation')}</span>
            </div>
            {res.risks.map((r) => (
              <div key={r.risk} role="row" className="flex items-center gap-[14px] border-b border-line px-[20px] py-[12px] text-[13px]">
                <span role="cell" className="flex-[1.4] font-semibold [text-wrap:pretty]">
                  {r.risk}
                </span>
                <span role="cell" className="w-[150px]">
                  <StatusChip tone={dotTone('likelihood', r.likelihood)}>{g(`status.likelihood.${r.likelihood}`)}</StatusChip>
                </span>
                <span role="cell" className="flex-[1.6] text-[12.5px] text-mut [text-wrap:pretty]">
                  {r.mitigation}
                </span>
              </div>
            ))}
          </div>
        </div>
        <SectionCard flush title={g('risks.decisions')} sub={g('risks.decisionsSub')}>
          <div className="mt-[10px] flex flex-col">
            {res.decisions.map((d) => (
              <div key={d.n} className="flex items-center gap-[12px] border-t border-line px-[20px] py-[12px]">
                <span className="w-[22px] flex-none text-[12px] font-bold text-mut">{d.n}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold [text-wrap:pretty]">{d.question}</div>
                  <div className="text-[12px] text-mut [text-wrap:pretty]">
                    {d.decided !== null
                      ? g('risks.decided', { value: d.decided, by: d.by ?? '', date: d.at ? day.format(new Date(d.at)) : '' })
                      : g('risks.default', { value: d.default })}
                  </div>
                </div>
                <DecideButton
                  n={d.n}
                  dialog={{ title: g('risks.title', { n: d.n, question: d.question }), sub: g('risks.sub', { value: d.default }) }}
                  placeholders={{ value: d.decided ?? d.default, by: g('risks.byPlaceholder') }}
                  labels={labels}
                />
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
