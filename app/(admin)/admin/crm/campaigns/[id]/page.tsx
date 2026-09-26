import { getTranslations } from 'next-intl/server'
import { CampaignActions, CampaignEditor, type CrmMessages } from '@/components/admin/CrmForms'
import { CrmTabs, STATUS_TONE } from '@/components/admin/CrmTabs'
import { ALink, Badge, Card, PageHead, pct, Problem, Stat, when } from '@/components/admin/ui'
import en from '@/messages/en.json'
import no from '@/messages/no.json'
import { isError, whoami } from '@/lib/admin/api'
import { crmCampaign, crmSegments } from '@/lib/admin/crm'
import { renderCampaign, type MailCatalogue } from '@/supabase/functions/_shared/mail'

/**
 * One campaign (D-101): its content while it is a draft, a preview drawn by the same module
 * the dispatcher sends with, a test to the admin's own address, scheduling, and the report:
 * delivery, opens and clicks from the provider, and visits and signups from the site's own
 * analytics, joined on utm_campaign.
 */
const SITE = 'https://www.orgpuls.com'

export default async function CrmCampaign({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const [data, segs, who] = await Promise.all([crmCampaign(id), crmSegments(), whoami()])
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const c = data.campaign
  const s = data.stats
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const common = { reason: t('common.reason'), reasonHint: t('common.reasonHint'), saving: t('common.saving'), done: t('common.done') }
  const segments = isError(segs) ? [] : segs.rows.map((g) => ({ id: g.id, name: g.name, mailable: g.mailable }))

  // the preview is the real rendering, with a placeholder token that unsubscribes nobody
  const cat = { no: no.mail, en: en.mail } as unknown as MailCatalogue
  const preview = c.blocks.length
    ? renderCampaign(
        cat,
        {
          id: 'preview',
          kind: 'campaign',
          to_email: '',
          token: '0'.repeat(64),
          name: null,
          lang: c.lang,
          campaign: { kind: c.kind, subject: c.subject, preheader: c.preheader, blocks: c.blocks, utm_campaign: c.utm_campaign },
        },
        SITE,
      )
    : null

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
        <div className="mb-[16px] grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
          <Stat label={m.campaign.audience} value={c.audience ?? '—'} hint={c.scheduled_at ? when(c.scheduled_at) : undefined} />
          <Stat label={m.campaign.sent} value={s.sent} hint={s.queued ? `${m.campaign.queued} ${s.queued}` : undefined} />
          <Stat label={m.campaign.delivered} value={s.delivered} hint={pct(s.delivered, s.sent)} />
          <Stat label={m.campaign.bounced} value={s.bounced} hint={pct(s.bounced, s.sent)} />
          <Stat label={m.campaign.opened} value={s.opened} hint={pct(s.opened, s.sent)} />
          <Stat label={m.campaign.clicked} value={s.clicked} hint={pct(s.clicked, s.sent)} />
          <Stat label={m.campaign.unsubscribed} value={s.unsubscribed} hint={s.complaints ? `${m.campaign.complaints} ${s.complaints}` : undefined} />
        </div>
      ) : null}

      <div className="grid items-start gap-[14px] xl:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-[14px]">
          <Card title={m.campaign.content}>
            {canWrite && c.status === 'draft' ? (
              <CampaignEditor m={m} common={common} campaign={c} segments={segments} />
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
            <p className="mb-0 mt-[10px] text-[12px] text-mut">{m.campaign.openNote}</p>
          </Card>
        </div>
        <Card title={m.campaign.preview}>
          {preview ? (
            <div className="flex flex-col gap-[14px]">
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
