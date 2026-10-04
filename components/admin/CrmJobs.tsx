import { getTranslations } from 'next-intl/server'
import type { CrmJobs as Jobs } from '@/lib/admin/api'
import { CrmJobRetry } from './CrmJobRetry'
import { ALink, Badge, Card, Table, Td, when } from './ui'

/**
 * The CRM's jobs on the Operations page (0199, D-213; SF-02, SF-26): each scheduled job with its last run and its
 * last day, the hours with failed runs, the event subscribers with what waits for them, and the week's events per
 * kind from the rollup. A failed run or a delivery waiting for a retry raises the alert at the top, as the dashboard
 * counts them.
 */
const DAY = 86_400_000
const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const osloToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' }).format(new Date())
const shortDay = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })

export async function CrmJobs({ data }: { data: Jobs }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin.ops.crm' })
  const failedRuns = data.jobs.reduce((n, j) => n + j.day.failed, 0)
  const waiting = data.subscribers.reduce((n, s) => n + s.failed + s.skipped, 0)
  const alert = [failedRuns ? t('alertRuns', { count: failedRuns }) : null, waiting ? t('alertDeliveries', { count: waiting }) : null].filter(Boolean)
  const jobName = (job: string) => (t.has(`job.${job}`) ? t(`job.${job}`) : job)
  const took = (ms: number, runs: number) => (!runs ? '—' : ms < 1000 ? t('ms', { ms }) : t('seconds', { s: (ms / 1000).toFixed(1) }))

  // the week's days in Oslo, newest first, as the rollup counts them; calendar arithmetic at noon, so no daylight
  // saving change can skip or repeat a day
  const today = new Date(`${osloToday()}T12:00:00Z`).getTime()
  const days = Array.from({ length: 7 }, (_, i) => isoDay(new Date(today - i * DAY)))
  const counts = new Map<string, Map<string, number>>()
  for (const r of data.rollups) {
    if (!counts.has(r.name)) counts.set(r.name, new Map())
    counts.get(r.name)!.set(r.day, r.n)
  }
  const events = [...counts.keys()].sort()

  return (
    <section id="crm-jobs" className="mt-[14px] scroll-mt-[20px]">
      <Card title={t('title')} aside={<span className="text-[12px] text-mut">{t('window')}</span>}>
        {alert.length ? (
          <p role="alert" className="mb-[14px] mt-0 rounded-ctl bg-peach px-[12px] py-[9px] text-[13px] font-semibold text-dangerdeep">
            {alert.join(' · ')}
          </p>
        ) : null}
        <Table head={[t('head.job'), t('head.schedule'), t('head.last'), t('head.result'), t('head.runs'), t('head.failed'), t('head.items'), t('head.longest')]}>
          {data.jobs.map((j) => (
            <tr key={j.job}>
              <Td>
                <span className="font-semibold">{jobName(j.job)}</span>
                <span className="block text-[12px] text-mut">{j.cron_job}</span>
              </Td>
              <Td className={j.scheduled ? '' : 'font-bold text-danger'}>{j.scheduled ? j.schedule : t('notScheduled')}</Td>
              <Td>{j.last_finished_at ? when(j.last_finished_at) : t('never')}</Td>
              <Td>
                {j.last_ok === null ? (
                  <Badge tone="grey">{t('notRun')}</Badge>
                ) : j.last_ok ? (
                  <Badge tone="green">{t('ok')}</Badge>
                ) : (
                  <Badge tone="red">{t('failedCode', { code: j.last_error ?? '—' })}</Badge>
                )}
              </Td>
              <Td>{j.day.runs}</Td>
              <Td className={j.day.failed ? 'font-bold text-danger' : ''}>{j.day.failed}</Td>
              <Td>{j.day.items}</Td>
              <Td>{took(j.day.longest_ms, j.day.runs)}</Td>
            </tr>
          ))}
        </Table>

        {data.failed_runs.length ? (
          <>
            <h3 className="mb-[6px] mt-[18px] text-[13.5px] font-bold">{t('failedRuns')}</h3>
            <Table head={[t('failedHead.hour'), t('failedHead.job'), t('failedHead.runs'), t('failedHead.failed'), t('failedHead.error')]}>
              {data.failed_runs.map((r) => (
                <tr key={`${r.job}-${r.hour}`}>
                  <Td>{when(r.hour)}</Td>
                  <Td>{jobName(r.job)}</Td>
                  <Td>{r.runs}</Td>
                  <Td className="font-bold text-danger">{r.failed}</Td>
                  <Td>{r.last_error ?? '—'}</Td>
                </tr>
              ))}
            </Table>
          </>
        ) : null}

        <h3 className="mb-[6px] mt-[18px] text-[13.5px] font-bold">{t('subscribers')}</h3>
        <Table
          head={[
            t('subHead.subscriber'),
            t('subHead.takes'),
            t('subHead.behind'),
            t('subHead.pending'),
            t('subHead.failed'),
            t('subHead.skipped'),
            t('subHead.oldest'),
            t('subHead.error'),
            t('subHead.action'),
          ]}
          empty={data.subscribers.length ? undefined : t('noSubscribers')}
        >
          {data.subscribers.map((s) => (
            <tr key={s.key}>
              <Td>
                <span className="font-semibold">{s.key}</span>
                {s.active ? null : (
                  <span className="ml-[8px]">
                    <Badge tone="grey">{t('paused')}</Badge>
                  </span>
                )}
                <span className="block text-[12px] text-mut">{t.has(`handler.${s.handler}`) ? t(`handler.${s.handler}`) : s.handler}</span>
              </Td>
              <Td wrap className="min-w-[160px] max-w-[320px] break-words text-[12px]">
                {s.events ? s.events.join(', ') : t('everyEvent')}
              </Td>
              <Td>{s.behind}</Td>
              <Td>{s.pending}</Td>
              <Td className={s.failed ? 'font-bold text-danger' : ''}>{s.failed}</Td>
              <Td className={s.skipped ? 'font-bold text-danger' : ''}>{s.skipped}</Td>
              <Td>{when(s.oldest_waiting)}</Td>
              <Td>{s.last_error ?? '—'}</Td>
              <Td>
                <CrmJobRetry
                  subscriber={s.key}
                  waiting={s.failed + s.skipped}
                  labels={{ retry: t('retry'), retrying: t('retrying'), done: t('retried'), problems: t.raw('problem') as Record<string, string> }}
                />
              </Td>
            </tr>
          ))}
        </Table>

        <h3 className="mb-[6px] mt-[18px] text-[13.5px] font-bold">{t('rollups')}</h3>
        <Table head={[t('rollupHead.event'), ...days.map((d) => shortDay.format(new Date(`${d}T12:00:00Z`))), t('rollupHead.total')]} empty={events.length ? undefined : t('noRollups')}>
          {events.map((name) => {
            const row = counts.get(name)!
            return (
              <tr key={name}>
                <Td className="font-semibold">{name}</Td>
                {days.map((d) => (
                  <Td key={d} className={row.get(d) ? '' : 'text-mut'}>
                    {row.get(d) ?? 0}
                  </Td>
                ))}
                <Td className="font-bold">{days.reduce((n, d) => n + (row.get(d) ?? 0), 0)}</Td>
              </tr>
            )
          })}
        </Table>

        <p className="mb-0 mt-[10px] text-[11.5px] text-mut">
          {data.loop_limit === null
            ? t.rich('noteOff', { rules: (c) => <ALink href="/admin/settings?tab=rules">{c}</ALink> })
            : t.rich('note', { limit: data.loop_limit, rules: (c) => <ALink href="/admin/settings?tab=rules">{c}</ALink> })}
        </p>
      </Card>
    </section>
  )
}
