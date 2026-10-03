import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { CrmMessages } from '@/components/admin/CrmForms'
import { DecideRequest, RestoreActions } from '@/components/admin/CrmTrash'
import { labelText } from '@/lib/admin/crmLabel'
import { ALink, Badge, Card, day, PageHead, Problem, Table, Td, when } from '@/components/admin/ui'
import { isError } from '@/lib/admin/api'
import { autoTask, crmTrash, TRASH_ENTITIES, type CrmTrash, type TrashEntity } from '@/lib/admin/crm'
import { crmRuleState } from '@/lib/admin/crmRules'

/**
 * The restore list (0195, D-210; CRM-12, SF-15): every company, contact and activity deleted from the CRM,
 * with who deleted it, when and from where, and when the job removes it for good. Restored, a record comes
 * back with its links. The bulk deletes waiting for a second admin are above it while that rule is on.
 */
export default async function CrmRestore({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  const { entity } = await searchParams
  const chosen = (TRASH_ENTITIES as readonly string[]).includes(entity ?? '') ? (entity as TrashEntity) : null
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const x = m.trash
  const [data, rules] = await Promise.all([crmTrash(chosen), crmRuleState()])
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const common = { reason: t('common.reason'), reasonHint: t('common.reasonHint'), saving: t('common.saving'), done: t('common.done') }
  const total = data.counts.company + data.counts.contact + data.counts.activity
  const fill = (s: string, v: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''))
  // an activity's text; a rule's or a trigger's task holds a key (0143), said as such
  const record = (r: CrmTrash['rows'][number]) => {
    if (r.entity !== 'activity' || !r.label) return labelText(r.label)
    const text = r.label.origin && r.label.name && autoTask(r.label.name) ? x.auto : r.label.name
    return [r.label.kind ? m.company.kind[r.label.kind as keyof typeof m.company.kind] : null, text, r.label.detail].filter(Boolean).join(' · ')
  }
  const href = (r: CrmTrash['rows'][number]) =>
    r.entity === 'company' ? `/admin/crm/prospects/${r.id}` : r.entity === 'contact' ? `/admin/crm/contacts/${r.id}` : null
  const chip = (key: TrashEntity | null, text: string) => (
    <Link
      key={key ?? 'all'}
      href={(key ? `/admin/crm/restore?entity=${key}` : '/admin/crm/restore') as Route}
      aria-current={chosen === key ? 'page' : undefined}
      className={`rounded-pill border px-[12px] py-[5px] text-[12.5px] font-semibold ${chosen === key ? 'border-ink bg-ink text-bg hover:text-bg' : 'border-line bg-sf text-ink hover:text-ink'}`}
    >
      {text}
    </Link>
  )

  return (
    <>
      <PageHead title={x.title} lead={x.lead} />

      {data.requests.length ? (
        <Card title={x.requests.title} className="mb-[16px]">
          <p className="mb-[12px] mt-0 text-[12.5px] leading-[1.5] text-mut">{x.requests.lead}</p>
          <ol className="m-0 flex list-none flex-col gap-[14px] p-0">
            {data.requests.map((q) => (
              <li key={q.id} className="flex flex-col gap-[6px] border-b border-line pb-[12px] text-[13px] last:border-b-0 last:pb-0">
                <span className="font-semibold">
                  {fill(x.requests.line, { count: q.count, kind: q.count === 1 ? x.one[q.entity] : x.many[q.entity], by: q.requested_by ?? x.noOne, at: when(q.requested_at) })}
                </span>
                <span className="text-[12.5px] text-mut">
                  {q.names.map(labelText).join(', ')}
                  {q.count > q.names.length ? ` ${fill(x.requests.more, { n: q.count - q.names.length })}` : ''}
                </span>
                {q.reason ? <span className="text-[12.5px]">{fill(x.requests.reason, { reason: q.reason })}</span> : null}
                {data.may_write ? <DecideRequest id={q.id} mine={q.mine} m={m} common={common} reasonRequired={rules.reasonRequired} /> : null}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      <nav aria-label={x.col.type} className="mb-[12px] flex flex-wrap gap-[6px]">
        {chip(null, `${x.all} · ${total}`)}
        {TRASH_ENTITIES.map((k) => chip(k, `${x.entity[k]} · ${data.counts[k]}`))}
      </nav>

      <Card>
        <p className="mb-[12px] mt-0 text-[12.5px] text-mut">{data.window === null ? x.windowUnlimited : fill(x.window, { days: data.window })}</p>
        <Table
          head={[x.col.record, x.col.type, x.col.deletedBy, x.col.deletedAt, x.col.source, x.col.purgeAt, ...(data.may_write || data.may_purge ? [x.col.actions] : [])]}
          empty={data.rows.length ? undefined : x.empty}
        >
          {data.rows.map((r) => {
            const link = href(r)
            return (
              <tr key={`${r.entity}-${r.id}`}>
                <Td wrap>
                  {link ? <ALink href={link}>{record(r)}</ALink> : record(r)}
                  {r.with_activities > 0 ? <span className="block text-[12px] text-mut">{fill(x.withActivities, { n: r.with_activities })}</span> : null}
                </Td>
                <Td>
                  <Badge>{x.one[r.entity]}</Badge>
                </Td>
                <Td>{r.deleted_by ?? x.noOne}</Td>
                <Td>{when(r.deleted_at)}</Td>
                <Td>{m.history.source[r.source as keyof typeof m.history.source] ?? r.source}</Td>
                <Td>{r.purge_at ? day(r.purge_at) : x.kept}</Td>
                {data.may_write || data.may_purge ? (
                  <Td>
                    <RestoreActions
                      entity={r.entity}
                      id={r.id}
                      restorable={r.restorable}
                      mayWrite={data.may_write}
                      mayPurge={data.may_purge}
                      m={m}
                      common={common}
                      reasonRequired={rules.reasonRequired}
                    />
                  </Td>
                ) : null}
              </tr>
            )
          })}
        </Table>
      </Card>
    </>
  )
}
