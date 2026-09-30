import { getTranslations } from 'next-intl/server'
import { NewDeal, PipelineBoard } from '@/components/admin/CrmBoard'
import type { CrmMessages } from '@/components/admin/CrmForms'
import { PageHead, Problem, Segments } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { crmCompanies, crmOwners, crmPipelineSummary, crmStages } from '@/lib/admin/crm'
import { kr } from '@/lib/admin/format'
import { unvalued, winRateText } from '@/lib/admin/pipeline'

/**
 * The pipeline (X-095, the design's `isPipeline`; 0112 before it): what is open and what it is
 * worth, what was won this quarter, and the deals as a board or a list. Values are what the team
 * enters for a deal (0119), not invoices. The lead's figures are summed in the database over every
 * company (0137): a deal without a value is counted and says so, never priced at 0 kr, and the win
 * rate appears only once a deal has closed since the stage history began.
 */
const osloDay = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', day: 'numeric', month: 'short', year: 'numeric' })

export default async function CrmPipeline({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const view = (await searchParams).view === 'list' ? 'list' : 'board'
  const [stageData, data, who, owners, summary] = await Promise.all([crmStages(), crmCompanies(null, null), whoami(), crmOwners(), crmPipelineSummary()])
  if (isError(stageData) || isError(data) || isError(summary)) {
    const e = isError(stageData) ? stageData : isError(data) ? data : (summary as { error: string })
    return <Problem text={e.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  }
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const ownerRows = isError(owners) ? [] : owners.rows
  const rate = winRateText(summary.closed, (v) => t('crm.board.winRate', { ...v, date: osloDay.format(new Date(summary.since)) }))
  const lead = [t('crm.board.leadSum', { open: kr(summary.open.value), count: summary.open.count, won: kr(summary.won_quarter.value) }), rate].filter(Boolean).join(' · ')
  const missing = unvalued(summary.open)

  return (
    <>
      <PageHead title={m.board.title} lead={lead}>
        <div className="flex items-center gap-[10px]">
          <Segments
            label={m.board.viewLabel}
            items={[
              { key: 'board', label: m.board.viewBoard, href: '/admin/crm/pipeline', on: view === 'board' },
              { key: 'list', label: m.board.viewList, href: '/admin/crm/pipeline?view=list', on: view === 'list' },
            ]}
          />
          {canWrite ? <NewDeal owners={ownerRows} m={m} /> : null}
        </div>
      </PageHead>
      <PipelineBoard stages={stageData.rows} companies={data.rows} owners={ownerRows} view={view} m={m} canWrite={canWrite} />
      {missing ? <p className="mb-0 mt-[8px] text-[12px] text-mut">{t('crm.board.leadUnvalued', { count: missing })}</p> : null}
      {data.rows.length >= 500 ? <p className="mb-0 mt-[8px] text-[12px] text-mut">{m.board.capped}</p> : null}
    </>
  )
}
