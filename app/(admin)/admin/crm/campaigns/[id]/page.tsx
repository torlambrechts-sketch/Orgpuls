import { getTranslations } from 'next-intl/server'
import { CampaignActions, CampaignEditor, type CrmMessages } from '@/components/admin/CrmForms'
import { CrmTabs, STATUS_TONE } from '@/components/admin/CrmTabs'
import { ALink, Badge, Card, PageHead, pct, Problem, Stat, Table, Td, when } from '@/components/admin/ui'
import en from '@/messages/en.json'
import no from '@/messages/no.json'
import { isError, whoami } from '@/lib/admin/api'
import { crmCampaign, crmLists, crmSegments } from '@/lib/admin/crm'
import { renderCampaign, type MailCatalogue } from '@/supabase/functions/_shared/mail'

/**
 * One campaign (D-101, D-103): its content while it is a draft, a preview drawn by the module
 * the dispatcher sends with, a test to the admin's own address, scheduling, and the report —
 * delivery, opens, clicks, click-to-open and unsubscribes against the last ten campaigns; the
 * A/B result; the click map by link and block; the first 72 hours; and what the site's own
 * analytics saw on the campaign's utm_campaign.
 */
const SITE = 'https://www.orgpuls.com'
const share = (a: number, b: number) => (b ? (100 * a) / b : null)
const fmt = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)} %`)

export default async function CrmCampaign({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const r = m.report
  const [data, segs, lists, who] = await Promise.all([crmCampaign(id), crmSegments(), crmLists(), whoami()])
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const c = data.campaign
  const s = data.stats
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const common = { reason: t('common.reason'), reasonHint: t('common.reasonHint'), saving: t('common.saving'), done: t('common.done') }
  const segments = isError(segs) ? [] : segs.rows.map((g) => ({ id: g.id, name: g.name, mailable: g.mailable }))
  const listRows = isError(lists) ? [] : lists.rows.filter((l) => !l.archived || l.id === c.list_id)
  const list = listRows.find((l) => l.id === c.list_id)

  // the preview is the real rendering, with a placeholder token that unsubscribes nobody
  const cat = { no: no.mail, en: en.mail } as unknown as MailCatalogue
  const render = (subject: string) =>
    renderCampaign(
      cat,
      {
        id: 'preview',
        kind: 'campaign',
        to_email: '',
        token: '0'.repeat(64),
        name: 'Kari Nordmann',
        company: 'Eksempel AS',
        basis: c.style === 'letter' && !c.list_id ? 'business' : 'consent',
        lang: c.lang,
        campaign: {
          kind: c.kind,
          style: c.style,
          signature: c.signature,
          subject,
          preheader: c.preheader,
          blocks: c.blocks,
          utm_campaign: c.utm_campaign,
          web_slug: c.publish_web ? c.slug : null,
          list: list ? { name_no: list.name_no, name_en: list.name_en } : null,
        },
      },
      SITE,
    )
  const preview = c.blocks.length ? render(c.subject) : null

  const rates = [
    { k: r.deliveredRate, v: share(s.delivered, s.sent), bench: null },
    { k: r.openRate, v: share(s.opened, s.sent), bench: data.benchmark.open_rate },
    { k: r.clickRate, v: share(s.clicked, s.sent), bench: data.benchmark.click_rate },
    { k: r.ctor, v: share(s.clicked, s.opened), bench: null },
    { k: r.unsubRate, v: share(s.unsubscribed, s.sent), bench: data.benchmark.unsubscribe_rate },
    { k: r.bounceRate, v: share(s.bounced, s.sent), bench: null },
  ]
  const vs = (v: number | null, bench: number | null) =>
    v === null || bench === null || data.benchmark.campaigns === 0
      ? undefined
      : r.vs.replace('{delta}', `${v - bench >= 0 ? '+' : '−'}${Math.abs(v - bench).toFixed(1)} pts`).replace('{n}', String(data.benchmark.campaigns))

  const peak = Math.max(1, ...data.timeline.map((h) => Math.max(h.opened, h.clicked)))
  const busy = data.timeline.some((h) => h.opened || h.clicked)
  const strip = (key: 'opened' | 'clicked', color: string, title: string) => (
    <figure className="m-0">
      <figcaption className="mb-[4px] text-[12px] font-semibold text-mut">{title}</figcaption>
      <div className="flex h-[70px] items-end gap-[2px] border-b border-line" role="img" aria-label={`${title}: ${r.timelineLabel}`}>
        {data.timeline.map((h) => (
          <span
            key={h.hour}
            title={`+${h.hour}–${h.hour + 1} h: ${h[key]}`}
            className="min-w-[2px] flex-1 rounded-t-[4px]"
            style={{ height: h[key] ? `${Math.max(4, (100 * h[key]) / peak)}%` : 0, background: color }}
          />
        ))}
      </div>
    </figure>
  )

  return (
    <>
      <PageHead title={c.name} lead={c.subject || undefined}>
        <span className="flex items-center gap-[10px]">
          <Badge tone={STATUS_TONE[c.status]}>{m.campaigns.status[c.status]}</Badge>
          <ALink href="/admin/crm/campaigns">{m.campaign.back}</ALink>
        </span>
      </PageHead>
      <CrmTabs current="campaigns" labels={m.tabs} />

      {c.status !== 'draft' ? (
        <>
          <div className="mb-[12px] grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]">
            <Stat label={m.campaign.audience} value={c.audience ?? '—'} hint={data.list?.name ?? (c.scheduled_at ? when(c.scheduled_at) : undefined)} />
            <Stat label={m.campaign.sent} value={s.sent} hint={s.queued ? `${m.campaign.queued} ${s.queued}` : undefined} />
            {rates.map((x) => (
              <Stat key={x.k} label={x.k} value={fmt(x.v)} hint={vs(x.v, x.bench)} />
            ))}
          </div>
          <p className="mb-[16px] mt-0 text-[12px] text-mut">{data.benchmark.campaigns ? m.campaign.openNote : r.noBenchmark}</p>
        </>
      ) : null}

      <div className="grid items-start gap-[14px] xl:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-[14px]">
          {c.status !== 'draft' && data.variants.length > 1 ? (
            <Card title={r.ab}>
              <Table head={[r.variant, r.subject, r.sent, r.opened, r.clicked]}>
                {data.variants.map((v) => (
                  <tr key={v.variant}>
                    <Td>
                      {v.variant.toUpperCase()} {c.ab_winner === v.variant ? <Badge tone="green">{r.winner}</Badge> : null}
                    </Td>
                    <Td wrap>{v.variant === 'b' ? c.subject_b : c.subject}</Td>
                    <Td>{v.sent}</Td>
                    <Td>{pct(v.opened, v.sent)}</Td>
                    <Td>{pct(v.clicked, v.sent)}</Td>
                  </tr>
                ))}
              </Table>
              {!c.ab_decided_at && c.started_at ? (
                <p className="mb-0 mt-[8px] text-[12px] text-mut">
                  {r.deciding.replace('{when}', when(new Date(new Date(c.started_at).getTime() + c.ab_wait_hours * 3600_000).toISOString()))}
                </p>
              ) : null}
            </Card>
          ) : null}

          {c.status !== 'draft' ? (
            <Card title={r.links}>
              <Table head={[r.link, r.content, r.uniqueClicks, r.share]} empty={data.links.length ? undefined : r.noLinks}>
                {data.links.map((l) => (
                  <tr key={`${l.url}-${l.content}`}>
                    <Td wrap>{l.url.replace(/^https?:\/\//, '')}</Td>
                    <Td>{l.content || '—'}</Td>
                    <Td>{l.unique_clicks}</Td>
                    <Td>{pct(l.unique_clicks, s.opened)}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          ) : null}

          {c.status !== 'draft' && busy ? (
            <Card title={r.timeline}>
              <div className="flex flex-col gap-[12px]">
                {strip('opened', '#E0A21F', r.opens)}
                {strip('clicked', '#5C9A55', r.clicks)}
                <span className="text-[11.5px] text-mut">{r.hours}: 0 → 72</span>
              </div>
              <details className="mt-[10px] text-[12.5px]">
                <summary className="cursor-pointer font-semibold">{r.timelineLabel}</summary>
                <Table head={[r.hours, r.opens, r.clicks]}>
                  {data.timeline
                    .filter((h) => h.opened || h.clicked)
                    .map((h) => (
                      <tr key={h.hour}>
                        <Td>
                          +{h.hour}–{h.hour + 1}
                        </Td>
                        <Td>{h.opened}</Td>
                        <Td>{h.clicked}</Td>
                      </tr>
                    ))}
                </Table>
              </details>
            </Card>
          ) : null}

          <Card title={m.campaign.content}>
            {canWrite && c.status === 'draft' ? (
              <CampaignEditor m={m} common={common} campaign={c} segments={segments} lists={listRows.map((l) => ({ id: l.id, name: l.name_no, subscribed: l.subscribed }))} />
            ) : (
              <p className="m-0 text-[13px] text-mut">{m.campaign.locked}</p>
            )}
          </Card>
          {canWrite ? (
            <Card title={m.campaign.send}>
              {c.status === 'scheduled' && c.scheduled_at ? (
                <p className="mb-[10px] mt-0 text-[13px] font-semibold">{m.campaign.scheduledFor.replace('{when}', when(c.scheduled_at))}</p>
              ) : null}
              <p className="mb-[10px] mt-0 text-[12.5px] text-mut">{t('crm.campaign.tests', { count: data.tests })}</p>
              <CampaignActions m={m} common={common} campaign={c} />
            </Card>
          ) : null}
          <Card title={m.campaign.site}>
            <div className="grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(120px,1fr))]">
              <Stat label={m.campaign.sessions} value={data.web.sessions} />
              <Stat label={m.campaign.views} value={data.web.views} />
              <Stat label={m.campaign.signups} value={data.web.signups} />
              <Stat label={m.campaign.paid} value={data.web.paid} />
            </div>
            {c.publish_web && c.slug && c.status !== 'draft' ? (
              <p className="mb-0 mt-[10px] text-[12.5px]">
                <a href={`/nyhetsbrev/arkiv/${c.slug}`} target="_blank" rel="noreferrer">
                  orgpuls.com/nyhetsbrev/arkiv/{c.slug}
                </a>
              </p>
            ) : null}
          </Card>
        </div>
        <Card title={m.campaign.preview}>
          {preview ? (
            <div className="flex flex-col gap-[14px]">
              {c.subject_b.trim() ? <p className="m-0 text-[12.5px] text-mut">A: {c.subject} · B: {c.subject_b}</p> : null}
              <figure className="m-0">
                <figcaption className="mb-[6px] text-[12px] font-semibold text-mut">{m.campaign.mobile}</figcaption>
                <iframe
                  title={`${m.campaign.preview} · ${m.campaign.mobile}`}
                  srcDoc={preview.html}
                  sandbox=""
                  className="h-[640px] w-[375px] max-w-full rounded-ctl border border-line bg-bg"
                />
              </figure>
              <figure className="m-0 min-w-0">
                <figcaption className="mb-[6px] text-[12px] font-semibold text-mut">{m.campaign.desktop}</figcaption>
                <iframe
                  title={`${m.campaign.preview} · ${m.campaign.desktop}`}
                  srcDoc={preview.html}
                  sandbox=""
                  className="h-[560px] w-full rounded-ctl border border-line bg-bg"
                />
              </figure>
            </div>
          ) : (
            <p className="m-0 text-[13px] text-mut">{t('common.none')}</p>
          )}
        </Card>
      </div>
    </>
  )
}
