import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { NewCampaignDialog } from '@/components/admin/ContactDialogs'
import type { CrmMessages } from '@/components/admin/CrmForms'
import { STATUS_TONE } from '@/components/admin/CrmTabs'
import { Badge, BTN, PageHead, Problem, Stat } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { crmCampaigns, crmSegments, type CampaignRow } from '@/lib/admin/crm'

/**
 * Campaigns (X-095, the design's `isCampaigns`; D-101, X-092 before it): what is running, what went
 * out in 30 days and what it brought, every campaign with its click rate and state, and beside them
 * whether the lifecycle mail a subscription business should run exists — read from the campaigns and
 * the product's own trial mail (0060), never ticked by hand — and the house rules.
 */
const DAY = 86_400_000
const LIFECYCLE = ['onboarding', 'trialEnding', 'readOnly', 'winBack', 'newsletter'] as const

export default async function CrmCampaigns() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const cp = (k: string, v?: Record<string, string | number>) => t(`crm.campaignsPage.${k}`, v)
  const [data, who, segments] = await Promise.all([crmCampaigns(), whoami(), crmSegments()])
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const common = { reason: t('common.reason'), reasonHint: t('common.reasonHint'), saving: t('common.saving'), done: t('common.done') }
  const rows = data.rows
  const now = Date.now()
  const at = (r: CampaignRow) => Date.parse(r.finished_at ?? r.scheduled_at ?? '') || 0
  const recent = rows.filter((r) => r.stats.sent > 0 && now - at(r) <= 30 * DAY)
  const sent = recent.reduce((n, r) => n + r.stats.sent, 0)
  const delivered = recent.reduce((n, r) => n + r.stats.delivered, 0)
  const clicked = recent.reduce((n, r) => n + r.stats.clicked, 0)
  const running = rows.filter((r) => r.status === 'sending' || r.status === 'scheduled').length
  const signups = rows.reduce((n, r) => n + r.signups, 0)
  const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : null)

  // lifecycle coverage: the product's own trial mail is always on; the rest are campaigns
  const formerSegments = new Set(isError(segments) ? [] : segments.rows.filter((s) => s.filter.types?.includes('former')).map((s) => s.name))
  const latest = (list: CampaignRow[]) => [...list].sort((a, b) => at(b) - at(a))[0]
  const winBack = latest(rows.filter((r) => r.segment && formerSegments.has(r.segment) && r.status !== 'cancelled'))
  const newsletter = latest(rows.filter((r) => r.kind === 'newsletter' && r.status !== 'cancelled'))
  const coverage: Record<(typeof LIFECYCLE)[number], { state: string; tone: 'green' | 'yellow' | 'red'; href?: string }> = {
    onboarding: { state: cp('builtIn'), tone: 'green' },
    trialEnding: { state: cp('builtIn'), tone: 'green' },
    readOnly: { state: cp('builtIn'), tone: 'green' },
    winBack: winBack ? { state: m.campaigns.status[winBack.status], tone: winBack.status === 'draft' ? 'yellow' : 'green', href: `/admin/crm/campaigns/${winBack.id}` } : { state: cp('missing'), tone: 'red' },
    newsletter: newsletter ? { state: m.campaigns.status[newsletter.status], tone: newsletter.status === 'draft' ? 'yellow' : 'green', href: `/admin/crm/campaigns/${newsletter.id}` } : { state: cp('missing'), tone: 'red' },
  }
  const dot = { green: 'bg-teal', yellow: 'bg-ac', red: 'bg-peach' } as const

  return (
    <>
      <PageHead title={m.campaigns.title} lead={cp('lead', { count: rows.length, site: t('nav.siteName') })}>
        {canWrite ? <NewCampaignDialog m={m} common={common} label={m.campaigns.new} sub={cp('newSub')} close={cp('close')} /> : null}
      </PageHead>

      <div className="grid gap-[16px] [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <Stat label={cp('kpi.running')} value={running} hint={cp('kpi.runningSub', { drafts: rows.filter((r) => r.status === 'draft').length, cancelled: rows.filter((r) => r.status === 'cancelled').length })} />
        <Stat label={cp('kpi.sent')} value={sent.toLocaleString('nb-NO')} hint={sent ? cp('kpi.delivered', { pct: pct(delivered, sent) ?? 0 }) : cp('kpi.none')} />
        <Stat label={cp('kpi.clicks')} value={sent ? `${pct(clicked, sent)} %` : '—'} hint={cp('kpi.clicksSub', { count: clicked })} />
        <Stat label={cp('kpi.conversions')} value={signups} hint={cp('kpi.conversionsSub')} />
      </div>

      <div className="mt-[18px] grid items-start gap-[18px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1.3fr)_minmax(300px,.7fr)]">
        <section className="min-w-0 overflow-x-auto rounded-panel border border-line bg-sf">
          <div className="min-w-[620px]">
            <div aria-hidden="true" className="flex items-center gap-[14px] border-b border-line px-[20px] pb-[10px] pt-[14px] text-[11px] uppercase tracking-[0.09em] text-mut">
              <span className="flex-[2.2]">{cp('col.campaign')}</span>
              <span className="flex-[1.4]">{cp('col.clicks')}</span>
              <span className="w-[100px]">{cp('col.status')}</span>
              <span className="w-[70px]" />
            </div>
            <ul className="m-0 list-none p-0">
              {[...rows]
                .sort((a, b) => order(a) - order(b) || at(b) - at(a))
                .map((r) => {
                  const rate = pct(r.stats.clicked, r.stats.sent)
                  const href = `/admin/crm/campaigns/${r.id}` as Route
                  const when = r.finished_at ?? r.scheduled_at
                  return (
                    <li key={r.id} className="relative flex items-center gap-[14px] border-b border-line px-[20px] py-[14px] hover:bg-bg">
                      <div className="min-w-0 flex-[2.2]">
                        <Link href={href} className="block font-semibold text-ink no-underline after:absolute after:inset-0 hover:text-ink hover:no-underline">
                          {r.name}
                        </Link>
                        <div className="text-[12.5px] text-mut">
                          {[m.campaigns.kind[r.kind], r.list ?? r.segment, when ? cp(r.finished_at ? 'sentOn' : 'sendsOn', { date: fmt.format(new Date(when)) }) : cp('notScheduled')].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div className="flex flex-[1.4] items-center gap-[10px]">
                        <span aria-hidden="true" className="block h-[8px] flex-1 overflow-hidden rounded-pill bg-ink/[.08]">
                          <span className="block h-full rounded-pill bg-ac" style={{ width: `${Math.min(100, rate ?? 0)}%` }} />
                        </span>
                        <span className="whitespace-nowrap text-[12.5px]">
                          <b>{rate === null ? '—' : `${rate} %`}</b> <span className="text-mut">{cp('sent', { count: r.stats.sent })}</span>
                        </span>
                      </div>
                      <div className="w-[100px]">
                        <Badge tone={STATUS_TONE[r.status]}>{m.campaigns.status[r.status]}</Badge>
                      </div>
                      <div className="relative flex w-[70px] justify-end">
                        <Link href={href} className={BTN.row} tabIndex={-1} aria-hidden="true">
                          {cp('open')}
                        </Link>
                      </div>
                    </li>
                  )
                })}
            </ul>
            {rows.length ? null : <p className="m-0 px-[20px] py-[18px] text-[13px] text-mut">{t('common.none')}</p>}
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-[18px]">
          <section className="rounded-panel border border-line bg-sf px-[20px] py-[20px] md:px-[26px] md:py-[24px]">
            <h2 className="m-0 font-display text-[22px] font-medium">{cp('coverage')}</h2>
            <p className="mb-0 mt-[4px] text-[12.5px] text-mut">{cp('coverageLead')}</p>
            <ul className="m-0 mt-[12px] flex list-none flex-col p-0">
              {LIFECYCLE.map((k) => {
                const c = coverage[k]
                return (
                  <li key={k} className="flex items-center gap-[10px] border-b border-line py-[11px]">
                    <span aria-hidden="true" className={`block h-[6px] w-[6px] flex-none rounded-pill ${dot[c.tone]}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold">{cp(`life.${k}`)}</span>
                      <span className="block text-[12px] text-mut">{cp(`life.${k}Why`)}</span>
                    </span>
                    {c.href ? (
                      <Link href={c.href as Route} className="text-[12.5px] font-semibold text-ink">
                        {c.state}
                      </Link>
                    ) : (
                      <span className="text-[12.5px] font-semibold">{c.state}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
          <section className="rounded-panel border border-line bg-sf px-[20px] py-[20px] md:px-[26px] md:py-[24px]">
            <h2 className="m-0 font-display text-[22px] font-medium">{cp('rules')}</h2>
            <ul className="m-0 mt-[16px] flex list-none flex-col gap-[10px] p-0">
              {(['trigger', 'clicks', 'one', 'suppression'] as const).map((k) => (
                <li key={k} className="rounded-[12px] border border-line bg-bg px-[14px] py-[12px] text-[13px] leading-[1.5]">
                  <b>{cp(`rule.${k}`)}</b> {cp(`rule.${k}Why`)}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  )
}

const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' })
/** Running first, then drafts, then what went, then what was stopped */
const order = (r: CampaignRow) => ({ sending: 0, scheduled: 1, draft: 2, sent: 3, cancelled: 4 })[r.status]
