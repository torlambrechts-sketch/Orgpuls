import { getTranslations } from 'next-intl/server'
import { ALink, Card, PageHead, pct, Problem, Stat, Table, Td, when } from '@/components/admin/ui'
import { deliverability, isError, ops } from '@/lib/admin/api'

/**
 * Operations (D-90): deliverability from the provider's delivery events (D-97), the scheduler's
 * runs and the notice queue, with failures to act on.
 */
export default async function AdminOps() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const [res, dv] = await Promise.all([ops(), deliverability(30)])
  if (isError(res)) return <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />

  return (
    <>
      <PageHead title={t('ops.title')} lead={t('ops.lead')} />
      {isError(dv) ? null : (
        <Card
          title={t('ops.delivery.title')}
          className="mb-[14px]"
          aside={<span className="text-[12px] text-mut">{t('ops.delivery.window')}</span>}
        >
          {(() => {
            const tt = dv.totals
            const sent = tt.delivered + tt.hard + tt.blocked
            // mailbox providers start filtering a sender past ~2 % bounces or ~0.1 % complaints
            const bounceRate = sent ? (100 * (tt.hard + tt.blocked)) / sent : 0
            const complaintRate = sent ? (100 * tt.spam) / sent : 0
            return (
              <>
                <div className="grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
                  <Stat label={t('ops.delivery.delivered')} value={tt.delivered} />
                  <Stat label={t('ops.delivery.bounced')} value={tt.hard + tt.blocked} hint={pct(tt.hard + tt.blocked, sent)} />
                  <Stat label={t('ops.delivery.soft')} value={tt.soft} hint={t('ops.delivery.softHint')} />
                  <Stat label={t('ops.delivery.complaints')} value={tt.spam + tt.unsubscribed} hint={pct(tt.spam, sent)} />
                  <Stat label={t('ops.delivery.unmatched')} value={tt.unmatched} hint={t('ops.delivery.unmatchedHint')} />
                </div>
                {bounceRate > 2 || complaintRate > 0.1 ? (
                  <p
                    role="alert"
                    className="mb-0 mt-[12px] rounded-ctl bg-peach px-[12px] py-[9px] text-[13px] font-semibold text-dangerdeep"
                  >
                    {t('ops.delivery.alert')}
                  </p>
                ) : null}
                {dv.orgs.length ? (
                  <div className="mt-[14px]">
                    <Table
                      head={[
                        t('ops.delivery.org'),
                        t('ops.delivery.delivered'),
                        t('ops.delivery.bounced'),
                        t('ops.delivery.complaints'),
                        t('ops.delivery.addresses'),
                      ]}
                    >
                      {dv.orgs.map((o) => (
                        <tr key={o.org_id}>
                          <Td>
                            <ALink href={`/admin/orgs/${o.org_id}`}>{o.name}</ALink>
                          </Td>
                          <Td>{o.delivered}</Td>
                          <Td className="font-bold text-danger">{o.bounced}</Td>
                          <Td>{o.complaints}</Td>
                          <Td>{o.address_problems}</Td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                ) : null}
                <p className="mb-0 mt-[10px] text-[11.5px] text-mut">{t('ops.delivery.note')}</p>
              </>
            )
          })()}
        </Card>
      )}
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
