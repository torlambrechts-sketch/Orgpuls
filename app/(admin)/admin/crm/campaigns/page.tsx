import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Funnel } from '@/components/admin/CampaignFunnel'
import { NewCampaignForm, type CrmMessages } from '@/components/admin/CrmForms'
import { STATUS_TONE } from '@/components/admin/CrmTabs'
import { ALink, Badge, Card, PageHead, pct, Problem, when } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { crmCampaigns, type CampaignRow } from '@/lib/admin/crm'

/**
 * Campaigns and newsletters (D-101, X-092): drafts to finish, what is on its way, and what went,
 * each as a card with its audience, its funnel and the organisations it brought.
 */
export default async function CrmCampaigns() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const [data, who] = await Promise.all([crmCampaigns(), whoami()])
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const common = { reason: t('common.reason'), reasonHint: t('common.reasonHint'), saving: t('common.saving'), done: t('common.done') }
  const l = m.studio.list
  const groups: { key: string; title: string; rows: CampaignRow[] }[] = [
    { key: 'draft', title: l.draft, rows: data.rows.filter((r) => r.status === 'draft') },
    { key: 'scheduled', title: l.scheduled, rows: data.rows.filter((r) => r.status === 'scheduled' || r.status === 'sending') },
    { key: 'sent', title: l.sent, rows: data.rows.filter((r) => r.status === 'sent') },
    { key: 'cancelled', title: l.cancelled, rows: data.rows.filter((r) => r.status === 'cancelled') },
  ].filter((g) => g.rows.length)

  const card = (r: CampaignRow) => (
    <article key={r.id} className="flex min-w-0 flex-col gap-[10px] rounded-card border border-line bg-sf p-[16px]">
      <header className="flex items-start justify-between gap-[10px]">
        <div className="min-w-0">
          <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-mut">
            #{r.number} · {m.campaigns.kind[r.kind]}
          </span>
          <h3 className="m-0 mt-[2px] text-[16px] font-bold leading-[1.3]">
            <Link href={`/admin/crm/campaigns/${r.id}` as Route} className="text-ink no-underline hover:underline">
              {r.name}
            </Link>
          </h3>
          {r.subject ? <p className="m-0 mt-[2px] truncate text-[12.5px] text-mut">{r.subject}</p> : null}
        </div>
        <span className="flex flex-none flex-col items-end gap-[4px]">
          <Badge tone={STATUS_TONE[r.status]}>{m.campaigns.status[r.status]}</Badge>
          {r.ab ? <Badge tone={r.ab_winner ? 'green' : 'yellow'}>{`${m.campaignsCol.ab}${r.ab_winner ? ` · ${r.ab_winner.toUpperCase()}` : ''}`}</Badge> : null}
        </span>
      </header>
      <p className="m-0 text-[12.5px] text-mut">
        {[r.list ?? r.segment, r.audience !== null ? l.reach.replace('{count}', String(r.audience)) : null, r.finished_at || r.scheduled_at ? when(r.finished_at ?? r.scheduled_at) : null]
          .filter(Boolean)
          .join(' · ') || '—'}
      </p>
      {r.status === 'draft' ? null : <Funnel stats={r.stats} m={m} compact />}
      {r.stats.sent ? (
        <p className="m-0 flex flex-wrap gap-x-[14px] gap-y-[2px] text-[12px] text-mut">
          <span>
            {m.campaignsCol.clickRate}: <strong className="text-ink">{pct(r.stats.clicked, r.stats.sent)}</strong>
          </span>
          <span>
            {m.campaigns.col.unsubscribed}: <strong className="text-ink">{r.stats.unsubscribed}</strong>
          </span>
          <span>{l.signups.replace('{count}', String(r.signups))}</span>
        </p>
      ) : null}
    </article>
  )

  return (
    <>
      <PageHead title={m.campaigns.title} lead={m.campaigns.lead} />
      {canWrite ? (
        <Card title={m.campaigns.new} className="mb-[16px]">
          <NewCampaignForm m={m} common={common} />
          <p className="mb-0 mt-[8px] text-[12.5px]">
            <ALink href="/admin/crm/templates">{m.templates.title}</ALink>
          </p>
        </Card>
      ) : null}
      {groups.length ? (
        groups.map((g) => (
          <section key={g.key} className="mb-[20px]" aria-labelledby={`group-${g.key}`}>
            <h2 id={`group-${g.key}`} className="mb-[10px] mt-0 text-[13px] font-bold uppercase tracking-[0.08em] text-mut">
              {g.title} <span className="font-semibold">({g.rows.length})</span>
            </h2>
            <div className="grid gap-[12px] [grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))]">{g.rows.map(card)}</div>
          </section>
        ))
      ) : (
        <Card>
          <p className="m-0 text-[13px] text-mut">{t('common.none')}</p>
        </Card>
      )}
    </>
  )
}
