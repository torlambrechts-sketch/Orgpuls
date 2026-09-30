import { getTranslations } from 'next-intl/server'
import { ExperimentRow } from '@/components/admin/GrowthDialogs'
import { SectionCard } from '@/components/admin/growth'
import { PageHead, Problem } from '@/components/admin/ui'
import { growthExperiments, isError, whoami } from '@/lib/admin/api'
import { dotTone } from '@/lib/admin/dots'
import { mayOpenGrowthView } from '@/lib/admin/growth'
import { EXPERIMENT_STATUSES } from '@/lib/admin/growthData'
import { ice, icePct } from '@/lib/admin/growthMath'

const HEAD = 'text-[11px] uppercase tracking-[0.09em] text-mut'
const RULES = ['one', 'weeks', 'big', 'holdout'] as const

/**
 * Sentral › Growth › Experiments (design revision 3, `isExperiments`; 0142, D-183). The backlog is
 * registry rows, highest ICE first (the database orders it); every experiment is «Queued» until one
 * runs, since none does today. A row opens the experiment's card, where its status is changed (an
 * audited write). The experiment rules are the report's, as the design prints them.
 */
export default async function Page() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const who = await whoami()
  if (!mayOpenGrowthView(who?.role, 'growthExperiments')) return <Problem text={t('common.notAllowed')} />
  const res = await growthExperiments()
  if (isError(res)) return <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const g = (k: string, v?: Record<string, string | number>) => t(`growth.g2.${k}`, v)
  const statuses = EXPERIMENT_STATUSES.map((s) => ({ value: s, label: g(`status.experiment.${s}`) }))
  const labels = {
    cancel: g('dialog.cancel'),
    close: g('dialog.close'),
    save: g('dialog.save'),
    saving: g('dialog.saving'),
    failed: g('dialog.failed'),
    status: g('experiments.status'),
  }

  return (
    <div className="leading-[1.5]">
      <PageHead title={t('growth.view.growthExperiments.title')} lead={t('growth.view.growthExperiments.lead')} measure={false} />
      <div className="grid items-start gap-[18px] lg:[grid-template-columns:minmax(0,1.3fr)_minmax(300px,.7fr)]">
        <div className="min-w-0 overflow-x-auto rounded-panel border border-line bg-sf">
          <div className="min-w-[640px]">
            <div aria-hidden="true" className={`flex items-center gap-[14px] border-b border-line px-[20px] pb-[10px] pt-[14px] ${HEAD}`}>
              <span className="flex-[2.4]">{g('experiments.head.hypothesis')}</span>
              <span className="flex-1">{g('experiments.head.metric')}</span>
              <span className="flex-[1.2]">{g('experiments.head.ice')}</span>
              <span className="w-[96px]">{g('experiments.head.status')}</span>
            </div>
            <div role="list" aria-label={g('experiments.table')}>
            {res.experiments.map((e) => {
              const score = ice(e)
              const factors = { i: e.impact, c: e.confidence, e: e.ease }
              return (
                <div key={e.key} role="listitem">
                  <ExperimentRow
                    row={{
                      id: e.key,
                      hypothesis: e.hypothesis,
                      metric: e.metric,
                      pct: icePct(e),
                      ice: score,
                      iceText: g('experiments.ice', factors),
                      status: { tone: dotTone('experiment', e.status), label: g(`status.experiment.${e.status}`) },
                    }}
                    dialog={{
                      title: g('experiments.title', { id: e.key, hypothesis: e.hypothesis }),
                      sub: g('experiments.sub', { metric: e.metric, ice: score, ...factors }),
                    }}
                    form={{ key: e.key, status: e.status, statuses }}
                    labels={labels}
                  />
                </div>
              )
            })}
            </div>
          </div>
        </div>
        <SectionCard title={g('experiments.rules.title')}>
          <div className="mt-[12px] flex flex-col gap-[10px] text-[13px] leading-[1.5] [text-wrap:pretty]">
            {RULES.map((k) => (
              <div key={k} className="rounded-cta border border-line bg-bg px-[14px] py-[12px]">
                {t.rich(`growth.g2.experiments.rules.${k}`, { b: (c) => <b>{c}</b> })}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
