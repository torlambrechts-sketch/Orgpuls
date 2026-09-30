import { getTranslations } from 'next-intl/server'
import { CannedForm, CannedToggle } from '@/components/admin/CannedForms'
import { TicketTabs } from '@/components/admin/TicketTabs'
import { ALink, Badge, Card, PageHead, Problem, Table, Td } from '@/components/admin/ui'
import { cannedReplies, isError } from '@/lib/admin/api'

/**
 * Tickets › Canned replies (0135; D-92 seeded five in the migration): the texts the reply box
 * starts from. `?id=` edits one, `?new` adds one; archiving takes one out of the reply box and
 * keeps it here. Each change is in the audit log.
 */
export default async function CannedReplies({ searchParams }: { searchParams: Promise<{ id?: string; new?: string }> }) {
  const sp = await searchParams
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const c = (key: string) => t(`tickets.cannedPage.${key}`)
  const data = await cannedReplies()
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const editing = sp.id ? data.rows.find((r) => r.id === sp.id) : undefined
  const open = !!editing || sp.new !== undefined
  const words = {
    saving: t('common.saving'),
    done: t('common.done'),
    problems: { invalid: c('invalid'), not_found: c('notFound'), not_allowed: t('common.notAllowed'), failed: t('common.failed') },
  }

  return (
    <>
      <PageHead title={t('tickets.title')} lead={c('lead')}>
        {open ? null : <ALink href="/admin/tickets/canned?new">{c('new')}</ALink>}
      </PageHead>
      <TicketTabs on="canned" unseen={data.mentions_unseen} />
      {open ? (
        <Card title={editing ? c('edit') : c('new')} className="mb-[16px]" aside={<ALink href="/admin/tickets/canned">{c('cancel')}</ALink>}>
          <CannedForm
            key={editing?.id ?? 'new'}
            reply={editing}
            words={{ ...words, title: c('title'), body: c('body'), bodyHint: c('bodyHint'), sort: c('sort'), save: t('common.save') }}
          />
        </Card>
      ) : null}
      <Card>
        <Table head={[c('col.title'), c('col.text'), c('col.sort'), c('col.state'), '']} empty={data.rows.length ? undefined : c('empty')}>
          {data.rows.map((r) => (
            <tr key={r.id}>
              <Td wrap>
                <ALink href={`/admin/tickets/canned?id=${r.id}`}>{r.title}</ALink>
              </Td>
              <Td wrap className="max-w-[46ch] text-mut">
                <span className="line-clamp-2 whitespace-pre-line">{r.body}</span>
              </Td>
              <Td>{r.sort}</Td>
              <Td>
                <Badge tone={r.active ? 'green' : 'grey'}>{r.active ? c('active') : c('archived')}</Badge>
              </Td>
              <Td className="text-right">
                <CannedToggle id={r.id} active={r.active} words={{ ...words, archive: c('archive'), restore: c('restore') }} />
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  )
}
