import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { NewCampaignDialog } from '@/components/admin/ContactDialogs'
import type { CrmMessages } from '@/components/admin/CrmForms'
import { Badge, PageHead, Problem } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { crmJourneys, crmStages } from '@/lib/admin/crm'

/**
 * Journeys (X-095, the design's `isJourneys`): the CRM's follow-up chains (0093, 0111) read as
 * journeys (0120). Each starts with a campaign aimed at a stage and carries on with follow-ups that
 * send themselves to those who have not answered; it counts who it reached, who is still waiting for
 * the next mail, who got the last one, and whose company moved forward — the goal. Beside them, each
 * working stage with the journeys aimed at it, and (revision 3, D-184) the design's four principles.
 */
const TONE = { active: 'green', draft: 'yellow', done: 'grey', cancelled: 'red' } as const

export default async function CrmJourneys() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const j = (k: string, v?: Record<string, string | number>) => t(`crm.journeys.${k}`, v)
  const [data, stages, who] = await Promise.all([crmJourneys(), crmStages(), whoami()])
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const common = { reason: t('common.reason'), reasonHint: t('common.reasonHint'), saving: t('common.saving'), done: t('common.done') }
  const stageRows = isError(stages) ? [] : stages.rows
  const name = (k: string | null) => (k ? (stageRows.find((s) => s.key === k)?.name ?? k) : null)
  const active = data.rows.filter((r) => r.status === 'active')
  const waiting = data.rows.reduce((n, r) => n + r.in_journey, 0)
  const open = stageRows.filter((s) => !s.archived && (s.kind === 'open' || s.kind === 'won')).sort((a, b) => a.sort - b.sort)

  return (
    <>
      <PageHead title={j('title')} lead={j('lead', { active: active.length, waiting })}>
        {canWrite ? <NewCampaignDialog m={m} common={common} label={j('new')} sub={j('newSub')} close={j('close')} /> : null}
      </PageHead>
      <div className="grid items-start gap-[18px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1.3fr)_minmax(300px,.7fr)]">
        <div className="flex min-w-0 flex-col gap-[10px]">
          {data.rows.length ? (
            data.rows.map((r) => {
              const pct = r.reached ? Math.round((100 * r.moved) / r.reached) : 0
              return (
                <Link
                  key={r.id}
                  href={`/admin/crm/campaigns/${r.id}` as Route}
                  className="flex flex-wrap items-center gap-[18px] rounded-panel border border-line bg-sf px-[22px] py-[20px] text-ink no-underline hover:border-ink hover:text-ink hover:no-underline"
                >
                  <span className="min-w-[240px] flex-1">
                    <span className="flex flex-wrap items-center gap-[10px]">
                      <span className="font-display text-[20px] font-medium">{r.name}</span>
                      <Badge tone={TONE[r.status]}>{j(`status.${r.status}`)}</Badge>
                    </span>
                    <span className="mt-[4px] block text-[12.5px] text-mut">
                      {[
                        r.stage_target ? j('enrolls', { stage: name(r.stage_target)! }) : j('noStage'),
                        j('mails', { count: r.mails }),
                        // 0137: call and LinkedIn steps, the design's «· N tasks»
                        r.tasks ? j('tasks', { count: r.tasks }) : null,
                        j('goal', { stage: name(r.stage_on_send ?? r.stage_target) ?? '—' }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <Metric label={j('inJourney')} value={r.in_journey} />
                  <Metric label={j('completed')} value={r.completed} />
                  <span className="w-[140px]">
                    <span className="block text-[11px] uppercase tracking-[0.09em] text-mut">{j('reachedGoal')}</span>
                    <span className="mt-[6px] flex items-center gap-[8px]">
                      <span aria-hidden="true" className="block h-[6px] flex-1 overflow-hidden rounded-pill bg-ink/[.08]">
                        <span className="block h-full rounded-pill bg-ac" style={{ width: `${pct}%` }} />
                      </span>
                      <b className="text-[12.5px]">{r.reached ? `${pct} %` : '—'}</b>
                    </span>
                  </span>
                </Link>
              )
            })
          ) : (
            <div className="rounded-panel border border-dashed border-line bg-sf p-[22px] text-center">
              <div className="text-[14px] font-semibold">{j('none')}</div>
              <div className="mt-[4px] text-[12.5px] text-mut">{j('noneLead')}</div>
            </div>
          )}
        </div>
        <section className="rounded-panel border border-line bg-sf px-[20px] py-[20px] md:px-[26px] md:py-[24px]">
          <h2 className="m-0 font-display text-[22px] font-medium">{j('byStage')}</h2>
          <p className="mb-0 mt-[4px] text-[12.5px] text-mut">{j('byStageLead')}</p>
          <ul className="m-0 mt-[16px] flex list-none flex-col gap-[8px] p-0">
            {open.map((s) => {
              const js = data.rows.filter((r) => r.stage_target === s.key && r.status !== 'cancelled')
              return (
                <li key={s.key} className="flex items-center gap-[12px] rounded-[12px] border border-line bg-bg px-[14px] py-[12px]">
                  <span aria-hidden="true" className={`block h-[6px] w-[6px] flex-none rounded-pill ${js.length ? 'bg-teal' : 'bg-peach'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px]">
                      <b>{s.name}</b> · {j('companies', { count: s.companies })}
                    </span>
                    <span className="block text-[12px] text-mut">{js.length ? js.map((r) => `${r.name} · ${j(`status.${r.status}`)}`).join(', ') : j('noJourney')}</span>
                  </span>
                </li>
              )
            })}
          </ul>
          {/* revision 3 (D-184): the design's principles, under a hairline at the card's foot */}
          <div className="mt-[18px] border-t border-line pt-[16px]">
            <div className="text-[11px] uppercase tracking-[0.09em] text-mut">{j('principles.title')}</div>
            <div className="mt-[10px] flex flex-col gap-[10px]">
              {(['p1', 'p2', 'p3', 'p4'] as const).map((key) => (
                <div key={key} className="text-[13px] leading-[1.5] [text-wrap:pretty]">
                  {t.rich(`crm.journeys.principles.${key}`, { b: (ch) => <b>{ch}</b>, mut: (ch) => <span className="text-mut">{ch}</span> })}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <span className="w-[76px]">
      <span className="block text-[11px] uppercase leading-[1.2] tracking-[0.09em] text-mut">{label}</span>
      <span className="mt-[2px] block text-[22px] font-bold leading-[1.1]">{value}</span>
    </span>
  )
}
