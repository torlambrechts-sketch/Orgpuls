import { getTranslations } from 'next-intl/server'
import { NewDeal, PipelineBoard } from '@/components/admin/CrmBoard'
import type { CrmMessages } from '@/components/admin/CrmForms'
import { PageHead, Problem, Segments } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { crmCompanies, crmOwners, crmStages } from '@/lib/admin/crm'
import { kr } from '@/lib/admin/format'

/**
 * The pipeline (X-095, the design's `isPipeline`; 0112 before it): what is open and what it is
 * worth, what was won this quarter, and the deals as a board or a list. Values are what the team
 * enters for a deal (0119), not invoices.
 */
export default async function CrmPipeline({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const view = (await searchParams).view === 'list' ? 'list' : 'board'
  const [stageData, data, who, owners] = await Promise.all([crmStages(), crmCompanies(null, null), whoami(), crmOwners()])
  if (isError(stageData) || isError(data)) {
    const e = isError(stageData) ? stageData : (data as { error: string })
    return <Problem text={e.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  }
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const kind = new Map(stageData.rows.map((s) => [s.key, s]))
  const open = data.rows.filter((c) => kind.get(c.stage)?.kind === 'open' && !kind.get(c.stage)?.archived)
  const quarter = quarterStart()
  const won = data.rows.filter((c) => kind.get(c.stage)?.kind === 'won' && Date.parse(c.stage_changed_at) >= quarter)
  const sum = (rows: typeof open) => rows.reduce((n, c) => n + (c.value_nok ?? 0), 0)
  const ownerRows = isError(owners) ? [] : owners.rows

  return (
    <>
      <PageHead
        title={m.board.title}
        lead={t('crm.board.leadSum', { open: kr(sum(open)), count: open.length, won: kr(sum(won)) })}
      >
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
      {data.rows.length >= 500 ? <p className="mb-0 mt-[8px] text-[12px] text-mut">{m.board.capped}</p> : null}
    </>
  )
}

/** The first day of this quarter, in Oslo */
function quarterStart() {
  const [y, mo] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit' }).format(new Date()).split('-').map(Number)
  return Date.UTC(y!, Math.floor((mo! - 1) / 3) * 3, 1)
}
