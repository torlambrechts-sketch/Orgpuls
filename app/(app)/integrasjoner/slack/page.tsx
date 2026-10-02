import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getFormatter, getTranslations } from 'next-intl/server'
import { ButtonLink } from '@/components/ui/Button'
import { SlackSetup, type SlackSetupLabels } from '@/components/integrasjoner/SlackSetup'
import { outboundBase } from '@/lib/hosts'
import { getOrganization, getViewerRole } from '@/lib/org/read'
import { getSmsSettings } from '@/lib/settings/read'
import { getSlackSettings, getSlackStatus, slackConfigured } from '@/lib/slack/read'
import { problemFrom, slackGate } from '@/lib/slack/schema'
import { SLACK_SCOPES } from '@/supabase/functions/_shared/slack'
import { disconnectSlack, startSlackConnect } from './actions'

/**
 * Integrasjoner › Slack (0185, D-205). **The design has no Slack anywhere**: this screen is the
 * SMS, Entra and Teams screens' frame — the same back link, title row, status pill, two columns,
 * cards and buttons, with their classes — and nothing new is styled for it.
 *
 * Everything on it is real. «Tilkoblet» only over an installation the database holds and Slack
 * has not refused; the workspace's name is the one Slack gave at installation; the counts are the
 * register's and the matches' (public.slack_status, daglig leder only); the preview is the text the
 * dispatcher sends — the organisation's SMS lead and a link of the real shape. Without
 * SLACK_CLIENT_ID and SLACK_CLIENT_SECRET there is no app to install: the screen says Slack is not
 * set up at Orgpuls yet and offers no button, as the Entra screen does without ENTRA_CLIENT_ID.
 */
export const dynamic = 'force-dynamic'

// the shape of a real link since 0078 (D-128), as the SMS screen shows it
const SAMPLE_TOKEN = 'k3Xw9QpL2vRt7YbN4mZc8A'
const PERMS = [...SLACK_SCOPES.map((s) => s.replace(/[:.]/g, '_')), 'never'] as const

