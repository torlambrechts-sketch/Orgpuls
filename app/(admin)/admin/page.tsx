import { getTranslations } from 'next-intl/server'
import { Card, nok, PageHead, pct, Problem, Stat, Table, Td } from '@/components/admin/ui'
import { funnel, isError, kpis } from '@/lib/admin/api'

/**
 * The dashboard (D-90): the business in six numbers, then the question the specification puts
 * first — are trials turning into organisations that run surveys and act on them? — as an
 * activation funnel per signup month.
 */
export default async function AdminDashboard() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const [k, f] = await Promise.all([kpis(), funnel(12)])
  const problem = (e: { error: string }) => (e.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed'))

  return (
    <>
      <PageHead title={t('dashboard.title')} lead={t('dashboard.lead')} />
      {isError(k) ? (
        <Problem text={problem(k)} />
      ) : (
        <div className="grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
          <Stat label={t('dashboard.mrr')} value={nok(k.mrr)} hint={t('dashboard.arr', { value: nok(k.arr) })} />
          <Stat label={t('dashboard.paying')} value={k.paying} hint={t('dashboard.offers', { count: k.offers_requested })} />
          <Stat
            label={t('dashboard.trials')}
            value={k.trials_active}
            hint={t('dashboard.expiring', { count: k.trials_expiring_7d })}
          />
          <Stat label={t('dashboard.expired')} value={k.trials_expired} />
          <Stat
            label={t('dashboard.conversion')}
            value={k.conversion === null ? '—' : `${k.conversion} %`}
            hint={t('dashboard.conversionHint')}
          />
        </div>
      )}

      <Card title={t('dashboard.funnel')} className="mt-[16px]">
        <p className="mb-[10px] mt-0 text-[12.5px] text-mut">{t('dashboard.funnelNote')}</p>
        {isError(f) ? (
          <Problem text={problem(f)} />
        ) : (
          <Table
            head={[
              t('dashboard.cohort'),
              t('dashboard.created'),
              t('dashboard.employees'),
              t('dashboard.scheduled'),
              t('dashboard.sent'),
              t('dashboard.unlocked'),
              t('dashboard.viewed'),
              t('dashboard.measure'),
              t('dashboard.converted'),
              t('dashboard.median'),
            ]}
            empty={f.rows.length ? undefined : t('common.none')}
          >
            {f.rows.map((c) => (
              <tr key={c.cohort}>
                <Td className="font-semibold">{c.cohort}</Td>
                <Td>{c.created}</Td>
                {[
                  c.employees_uploaded,
                  c.survey_scheduled,
                  c.survey_sent,
                  c.result_unlocked,
                  c.results_viewed,
                  c.measure_created,
                  c.converted,
                ].map((n, i) => (
                  <Td key={i}>
                    {n} <span className="text-mut">· {pct(n, c.created)}</span>
                  </Td>
                ))}
                <Td>
                  {c.median_hours_to_first_send === null ? '—' : t('dashboard.hours', { value: c.median_hours_to_first_send })}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  )
}
