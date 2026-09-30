import { getTranslations } from 'next-intl/server'
import { KpiStrip, StatusChip } from '@/components/admin/growth'
import { RunAuthCheck } from '@/components/admin/G4Controls'
import { PageHead, Problem, Stat } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { classTone, deliverabilityKpis, levelTone, localeList, streamGap, streamRates, type AuthLevel, type Stream } from '@/lib/admin/deliverability'
import { DOT_CLASS, type DotTone } from '@/lib/admin/dots'
import { mayOpenGrowthView } from '@/lib/admin/growth'
import { growthDeliverability } from '@/lib/admin/growthG4'
import { dayMonth, fmt } from '@/lib/admin/magnets'

const PANEL = 'rounded-panel border border-line bg-sf'
const HEAD = 'text-[11px] uppercase tracking-[0.09em] text-mut'
const CARD = `${PANEL} px-[20px] py-[20px] md:px-[26px] md:py-[24px]`

type M = (k: string, v?: Record<string, string | number>) => string

/**
 * Sentral › Admin › Deliverability (design revision 3, `isDeliverability`; 0144, D-185). Access is
 * the growth section's (super_admin, analyst, marketing), which the database checks on each call.
 *
 *   KPIs, streams   seven days of each stream counted from what records it — the outbox and its
 *                   recipients, ticket and trial mail, invitation tests and the CRM's sends — with
 *                   the provider's delivery state from app.mail_events and the CRM's own. A rate only
 *                   over messages sent, and only once the provider reported on any of them
 *   the check       SPF, DKIM and DMARC as public DNS last answered, recorded by «Run authentication
 *                   check»; «not checked yet» until it has run
 *   the registry    every mail the product and the CRM send, classified, with seven days' count; Auth's
 *                   mail is recorded nowhere, so its count is «—»
 *   provider        what is known of Brevo; nothing about a DPA or IPs that Sentral does not hold
 *   hygiene         what the dispatcher and the database actually do, the daily cap as it is set
 */
