import { getTranslations } from 'next-intl/server'
import { SegmentForm, type CrmMessages } from '@/components/admin/CrmForms'
import { CrmTabs } from '@/components/admin/CrmTabs'
import { ALink, Card, PageHead, Problem, Table, Td } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { crmSegments, type Filter } from '@/lib/admin/crm'

/**
 * Segments (D-101): saved filters on contacts and their organisations, with live counts of
 * who they select and who of those a campaign would reach. `?id=` opens one for editing,
 * `?new` a blank one.
 */
export default async function CrmSegments({ searchParams }: { searchParams: Promise<{ id?: string; new?: string }> }) {
  const sp = await searchParams
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const [data, who] = await Promise.all([crmSegments(), whoami()])
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const common = { reason: t('common.reason'), reasonHint: t('common.reasonHint'), saving: t('common.saving'), done: t('common.done') }
  const editing = sp.id ? data.rows.find((s) => s.id === sp.id) : undefined
  const open = canWrite && (editing || sp.new !== undefined)

  const describe = (f: Filter) => {
    const parts: string[] = []
    if (f.types?.length) parts.push(f.types.map((k) => m.type[k]).join('/'))
    if (f.roles?.length) parts.push(f.roles.map((k) => m.roleName[k]).join('/'))
    if (f.sources?.length) parts.push(f.sources.map((k) => m.source[k]).join('/'))
    if (f.tags?.length) parts.push(`#${f.tags.join(' #')}`)
    if (f.lang) parts.push(f.lang)
    if (f.min_employees !== undefined || f.max_employees !== undefined) parts.push(`${f.min_employees ?? 0}–${f.max_employees ?? '∞'}`)
    if (f.nace) parts.push(`NACE ${f.nace}`)
    if (f.no_survey_days) parts.push(`> ${f.no_survey_days} d`)
    if (f.mailable_only) parts.push(m.mailableBadge)
    return parts.join(' · ') || m.segments.any
  }

  return (
    <>
      <PageHead title={m.segments.title} lead={m.segments.lead}>
        {canWrite && !open ? <ALink href="/admin/crm/segments?new">{m.segments.new}</ALink> : null}
      </PageHead>
      <CrmTabs current="segments" labels={m.tabs} />

      {open ? (
        <Card title={editing ? m.segments.edit : m.segments.new} className="mb-[16px]" aside={<ALink href="/admin/crm/segments">{m.segments.cancel}</ALink>}>
          <SegmentForm key={editing?.id ?? 'new'} m={m} common={common} segment={editing} />
        </Card>
      ) : null}

      <Card>
        <Table
          head={[m.segments.col.name, m.segments.col.filter, m.segments.col.total, m.segments.col.mailable]}
          empty={data.rows.length ? undefined : t('common.none')}
        >
          {data.rows.map((s) => (
            <tr key={s.id}>
              <Td>{canWrite ? <ALink href={`/admin/crm/segments?id=${s.id}`}>{s.name}</ALink> : s.name}</Td>
              <Td wrap>{describe(s.filter)}</Td>
              <Td>{s.total}</Td>
              <Td>{s.mailable}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  )
}
