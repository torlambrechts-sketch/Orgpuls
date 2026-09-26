import { getTranslations } from 'next-intl/server'
import type { CrmMessages } from '@/components/admin/CrmForms'
import { ListForm } from '@/components/admin/CrmPipelineForms'
import { CrmTabs } from '@/components/admin/CrmTabs'
import { ALink, Badge, Card, PageHead, Problem, Table, Td } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { crmLists } from '@/lib/admin/crm'

/**
 * Lists (D-103): subscriptions by purpose, each its own consent. Growth over 30 days and how
 * the list's campaigns have done. `?id=` edits one, `?new` adds one.
 */
const rate = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('en-GB')} %`)

export default async function CrmLists({ searchParams }: { searchParams: Promise<{ id?: string; new?: string }> }) {
  const sp = await searchParams
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const l = m.lists
  const [data, who] = await Promise.all([crmLists(), whoami()])
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const common = { reason: t('common.reason'), reasonHint: t('common.reasonHint'), saving: t('common.saving'), done: t('common.done') }
  const editing = sp.id ? data.rows.find((r) => r.id === sp.id) : undefined
  const open = canWrite && (editing || sp.new !== undefined)

  return (
    <>
      <PageHead title={l.title} lead={l.lead}>
        {canWrite && !open ? <ALink href="/admin/crm/lists?new">{l.new}</ALink> : null}
      </PageHead>
      <CrmTabs current="lists" labels={m.tabs} />
      {open ? (
        <Card title={editing ? l.edit : l.new} className="mb-[16px]" aside={<ALink href="/admin/crm/lists">{m.segments.cancel}</ALink>}>
          <ListForm key={editing?.id ?? 'new'} m={m} common={common} list={editing} />
        </Card>
      ) : null}
      <Card>
        <Table
          head={[l.col.name, l.col.public, l.col.subscribed, l.col.pending, l.col.unsubscribed, l.col.growth, l.col.campaigns, l.col.openRate, l.col.clickRate]}
          empty={data.rows.length ? undefined : t('common.none')}
        >
          {data.rows.map((r) => (
            <tr key={r.id}>
              <Td wrap>
                {canWrite ? <ALink href={`/admin/crm/lists?id=${r.id}`}>{r.name_no}</ALink> : <span className="font-semibold">{r.name_no}</span>}
                <span className="block text-[12px] text-mut">
                  {r.name_en} · {r.key}
                </span>
                {r.archived ? <Badge>{l.archived}</Badge> : null}
              </Td>
              <Td>{r.public ? l.yes : l.no}</Td>
              <Td>{r.subscribed}</Td>
              <Td>{r.pending}</Td>
              <Td>{r.unsubscribed}</Td>
              <Td>
                +{r.joined_30d} / −{r.left_30d}
              </Td>
              <Td>{r.campaigns}</Td>
              <Td>{rate(r.open_rate)}</Td>
              <Td>{rate(r.click_rate)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  )
}
