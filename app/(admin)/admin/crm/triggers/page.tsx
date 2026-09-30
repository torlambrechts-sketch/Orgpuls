import { getTranslations } from 'next-intl/server'
import { KpiStrip, StatusChip } from '@/components/admin/growth'
import { EditTriggersDialog, RunPollButton } from '@/components/admin/GrowthCrmForms'
import { PageHead, Problem, Stat } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { dotTone } from '@/lib/admin/dots'
import { mayOpenGrowthView } from '@/lib/admin/growth'
import { brregTriggers } from '@/lib/admin/growthCrm'
import { fmt, isRecent, per100, stamp } from '@/lib/admin/growthCrmView'

const PANEL = 'rounded-panel border border-line bg-sf'
const CARD = 'px-[20px] py-[20px] md:px-[26px] md:py-[24px]'
const HEAD = 'text-[11px] uppercase tracking-[0.09em] text-mut'
const MONO = '[font-family:ui-monospace,Menlo,monospace]'
/** an organisation number as the design sets it: three groups of three */
const orgnr = (n: string) => n.replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3')

/**
 * Sentral › CRM › Brønnøysund triggers (design revision 3, `isTriggers`; 0143, D-184). What the daily
 * poll of Enhetsregisteret's update feed found and what the engine did with it, read as it stands:
 *
 *   the head        the design's «Dry run» chip only while the engine is in dry run, and the last
 *                   finished poll; Edit triggers (the rules the engine applies, read from it, and the
 *                   dry-run switch) and Run poll now (once in 15 minutes) for the CRM's writers
 *   the figures     the last poll's changes and triggers, outreach waiting and held out, the
 *                   do-not-contact list and the purges
 *   the queue       the latest outreach, its trigger, employees, industry, fit, channel and state
 *   triggers        the last poll's triggers by kind («yesterday» when it ran yesterday or today);
 *                   the empty treatment until a poll has finished
 *   results         trials per 100 contacts by channel, from outreach marked done and the
 *                   organisations that signed up after it, beside the holdout; the empty treatment
 *                   until there is any
 *   guardrails      the design's four lines, with the list's and the purges' real counts
 */