export default async function SlackPage({
  searchParams,
}: {
  searchParams: Promise<{ feil?: string; koblet?: string; frakoblet?: string }>
}) {
  const t = await getTranslations('slackSetup')
  const tn = await getTranslations()
  const format = await getFormatter()
  const params = await searchParams
  const [org, role, settings, sms, h] = await Promise.all([getOrganization(), getViewerRole(), getSlackSettings(), getSmsSettings(), headers()])
  if (!org || !settings) notFound()
  const status = await getSlackStatus(org.id)
  const configured = slackConfigured()
  const gate = slackGate(status, configured)
  const problem = problemFrom(params.feil)
  const leader = role === 'daglig_leder'
  const date = (iso: string | null | undefined) => (iso ? format.dateTime(new Date(iso), { dateStyle: 'long' }) : '')
  const working = gate === 'connected'

  const card = 'rounded-panel border border-line bg-sf px-[24px] py-[22px]'
  const head = 'text-[11px] uppercase tracking-[0.11em] text-mut'
  const counts = status?.counts ?? null
  const sampleLink = `${outboundBase(h.get('x-forwarded-host') ?? h.get('host'), h.get('x-forwarded-proto'))}/s/${SAMPLE_TOKEN}`

  const labels: SlackSetupLabels = {
    reach:
      status?.connected && counts
        ? {
            step: t('step3'),
            matchedLine: t('matchedLine', { matched: counts.matched, total: counts.active }),
            matchedNote: t('matchedNote', { withEmail: counts.with_email }),
            membersLine: status.sync_members === null ? null : t('membersLine', { count: status.sync_members }),
            synced: status.synced_at
              ? status.sync_requested_at
                ? t('syncedAsked', { date: date(status.synced_at) })
                : t('synced', { date: date(status.synced_at) })
              : t('syncPending'),
            syncError: status.sync_error ? t('syncError') : null,
            sent: t('sent30', { count: counts.sent_30d }),
            syncNow: t('syncNow'),
            syncAsked: t('syncAsked'),
          }
        : null,
    step: t('step4'),
    modes: {
      paaminn: { label: t('mode.paaminn'), note: t('modeNote.paaminn') },
      alle: { label: t('mode.alle'), note: t('modeNote.alle') },
    },
    preview: t('preview'),
    previewSender: t('previewSender'),
    previewText: sms?.text?.trim() ? sms.text : tn('mail.sms.default', { org: org.name }),
    previewLink: sampleLink,
    previewNote: t('previewNote'),
    legal: t('legal'),
    activate: t('activate'),
    deactivate: t('deactivate'),
    toggleNote: t('toggleNote'),
    readOnly: t('readOnly'),
    saving: t('saving'),
    problemTexts: Object.fromEntries(['invalid', 'denied', 'noOrg', 'notReady'].map((k) => [k, t(`saveProblem.${k}`)])),
  }

  const cards = (
    <>
      {/* 1 · Arbeidsområdet */}
      <section className={card}>
        <div className={head}>{t('step1')}</div>
        <label className="mt-[13px] block max-w-[360px]">
          <span className="mb-[6px] block text-[12.5px] text-mut">{t('workspaceLabel')}</span>
          <input
            value={status?.connected ? (status.team_name ?? '') : ''}
            readOnly
            placeholder={t('workspacePlaceholder')}
            aria-describedby="slack-workspace-note"
            className="box-border h-[42px] w-full rounded-btn border border-line bg-bg px-[14px] text-[14px] text-ink outline-none"
          />
        </label>
        <div id="slack-workspace-note" className="mt-[9px] max-w-[560px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
          {gate === 'broken'
            ? t('workspaceBroken', { date: date(status?.broken_at) })
            : status?.connected
              ? status.installed_by
                ? t('workspaceBoundBy', { date: date(status.installed_at), name: status.installed_by })
                : t('workspaceBound', { date: date(status.installed_at) })
              : t('workspaceNone')}
        </div>
      </section>

      {/* 2 · Hva appen får gjøre */}
      <section className={card}>
        <div className={head}>{t('step2')}</div>
        <div className="mt-[13px] flex flex-col gap-[8px]">
          {PERMS.map((k) => (
            <div
              key={k}
              className="grid gap-[4px] rounded-cta border border-line bg-bg px-[14px] py-[12px] md:items-center md:gap-[14px] md:[grid-template-columns:150px_minmax(0,1fr)_128px]"
            >
              <span className="font-mono text-[12.5px] font-bold">{t(`perm.${k}.scope`)}</span>
              <span className="text-[12.5px] leading-[1.5] [text-wrap:pretty]">{t(`perm.${k}.what`)}</span>
              <span className="text-[11.5px] text-mut md:text-right">{t(`perm.${k}.kind`)}</span>
            </div>
          ))}
        </div>
        <div className="mt-[12px] max-w-[580px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">{t('permNote')}</div>
      </section>
    </>
  )

  const side = (
    <>
      {params.koblet === '1' && working ? (
        <div role="status" className="rounded-note bg-mint px-[20px] py-[16px] text-[13px] leading-[1.55] text-greendeep [text-wrap:pretty]">
          {t('done')}
        </div>
      ) : null}
      {params.frakoblet === '1' && !status?.connected ? (
        <div role="status" className="rounded-note border border-line bg-sf px-[20px] py-[16px] text-[13px] leading-[1.55] [text-wrap:pretty]">
          {t('undone')}
        </div>
      ) : null}
      {problem ? (
        <p role="alert" className="m-0 text-[12.5px] leading-[1.5] text-danger [text-wrap:pretty]">
          {t(`problem.${problem}`)}
        </p>
      ) : null}

      {(gate === 'can_connect' || (gate === 'broken' && leader && configured)) ? (
        <form action={startSlackConnect} className="flex flex-col">
          <button
            type="submit"
            className="h-[46px] cursor-pointer rounded-cta border border-ink bg-ac text-[15px] font-bold text-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {gate === 'broken' ? t('reconnect') : t('connect')}
          </button>
        </form>
      ) : gate === 'not_configured' || gate === 'leader_only' ? (
        <div className="rounded-note border border-line bg-sbg px-[20px] py-[18px] text-[12.5px] leading-[1.6] text-body [text-wrap:pretty]">
          {t(`gate.${gate}`)}
        </div>
      ) : null}
      {status?.connected && leader ? (
        <form action={disconnectSlack} className="flex flex-col">
          <button
            type="submit"
            className="h-[46px] cursor-pointer rounded-cta border border-ink bg-transparent text-[15px] font-bold text-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {t('disconnect')}
          </button>
        </form>
      ) : null}
      {status?.connected && leader ? (
        <div className="text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">{t('connectedNote')}</div>
      ) : gate === 'can_connect' ? (
        <div className="text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">{t('connectNote')}</div>
      ) : null}
      {status?.last_event ? (
        <div className="text-[12px] leading-[1.5] text-mut">
          {t(`lastEvent.${status.last_event.event}`, { date: date(status.last_event.happened_at) })}
        </div>
      ) : null}
    </>
  )

  return (
    <main className="animate-entry mx-auto max-w-page px-[16px] pb-[60px] pt-[26px] md:px-[28px]">
      <ButtonLink href={{ pathname: '/oppsett', query: { fane: 'integrasjoner' } }} size="xxs" tone="ghost">
        {t('back')}
      </ButtonLink>

      <div className="mt-[16px] flex flex-wrap items-end justify-between gap-[20px]">
        <div className="min-w-0">
          <span className="flex flex-wrap items-center gap-[11px]">
            <h1 className="m-0 font-display text-[32px] font-semibold leading-[1.1]">{t('title')}</h1>
            <span
              className="rounded-pill px-[12px] py-[4px] text-[11.5px] font-bold"
              style={working ? { background: '#CFE7E4', color: '#20431C' } : { background: '#FBEBBE', color: '#5C4600' }}
            >
              {working ? t('statusOn') : gate === 'broken' ? t('statusBroken') : t('statusOff')}
            </span>
          </span>
          <p className="mt-[9px] max-w-[620px] text-[14.5px] leading-[1.6] text-mut [text-wrap:pretty]">{t('lead')}</p>
        </div>
      </div>

      <SlackSetup
        initial={settings}
        connected={working}
        canWrite={leader}
        labels={labels}
        cards={cards}
        side={side}
      />
    </main>
  )
}
