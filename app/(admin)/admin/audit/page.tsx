import { getTranslations } from 'next-intl/server'
import { ALink, Card, PageHead, Problem, Table, Td, when } from '@/components/admin/ui'
import { auditList, isError } from '@/lib/admin/api'

/** The audit log (D-90): the super-admin's view of everything every admin has read or done. */
export default async function AdminAudit() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const res = await auditList(null, 500)
  if (isError(res)) return <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  return (
    <>
      <PageHead title={t('audit.title')} lead={t('audit.lead')} />
      <Card>
        <Table
          head={[
            t('audit.head.at'),
            t('audit.head.who'),
            t('audit.head.action'),
            t('audit.head.org'),
            t('audit.head.target'),
            t('audit.head.reason'),
            t('audit.head.detail'),
          ]}
          empty={res.rows.length ? undefined : t('common.none')}
        >
          {res.rows.map((a) => (
            <tr key={a.id}>
              <Td>{when(a.at)}</Td>
              <Td>
                {a.admin_email ?? '—'}
                <span className="block text-[11px] text-mut">{a.admin_role ?? ''}</span>
              </Td>
              <Td className="font-semibold">{a.action}</Td>
              <Td>{a.org_id ? <ALink href={`/admin/orgs/${a.org_id}`}>{a.org_name ?? a.org_id}</ALink> : '—'}</Td>
              <Td className="text-[12px]">{a.target_type ? `${a.target_type} ${a.target_id ?? ''}` : '—'}</Td>
              <Td wrap className="min-w-[220px]">
                {a.reason ?? '—'}
              </Td>
              <Td className="max-w-[280px] break-words font-mono text-[11px]">{a.detail ? JSON.stringify(a.detail) : '—'}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  )
}
