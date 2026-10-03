import { getTranslations } from 'next-intl/server'
import { CampaignStudio, InboxCheck, MailPreview } from '@/components/admin/CampaignStudio'
import { CampaignActions, type CrmMessages } from '@/components/admin/CrmForms'
import { Funnel } from '@/components/admin/CampaignFunnel'
import { CampaignPipelineForm, ResendForm } from '@/components/admin/CrmStageForms'
import { SequenceSteps } from '@/components/admin/CrmSequence'
import { StepActions, StepForm } from '@/components/admin/CrmStepForms'
import { STATUS_TONE } from '@/components/admin/CrmTabs'
import { ALink, Badge, Card, PageHead, pct, Problem, Stat, Table, Td, when } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { drawCampaign, footerOf, inboxCheck, mailCatalogue, sendingDomain } from '@/lib/admin/campaignMail'
import { domainChecks } from '@/lib/admin/mailDomain'
import { crmCampaign, crmCampaigns, crmLists, crmSegments, crmSenders, crmSequence, crmStages } from '@/lib/admin/crm'
import { crmRuleState } from '@/lib/admin/crmRules'

/**
 * One campaign (D-101, D-103): its content while it is a draft, a preview drawn by the module
 * the dispatcher sends with, a test to the admin's own address, scheduling, and the report —
 * delivery, opens, clicks, click-to-open and unsubscribes against the last ten campaigns; the
 * A/B result; the click map by link and block; the first 72 hours; and what the site's own
 * analytics saw on the campaign's utm_campaign.
 */