export default async function Page() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const b = (k: string, v?: Record<string, string | number>) => t(`growth.g3.triggers.${k}`, v)
  const who = await whoami()
  if (!mayOpenGrowthView(who?.role, 'crmTriggers')) return <Problem text={t('common.notAllowed')} />
  const res = await brregTriggers()
  if (isError(res)) return <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const now = new Date()
  const problems = t.raw('growth.g3.problem') as Record<string, string>
  const common = { cancel: t('growth.g3.cancel'), close: t('growth.g3.close'), saving: t('growth.g3.saving'), problems }
  const k = res.kpis
  const dash = t('growth.g3.dash')
  // the rules as the engine applies them (app.brreg_rules), never a copy of them in the messages
  const rules = res.rules
  const min = rules.fit_min
  const [t5, t30] = rules.thresholds
  // outreach made (a task marked done); until then the holdout has nothing to be compared with
  const contacted = res.results.some((r) => r.contacts > 0)

  const lead = (
    <span className="flex flex-wrap items-center gap-[10px]">
      {res.dry_run ? (
        <StatusChip tone="yellow" outline>
          {b('dryRun')}
        </StatusChip>
      ) : null}
      {res.last ? b('lead', { when: stamp(res.last.finished_at, now, t('growth.g3.today')) }) : b('leadNever')}
      {res.pending ? <span className="text-mut">· {b('pending')}</span> : null}
    </span>
  )

  return (
    <div className="leading-[1.5]">
      <PageHead title={t('growth.view.crmTriggers.title')} lead={lead} measure={false}>
        {canWrite ? (
          <div className="flex items-start gap-[10px] leading-[normal]">
            <EditTriggersDialog
              dryRun={res.dry_run}
              labels={{
                open: b('editTriggers'),
                title: b('edit.title'),
                sub: b('edit.sub', { t5: t5 ?? dash, t30: t30 ?? dash }),
                rows: [
                  { label: b('edit.thresholds'), value: rules.thresholds.join(' · ') },
                  { label: b('edit.industries'), value: rules.industries.map(([lo, hi]) => (lo === hi ? String(lo) : `${lo}–${hi}`)).join(', ') },
                  { label: b('edit.minimum'), value: String(min) },
                ],
                mode: b('edit.mode'),
                dry: b('edit.dry'),
                live: b('edit.live'),
                reason: b('edit.reason'),
                save: b('edit.save'),
              }}
              common={common}
            />
            <RunPollButton labels={{ run: b('runPoll'), asking: b('polling'), asked: b('asked') }} problems={problems} />
          </div>
        ) : null}
      </PageHead>

      <KpiStrip>
        <Stat label={res.last && isRecent(res.last.finished_at, now) ? b('kpi.changesYesterday') : b('kpi.changes')} value={res.last?.changes != null ? fmt(res.last.changes) : dash} hint={b('kpi.changesSub')} />
        <Stat label={b('kpi.matched')} value={res.last ? fmt(k.matched) : dash} hint={b('kpi.matchedSub', { min, n: res.last ? fmt(k.raised) : dash })} />
        <Stat label={b('kpi.queued')} value={fmt(k.queued)} hint={b('kpi.queuedSub', { n: fmt(k.held_out) })} />
        <Stat label={b('kpi.dnc')} value={fmt(k.dnc)} hint={b('kpi.dncSub', { n: fmt(k.purged) })} />
      </KpiStrip>

      <div className="mt-[18px] grid items-start gap-[18px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1.3fr)_minmax(300px,.7fr)]">
        <section className={`${PANEL} min-w-0 overflow-x-auto`}>
          <div className="min-w-[700px]">
            <div className="px-[20px] pt-[20px]">
              <h2 className="m-0 font-display text-[22px] font-medium">{b('queue.title')}</h2>
              <div className="mt-[4px] text-[12.5px] text-mut">{b('queue.sub', { min })}</div>
            </div>
            <div role="table" aria-label={b('queue.table')}>
              <div role="row" className={`flex items-center gap-[14px] border-b border-line px-[20px] pb-[10px] pt-[14px] ${HEAD}`}>
                <span role="columnheader" className="flex-[1.8]">{b('queue.head.company')}</span>
                <span role="columnheader" className="flex-[1.2]">{b('queue.head.trigger')}</span>
                <span role="columnheader" className="w-[120px]">{b('queue.head.employees')}</span>
                <span role="columnheader" className="w-[44px] text-right">{b('queue.head.fit')}</span>
                <span role="columnheader" className="flex-[1.2]">{b('queue.head.channel')}</span>
                <span role="columnheader" className="w-[110px]">{b('queue.head.status')}</span>
              </div>
              {res.queue.map((q) => (
                <div key={q.id} role="row" className="flex items-center gap-[14px] border-b border-line px-[20px] py-[12px] text-[13px]">
                  <div role="cell" className="min-w-0 flex-[1.8]">
                    <div className="font-semibold">{q.org}</div>
                    <div className={`text-[12px] text-mut ${MONO}`}>{orgnr(q.org_number)}</div>
                  </div>
                  <span role="cell" className={`flex-[1.2] text-[11.5px] ${MONO}`}>
                    {q.kind}
                  </span>
                  <span role="cell" className="w-[120px] text-[12.5px]">
                    {q.from !== null && q.to !== null
                      ? b('queue.from', { from: q.from, to: q.to })
                      : q.kind === 'company_new' && q.to !== null
                        ? b('queue.new', { to: q.to })
                        : q.to !== null
                          ? String(q.to)
                          : dash}{' '}
                    <span className="text-mut">· {q.nace ?? dash}</span>
                  </span>
                  <b role="cell" className="w-[44px] text-right">
                    {q.fit}
                  </b>
                  <span role="cell" className="flex-[1.2] text-[12.5px]">
                    {q.channel === 'email' ? b('channel.email', { local: q.email_local ?? '' }) : q.channel ? b(`channel.${q.channel}`) : b('channel.none')}
                  </span>
                  <span role="cell" className="w-[110px]">
                    <StatusChip tone={dotTone('outreach', q.status)}>{b(`status.${q.status}`)}</StatusChip>
                  </span>
                </div>
              ))}
            </div>
            {res.queue.length ? null : <p className="m-0 px-[20px] py-[18px] text-[13px] text-mut">{b('queue.empty', { min })}</p>}
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-[18px]">
          <section className={`${PANEL} ${CARD}`}>
            <h2 className="m-0 font-display text-[22px] font-medium">
              {res.last && isRecent(res.last.finished_at, now) ? b('types.titleYesterday') : b('types.title')}
            </h2>
            {res.last ? (
              <div className="mt-[8px] flex flex-col">
                {res.types.map((x) => (
                  <div key={x.kind} className="border-b border-line py-[10px] text-[13px]">
                    <div className="flex justify-between gap-[10px]">
                      <span className="font-semibold [text-wrap:pretty]">{b(`types.label.${x.kind}`)}</span>
                      <b>{fmt(x.n)}</b>
                    </div>
                    <div className="mt-[2px] text-[12px] text-mut">
                      <span className={MONO}>{x.kind}</span> · {b('types.line', { fit: x.fit, min, tasks: x.tasks, hold: x.hold })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // no poll has finished: the counts would be of a poll that does not exist
              <div className="mt-[12px] rounded-cta border border-dashed border-line bg-bg px-[14px] py-[14px] text-[12.5px] text-mut [text-wrap:pretty]">
                {b('types.empty')}
              </div>
            )}
          </section>

          <section className={`${PANEL} ${CARD}`}>
            <h2 className="m-0 font-display text-[22px] font-medium">{b('results.title')}</h2>
            <div className="mt-[4px] text-[12.5px] text-mut">{b('results.sub')}</div>
            {contacted ? (
              <div className="mt-[8px] flex flex-col">
                {[...res.results.map((r) => ({ key: r.channel, ...r })), { key: 'holdout' as const, ...res.holdout }].map((r) => {
                  const p = per100(r.trials, r.contacts)
                  return (
                    <div key={r.key} className="flex items-center gap-[10px] border-b border-line py-[10px] text-[13px]">
                      <span className="flex-1 font-semibold">{b(`results.channel.${r.key}`)}</span>
                      <span className="text-[12.5px] text-mut">
                        {b(r.key === 'holdout' ? 'results.lineHoldout' : 'results.line', { contacts: fmt(r.contacts), trials: fmt(r.trials) })}
                      </span>
                      <b className="min-w-[64px] text-right">{p === null ? dash : b('results.per100', { n: p })}</b>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="mt-[12px] rounded-cta border border-dashed border-line bg-bg px-[14px] py-[14px] text-[12.5px] text-mut [text-wrap:pretty]">
                {b('results.empty')}
              </div>
            )}
          </section>

          <section className={`rounded-panel border border-ink bg-sf ${CARD}`}>
            <h2 className="m-0 font-display text-[22px] font-medium">{b('guard.title')}</h2>
            <ul className="m-0 mt-[12px] flex list-none flex-col gap-[8px] p-0 text-[12.5px] leading-[1.5] [text-wrap:pretty]">
              {[b('guard.named'), b('guard.phone', { n: fmt(k.dnc) }), b('guard.purged', { n: fmt(k.purged) }), b('guard.roles')].map((line) => (
                <li key={line} className="flex gap-[8px]">
                  <span aria-hidden="true" className="mt-[6px] block h-[6px] w-[6px] flex-none rounded-pill bg-ink" />
                  <span className="min-w-0">{line}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
