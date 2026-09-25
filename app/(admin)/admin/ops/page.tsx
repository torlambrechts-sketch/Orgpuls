import { getTranslations } from 'next-intl/server'
import { ALink, Card, PageHead, Problem, Table, Td, when } from '@/components/admin/ui'
import { isError, ops } from '@/lib/admin/api'

/** Operations (D-90): the scheduler's runs and the notice queue, with failures to act on. */
export default async function AdminOps() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const res = await ops()
  if (isError(res)) return <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />

  return (
    <>
      <PageHead title={t('ops.title')} lead={t('ops.lead')} />
      <Card title={t('ops.queue')}>
        <Table
          head={[
            t('ops.queueHead.kind'),
            t('ops.queueHead.channel'),
            t('ops.queueHead.sent'),
            t('ops.queueHead.failed'),
            t('ops.queueHead.due'),
            t('ops.queueHead.scheduled'),
          ]}
          empty={res.queue.length ? undefined : t('common.none')}
        >
          {res.queue.map((q, i) => (
            <tr key={i}>
              <Td>{q.kind}</Td>
              <Td>{q.channel ?? '—'}</Td>
              <Td>{q.sent}</Td>
              <Td className={q.failed ? 'font-bold text-danger' : ''}>{q.failed}</Td>
              <Td className={q.due ? 'font-bold' : ''}>{q.due}</Td>
              <Td>{q.scheduled}</Td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title={t('ops.failures')} className="mt-[14px]">
        <Table
          head={[
            t('ops.failuresHead.org'),
            t('ops.failuresHead.kind'),
            t('ops.failuresHead.channel'),
            t('ops.failuresHead.due'),
            t('ops.failuresHead.attempts'),
            t('ops.failuresHead.error'),
          ]}
          empty={res.failures.length ? undefined : t('common.none')}
        >
          {res.failures.map((f, i) => (
            <tr key={i}>
              <Td>
                <ALink href={`/admin/orgs/${f.org_id}`}>{f.org_name}</ALink>
              </Td>
              <Td>{f.kind}</Td>
              <Td>{f.channel ?? '—'}</Td>
              <Td>{when(f.due_at)}</Td>
              <Td>{f.attempts}</Td>
              <Td wrap className="min-w-[240px] max-w-[420px] break-words text-[12px]">
                {f.error || '—'}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title={t('ops.runs')} className="mt-[14px]">
        <Table
          head={[
            t('ops.runsHead.at'),
            t('ops.runsHead.opened'),
            t('ops.runsHead.closed'),
            t('ops.runsHead.queued'),
            t('ops.runsHead.planned'),
            t('ops.runsHead.note'),
          ]}
          empty={res.runs.length ? undefined : t('common.none')}
        >
          {res.runs.map((r, i) => (
            <tr key={i}>
              <Td>{when(r.ran_at)}</Td>
              <Td>{r.opened}</Td>
              <Td>{r.closed}</Td>
              <Td>{r.queued}</Td>
              <Td>{r.planned}</Td>
              <Td className="text-[12px]">{r.note ?? '—'}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  )
}