const share = (a: number, b: number) => (b ? (100 * a) / b : null)
const fmt = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)} %`)

export default async function CrmCampaign({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const r = m.report
  const [data, segs, lists, who, stageData, senderData, all, sequence, rules] = await Promise.all([
    crmCampaign(id),
    crmSegments(),
    crmLists(),
    whoami(),
    crmStages(),
    crmSenders(),
    crmCampaigns(),
    crmSequence(id),
    crmRuleState(),
  ])
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const c = data.campaign
  const s = data.stats
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const common = { reason: t('common.reason'), reasonHint: t('common.reasonHint'), saving: t('common.saving'), done: t('common.done') }
  const segments = isError(segs) ? [] : segs.rows.map((g) => ({ id: g.id, name: g.name, mailable: g.mailable }))
  const listRows = isError(lists) ? [] : lists.rows.filter((l) => !l.archived || l.id === c.list_id)
  const list = listRows.find((l) => l.id === c.list_id)
  // the pipeline (0093): stages, senders, and the campaigns this one could follow up
  const stages = isError(stageData) ? [] : stageData.rows
  const senders = isError(senderData) ? [] : senderData.rows
  const earlier = isError(all) ? [] : all.rows.filter((x) => x.id !== c.id && x.status !== 'cancelled').map((x) => ({ id: x.id, name: x.name }))
  const sender = senders.find((x) => x.id === c.sender_id)
  const stageName = (k: string | null) => stages.find((x) => x.key === k)?.name ?? k ?? ''
  const pipeline = m.pipeline

  // 0137: a call or LinkedIn step has no mail to show or report; it has its task and its tasks
  if (c.step_kind !== 'mail') {
    const parent = earlier.find((x) => x.id === c.follows_id)?.name ?? '—'
    const tasks = isError(sequence) ? null : (sequence.steps.find((x) => x.id === c.id)?.tasks ?? null)
    const kind = m.sequence.kind[c.step_kind]
    return (
      <>
        <PageHead title={c.name} lead={t('crm.step.lead', { kind, days: c.follow_days ?? 0, parent })}>
          <span className="flex items-center gap-[10px]">
            <Badge tone={STATUS_TONE[c.status]}>{m.campaigns.status[c.status]}</Badge>
            <ALink href={`/admin/crm/campaigns/${c.follows_id ?? ''}`}>{parent}</ALink>
          </span>
        </PageHead>
        <div className="grid items-start gap-[14px] xl:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-[14px]">
            <Card title={m.step.card}>
              <p className="mb-[10px] mt-0 text-[12.5px] leading-[1.55] text-mut">{m.step.explain}</p>
              {canWrite && c.status === 'draft' ? (
                <StepForm
                  step={{ id: c.id, name: c.name, subject: c.subject, step_kind: c.step_kind, follow_days: c.follow_days }}
                  m={m}
                  common={{ saving: common.saving, done: common.done }}
                />
              ) : (
                <p className="m-0 text-[13.5px] font-semibold">{c.subject}</p>
              )}
            </Card>
            {canWrite && c.status !== 'sent' && c.status !== 'cancelled' ? (
              <Card title={m.campaign.send}>
                <StepActions id={c.id} status={c.status} m={m} common={{ saving: common.saving, done: common.done }} />
              </Card>
            ) : null}
            <Card title={m.step.tasks}>
              <p className="mb-[10px] mt-0 text-[12.5px] text-mut">{m.step.tasksLead}</p>
              {tasks && tasks.made ? (
                <div className="grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(110px,1fr))]">
                  <Stat label={m.sequence.tasksMade} value={tasks.made} />
                  <Stat label={m.sequence.tasksOpen} value={tasks.open} />
                  <Stat label={m.sequence.tasksDone} value={tasks.done} />
                  <Stat label={m.sequence.tasksSkipped} value={tasks.skipped} />
                </div>
              ) : (
                <p className="m-0 text-[13px] text-mut">{m.step.noTasks}</p>
              )}
              <p className="mb-0 mt-[10px] text-[12.5px]">
                <ALink href="/admin/crm/tasks">{m.step.openTasks}</ALink>
              </p>
            </Card>
          </div>
          <Card title={m.sequence.title}>
            <p className="mb-[10px] mt-0 text-[12.5px] leading-[1.55] text-mut">{m.sequence.lead}</p>
            {isError(sequence) ? <Problem text={t('common.failed')} /> : <SequenceSteps steps={sequence.steps} current={c.id} m={m} />}
          </Card>
        </div>
      </>
    )
  }

  const summary = [
    c.stage_target ? pipeline.summary.target.replace('{stage}', stageName(c.stage_target)) : null,
    c.stage_on_send ? pipeline.summary.onSend.replace('{stage}', stageName(c.stage_on_send)) : null,
    pipeline.summary.sender.replace('{sender}', sender ? `${sender.name} <${sender.email}>` : pipeline.senderDefault),
    c.follows_id
      ? pipeline.summary.follows
          .replace('{campaign}', earlier.find((x) => x.id === c.follows_id)?.name ?? '—')
          .replace('{days}', String(c.follow_days ?? ''))
      : null,
    c.follows_id ? `${pipeline.followWhen}: ${pipeline.when[c.follow_when]}` : null,
    c.follow_auto ? pipeline.summary.auto : null,
  ].filter(Boolean)

  // the preview is the real rendering (lib/admin/campaignMail.ts), with a token that unsubscribes nobody
  const cat = await mailCatalogue()
  const listFooter = list ? { name_no: list.name_no, name_en: list.name_en } : null
  const draft = canWrite && c.status === 'draft'
  const [domain, inbox] = await Promise.all([
    draft ? domainChecks(sendingDomain(c, senders)) : Promise.resolve([]),
    !draft && c.status !== 'sent' && c.status !== 'cancelled' && c.blocks.length ? inboxCheck(cat, c, senders, listFooter) : Promise.resolve(null),
  ])
  const preview = c.blocks.length ? drawCampaign(cat, c, { sender, list: listFooter }) : null
  const crmOnly = { no: { crm: (cat.no as { crm?: unknown }).crm }, en: { crm: (cat.en as { crm?: unknown }).crm } } as unknown as typeof cat

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

      {c.status !== 'draft' ? (
        <>
          <div className="mb-[12px] grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]">
            <Stat label={m.campaign.audience} value={c.audience ?? '—'} hint={data.list?.name ?? (c.scheduled_at ? when(c.scheduled_at) : undefined)} />
            <Stat label={m.campaign.sent} value={s.sent} hint={s.queued ? `${m.campaign.queued} ${s.queued}` : undefined} />
            {rates.map((x) => (
              <Stat key={x.k} label={x.k} value={fmt(x.v)} hint={vs(x.v, x.bench)} />
            ))}
          </div>
          <div className="mb-[12px] rounded-panel border border-line bg-sf px-[18px] py-[16px]">
            <Funnel stats={s} m={m} />
          </div>
          <p className="mb-[16px] mt-0 text-[12px] text-mut">{data.benchmark.campaigns ? m.campaign.openNote : r.noBenchmark}</p>
        </>
      ) : null}

      {draft ? (
        <Card title={m.campaign.content} className="mb-[14px]">
          <CampaignStudio
            m={m}
            common={{ saving: common.saving, done: common.done }}
            campaign={c}
            segments={segments}
            lists={listRows.map((l) => ({ id: l.id, name_no: l.name_no, name_en: l.name_en, subscribed: l.subscribed }))}
            cat={crmOnly}
            sender={sender ? { name: sender.name, email: sender.email, signature: sender.signature } : null}
            domain={domain}
            footer={{ no: footerOf(cat, 'no'), en: footerOf(cat, 'en') }}
            maxBlocks={rules.maxBlocks}
          />
        </Card>
      ) : null}
      <div className={`grid items-start gap-[14px] ${draft ? '' : 'xl:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]'}`}>
        {/* a draft's studio carries the preview, so its other cards take the full width, two by two */}
        <div className={draft ? 'grid min-w-0 items-start gap-[14px] xl:grid-cols-2' : 'flex min-w-0 flex-col gap-[14px]'}>
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

          <Card title={pipeline.title}>
            <p className="mb-[10px] mt-0 text-[12.5px] text-mut">{pipeline.lead}</p>
            {canWrite && c.status === 'draft' ? (
              <CampaignPipelineForm
                campaign={c}
                stages={stages}
                senders={senders}
                campaigns={earlier}
                m={m}
                common={{ saving: common.saving, done: common.done }}
              />
            ) : (
              <ul className="m-0 flex list-none flex-col gap-[4px] p-0 text-[13px]">
                {summary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={m.sequence.title}>
            <p className="mb-[10px] mt-0 text-[12.5px] leading-[1.55] text-mut">{m.sequence.lead}</p>
            {isError(sequence) ? <Problem text={t('common.failed')} /> : <SequenceSteps steps={sequence.steps} current={c.id} m={m} />}
            {canWrite && c.status !== 'cancelled' ? (
              <div className="mt-[12px] border-t border-line pt-[12px]">
                <ResendForm id={c.id} m={m} />
              </div>
            ) : null}
            {canWrite && c.status !== 'cancelled' ? (
              <details className="mt-[12px] border-t border-line pt-[12px]">
                <summary className="cursor-pointer text-[13px] font-semibold">{m.sequence.addStep}</summary>
                <div className="mt-[10px]">
                  <StepForm follows={{ id: c.id, name: c.name }} m={m} common={{ saving: common.saving, done: common.done }} />
                </div>
              </details>
            ) : null}
          </Card>
          {draft ? null : (
            <Card title={m.campaign.content}>
              <p className="m-0 text-[13px] text-mut">{m.campaign.locked}</p>
            </Card>
          )}
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
        {draft ? null : (
          <Card title={m.campaign.preview}>
            {preview ? (
              <div className="flex flex-col gap-[14px]">
                {c.subject_b.trim() ? <p className="m-0 text-[12.5px] text-mut">A: {c.subject} · B: {c.subject_b}</p> : null}
                <MailPreview html={preview.html} subject={preview.subject} preheader={c.preheader} from={sender?.name || 'Orgpuls'} m={m} />
                {inbox ? (
                  <div className="rounded-panel border border-line bg-bg p-[14px]">
                    <InboxCheck checks={inbox.checks} m={m} />
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="m-0 text-[13px] text-mut">{t('common.none')}</p>
            )}
          </Card>
        )}
      </div>
    </>
  )
}