export default async function Page() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const who = await whoami()
  if (!mayOpenGrowthView(who?.role, 'deliverability')) return <Problem text={t('common.notAllowed')} />
  const res = await growthDeliverability()
  if (isError(res)) return <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const d: M = (k, v) => t(`growth.g4.deliverability.${k}`, v)
  const k = deliverabilityKpis(res.streams)
  const none = d('registry.none')
  const deliveredHint = k.gap === 'nothing_sent' ? d('kpi.nothingSent') : k.gap === 'no_events' ? d('kpi.noEvents', { n: k.sent }) : d('kpi.deliveredSub', { n: fmt(k.sent) })

  return (
    <div className="leading-[1.5]">
      <PageHead title={t('growth.view.deliverability.title')} lead={t('growth.view.deliverability.lead')} measure={false}>
        <RunAuthCheck
          label={d('run')}
          busyLabel={d('running')}
          problems={{ too_soon: d('problem.too_soon'), not_allowed: d('problem.not_allowed'), invalid: d('problem.invalid'), failed: d('problem.failed') }}
        />
      </PageHead>
      <KpiStrip>
        <Stat label={d('kpi.delivered')} value={k.delivered ?? none} hint={deliveredHint} />
        <Stat label={d('kpi.spam')} value={k.spam ?? none} hint={d('kpi.spamSub')} />
        <Stat label={d('kpi.hard')} value={<span title={d('kpi.hardWhy')}>{k.hardBounces === null ? none : fmt(k.hardBounces)}</span>} hint={d('kpi.hardSub')} />
        <Stat
          label={d('kpi.complaints')}
          value={<span title={d('kpi.complaintsWhy')}>{k.complaints === null ? none : fmt(k.complaints)}</span>}
          hint={d('kpi.complaintsSub')}
        />
      </KpiStrip>

      <div className="mt-[18px] grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
        {res.streams.map((s) => (
          <StreamCard key={s.key} s={s} d={d} />
        ))}
      </div>

      <div className="mt-[18px] grid items-start gap-[18px] lg:[grid-template-columns:minmax(0,1.3fr)_minmax(300px,.7fr)]">
        <div className={`${PANEL} min-w-0 overflow-x-auto`}>
          <div className="min-w-[640px]">
            <div className="px-[20px] pt-[20px]">
              <h2 className="m-0 font-display text-[22px] font-medium">{d('registry.title')}</h2>
              <div className="mt-[4px] text-[12.5px] text-mut">{d('registry.sub')}</div>
            </div>
            <div role="table" aria-label={d('registry.table')}>
              <div role="row" className={`flex items-center gap-[14px] border-b border-line px-[20px] pb-[10px] pt-[14px] ${HEAD}`}>
                <span role="columnheader" className="flex-[1.6]">{d('registry.head.key')}</span>
                <span role="columnheader" className="flex-[1.4]">{d('registry.head.classification')}</span>
                <span role="columnheader" className="w-[110px]">{d('registry.head.stream')}</span>
                <span role="columnheader" className="w-[90px]">{d('registry.head.locales')}</span>
                <span role="columnheader" className="w-[40px]">{d('registry.head.version')}</span>
                <span role="columnheader" className="w-[70px] text-right">{d('registry.head.sent')}</span>
              </div>
              {res.templates.map((x) => (
                <div key={x.key} role="row" className="flex items-center gap-[14px] border-b border-line px-[20px] py-[11px] text-[13px]">
                  <span role="cell" className="min-w-0 flex-[1.6] text-[12px] font-semibold [font-family:ui-monospace,Menlo,monospace] [overflow-wrap:anywhere]">
                    {x.key}
                  </span>
                  <span role="cell" className="flex-[1.4]">
                    <StatusChip tone={classTone(x.classification)}>{d(`registry.class.${x.classification}`)}</StatusChip>
                  </span>
                  <span role="cell" className="w-[110px] text-[12.5px]">
                    {d(`stream.name.${x.stream}`)}
                  </span>
                  <span role="cell" className="w-[90px] text-[12px] text-mut">
                    {localeList(x.locales)}
                  </span>
                  <span role="cell" className="w-[40px] text-[12px] text-mut">
                    {d('registry.version', { n: x.version })}
                  </span>
                  <b role="cell" className="w-[70px] text-right" title={x.sent === null ? d('registry.notRecorded') : undefined}>
                    {x.sent === null ? none : fmt(x.sent)}
                  </b>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-[18px]">
          <section className={CARD}>
            <h2 className="m-0 font-display text-[22px] font-medium">{d('provider.title')}</h2>
            <div className="mt-[8px] flex flex-col">
              {(['provider', 'dpa', 'separation', 'events', 'alternative'] as const).map((p) => (
                <div key={p} className="flex justify-between gap-[12px] border-b border-line py-[9px] text-[13px]">
                  <span className="text-mut">{d(`provider.${p}`)}</span>
                  <span className="text-right font-semibold">{d(`provider.${p}Val`)}</span>
                </div>
              ))}
            </div>
          </section>
          <section className={CARD}>
            <h2 className="m-0 font-display text-[22px] font-medium">{d('hygiene.title')}</h2>
            <div className="mt-[12px] flex flex-col gap-[8px]">
              {[
                res.daily_cap === null ? d('hygiene.noCap') : d('hygiene.cap', { cap: fmt(res.daily_cap) }),
                d('hygiene.suppress'),
                d('hygiene.stale'),
                d('hygiene.clicks'),
                d('hygiene.separate'),
              ].map((h) => (
                <div key={h} className="flex gap-[8px] text-[13px] leading-[1.45] [text-wrap:pretty]">
                  <span aria-hidden="true" className={`mt-[6px] block h-[6px] w-[6px] flex-none rounded-pill ${DOT_CLASS.teal}`} />
                  <span className="min-w-0">{h}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function CheckLine({ tone, label, val, title }: { tone: DotTone; label: string; val: string; title?: string }) {
  return (
    <div title={title} className="flex items-center gap-[10px] border-b border-line py-[9px] text-[13px]">
      <span aria-hidden="true" className={`block h-[6px] w-[6px] flex-none rounded-pill ${DOT_CLASS[tone]}`} />
      <span className="flex-1 font-semibold">{label}</span>
      <span className="text-right text-[12px] text-mut">{val}</span>
    </div>
  )
}

function StreamCard({ s, d }: { s: Stream; d: M }) {
  const rates = streamRates(s)
  const gap = streamGap(s)
  const none = d('registry.none')
  const c = s.check
  const lvl = (l: AuthLevel | undefined) => (l ? d(`stream.check.level.${l}`) : d('stream.check.level.never'))
  const tip = c ? d('stream.check.tip', { domain: c.domain, date: dayMonth(c.checked_at), time: new Date(c.checked_at).toISOString().slice(11, 16) }) : d('stream.check.neverTip')
  const figures: [string, string][] = [
    [d('stream.vol'), fmt(s.sent)],
    [d('stream.delivered'), rates.delivered ?? none],
    [d('stream.spam'), rates.spam ?? none],
    [d('stream.bounce'), rates.bounce ?? none],
  ]
  return (
    <section className={CARD}>
      <div className={HEAD}>{d('stream.label', { name: d(`stream.name.${s.key}`) })}</div>
      <h2 className="m-0 mt-[8px] text-[18px] font-bold [font-family:ui-monospace,Menlo,monospace] [overflow-wrap:anywhere]">{s.domain}</h2>
      <div className="mt-[4px] text-[12.5px] text-mut [text-wrap:pretty]">{d(`stream.carries.${s.key}`)}</div>
      <div
        title={gap ? d(`stream.gap.${gap}`) : undefined}
        className="mt-[14px] flex flex-wrap gap-[14px] rounded-cta border border-line bg-bg px-[14px] py-[12px]"
      >
        {figures.map(([label, value]) => (
          <div key={label}>
            <div className={HEAD}>{label}</div>
            <div className="text-[18px] font-bold">{value}</div>
          </div>
        ))}
        {gap ? <span className="sr-only">{d(`stream.gap.${gap}`)}</span> : null}
      </div>
      <div className="mt-[8px] flex flex-col">
        <CheckLine tone={levelTone(c?.spf ?? null)} label={d('stream.check.spf')} val={c ? d('stream.check.checked', { level: lvl(c.spf), date: dayMonth(c.checked_at) }) : lvl(undefined)} title={tip} />
        <CheckLine tone={levelTone(c?.dkim ?? null)} label={d('stream.check.dkim')} val={lvl(c?.dkim)} title={tip} />
        <CheckLine
          tone={levelTone(c?.dmarc ?? null)}
          label={d('stream.check.dmarc')}
          val={c?.dmarc_policy ? d('stream.check.policy', { level: lvl(c.dmarc), policy: c.dmarc_policy }) : lvl(c?.dmarc)}
          title={tip}
        />
        {s.key === 'marketing' ? (
          <CheckLine tone="teal" label={d('stream.unsub.marketing')} val={d('stream.unsub.marketingVal')} />
        ) : (
          <CheckLine tone="teal" label={d('stream.unsub.transactional')} val={d('stream.unsub.transactionalVal')} />
        )}
        <CheckLine
          tone={s.last_event_at ? 'teal' : 'line'}
          label={d('stream.events')}
          val={s.last_event_at ? d('stream.eventsAt', { date: dayMonth(s.last_event_at) }) : d('stream.eventsNone')}
        />
      </div>
    </section>
  )
}
