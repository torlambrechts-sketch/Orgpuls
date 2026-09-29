import { getTranslations } from 'next-intl/server'
import { PipelineBoard } from '@/components/admin/CrmBoard'
import type { CrmMessages } from '@/components/admin/CrmForms'
import { CrmTabs } from '@/components/admin/CrmTabs'
import { PageHead, Problem } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { crmCompanies, crmStages } from '@/lib/admin/crm'

/**
 * The pipeline as a board (0112, X-091): a column per stage, each saying what the buyer did to reach
 * it, and the companies in it with their general manager, size, next step and days in the stage.
 * Companies are moved by dragging or with a card's «Move to»; the plan's stages move themselves.
 */
export default async function CrmPipeline() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const [stageData, data, who] = await Promise.all([crmStages(), crmCompanies(null, null), whoami()])
  if (isError(stageData) || isError(data)) {
    const e = isError(stageData) ? stageData : (data as { error: string })
    return <Problem text={e.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  }
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  return (
    <>
      <PageHead title={m.board.title} lead={m.board.lead} />
      <CrmTabs current="prospects" labels={m.tabs} />
      <PipelineBoard stages={stageData.rows} companies={data.rows} m={m} canWrite={canWrite} />
      {data.rows.length >= 500 ? <p className="mb-0 mt-[8px] text-[12px] text-mut">{m.board.capped}</p> : null}
    </>
  )
}
