import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { DealForm } from '@/components/admin/CrmDealForms'
import type { CrmMessages } from '@/components/admin/CrmForms'
import { stageTone } from '@/components/admin/CrmTabs'
import { Badge, Card, PageHead, Problem, Segments, Table, Td } from '@/components/admin/ui'
import { isError } from '@/lib/admin/api'
import { crmCompanies, crmDeals, crmStages, DEAL_VIEWS, may, type Deal } from '@/lib/admin/crm'
import { dealValue } from '@/lib/admin/pipeline'

/**
 * The deals (0203, D-227; WP-1.1): a pipeline's deals, open by default or won, lost or all, searched by title, and a
 * deal added with a title and, if wanted, a company, a stage and a value. The board and its list stay companies'
 * until WP-1.2 moves them onto deals; a company's own deal is the one the board shows.
 */
const osloDay = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', day: 'numeric', month: 'short', year: 'numeric' })

export default async function CrmDeals({ searchParams }: { searchParams: Promise<{ pipeline?: string; view?: string; q?: string }> }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const x = m.deals
  const sp = await searchParams
  const view = (DEAL_VIEWS as readonly string[]).includes(sp.view ?? '') ? (sp.view as (typeof DEAL_VIEWS)[number]) : 'open'
  const q = (sp.q ?? '').trim().slice(0, 100) || null
  const stageData = await crmStages()
  if (isError(stageData)) return <Problem text={stageData.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const pipelines = stageData.pipelines.filter((p) => !p.archived)
  const pipeline = pipelines.find((p) => p.id === sp.pipeline)?.id ?? pipelines[0]?.id ?? null
  const [data, companies] = await Promise.all([crmDeals({ pipeline, view, q }), crmCompanies(null, null)])
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const stages = stageData.rows.filter((s) => s.pipeline === data.pipeline)
  const stageOf = (key: string) => stageData.rows.find((s) => s.key === key)
  const href = (p: { pipeline?: string | null; view?: string }) => {
    const u = new URLSearchParams()
    if (p.pipeline ?? pipeline) u.set('pipeline', (p.pipeline ?? pipeline) as string)
    if ((p.view ?? view) !== 'open') u.set('view', p.view ?? view)
    if (q) u.set('q', q)
    return `/admin/crm/deals${u.size ? `?${u}` : ''}`
  }
  const common = { saving: t('common.saving'), done: t('common.done') }

  return (
    <>
      <PageHead title={x.title} lead={x.lead}>
        {pipelines.length > 1 ? (
          <Segments label={m.stagesX.pipelineLabel} items={pipelines.map((p) => ({ key: p.id, label: p.name, href: href({ pipeline: p.id }), on: p.id === data.pipeline }))} />
        ) : null}
      </PageHead>

      <div className="mb-[12px] flex flex-wrap items-center gap-[10px]">
        <Segments label={x.title} items={DEAL_VIEWS.map((v) => ({ key: v, label: x.views[v], href: href({ view: v }), on: v === view }))} />
        <form className="flex items-center gap-[6px]" action="/admin/crm/deals">
          {pipeline ? <input type="hidden" name="pipeline" value={pipeline} /> : null}
          {view !== 'open' ? <input type="hidden" name="view" value={view} /> : null}
          <input
            name="q"
            defaultValue={q ?? ''}
            aria-label={x.search}
            placeholder={x.search}
            maxLength={100}
            className="box-border h-[34px] w-[220px] rounded-ctl border border-line bg-bg px-[10px] text-[13px] text-ink outline-none"
          />
          <button type="submit" className="h-[34px] rounded-ctl border border-line bg-sf px-[12px] text-[12.5px] font-semibold text-ink">
            {x.searchSubmit}
          </button>
        </form>
      </div>

      <Card title={x.title}>
        <Table head={[x.col.title, x.col.company, x.col.stage, x.col.value, x.col.owner, x.col.close, x.col.changed]} empty={data.rows.length ? undefined : x.none}>
          {data.rows.map((d: Deal) => (
            <tr key={d.id}>
              <Td wrap>
                <Link href={`/admin/crm/deals/${d.id}` as Route} className="font-semibold">
                  {d.title}
                </Link>
                {d.primary ? <span className="block text-[12px] text-mut">{x.primary}</span> : null}
              </Td>
              <Td wrap>
                {d.company_id && d.company ? <Link href={`/admin/crm/prospects/${d.company_id}` as Route}>{d.company}</Link> : ''}
              </Td>
              <Td>
                <Badge tone={stageTone(stageOf(d.stage))}>{stageOf(d.stage)?.name ?? d.stage}</Badge>
              </Td>
              <Td>{dealValue(d.value, d.currency)}</Td>
              <Td wrap>{d.owner ?? ''}</Td>
              <Td>{d.expected_close ? osloDay.format(new Date(d.expected_close)) : ''}</Td>
              <Td>{osloDay.format(new Date(d.stage_changed_at))}</Td>
            </tr>
          ))}
        </Table>
        {data.limit != null && data.rows.length >= data.limit ? <p className="mb-0 mt-[8px] text-[12px] text-mut">{x.limit.replace('{n}', String(data.limit))}</p> : null}
      </Card>

      {may(data.may, 'create') && pipeline ? (
        <Card title={x.add} className="mt-[16px]">
          <DealForm
            pipeline={pipeline}
            stages={stages.filter((s) => !s.managed && !s.archived).map((s) => ({ value: s.key, label: s.name }))}
            companies={isError(companies) ? [] : companies.rows.map((c) => ({ value: c.id, label: c.name }))}
            m={m}
            common={common}
          />
        </Card>
      ) : null}
    </>
  )
}
