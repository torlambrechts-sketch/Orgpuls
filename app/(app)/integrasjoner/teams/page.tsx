import { notFound } from 'next/navigation'
import { getFormatter, getTranslations } from 'next-intl/server'
import { TeamsSetup, type TeamsSetupLabels } from '@/components/integrasjoner/TeamsSetup'
import { ButtonLink } from '@/components/ui/Button'
import { getEntraStatus } from '@/lib/entra/read'
import { getOrganization, getViewerRole } from '@/lib/org/read'
import { getTeamsSettings, getTeamsStatus, teamsBotConfigured } from '@/lib/teams/read'

/**
 * Integrasjoner › Teams (0176, D-203). The design has a Teams row (bundle 3649-3651) and a
 * channel in the year wheel's picker (4008-4024), and no screen of its own; this one is built
 * as the SMS screen is (D-66), from the same sections and controls.
 *
 * It shows what is true, in the order it has to become true: the organisation's Microsoft 365
 * bound (else «Koble til Microsoft 365 først»), this deployment's bot set up (else it says so),
 * and then the switch, the rule, the app package for the customer's Teams administrator and the
 * real counts — how many carry a Microsoft account, how many have the app, how many Teams turned
 * away. The design's «Svarprosenten er typisk 10–15 poeng høyere …» is not used: nothing backs
 * it (X-056).
 */
export const dynamic = 'force-dynamic'

export default async function TeamsPage() {
  const t = await getTranslations()
  const format = await getFormatter()
  const [org, role, settings] = await Promise.all([getOrganization(), getViewerRole(), getTeamsSettings()])
  if (!org || !settings) notFound()
  const [entra, status] = await Promise.all([getEntraStatus(org.id), getTeamsStatus(org.id)])
  const bound = entra?.bound ?? false
  const bot = teamsBotConfigured()
  const k = (key: string, values?: Record<string, string | number>) => t(`teamsSetup.${key}`, values)

  const labels: TeamsSetupLabels = {
    step1: k('step1'),
    reachLine: status ? k('reachLine', { withObject: status.with_object_id, total: status.active }) : null,
    reachNote: k('reachNote'),
    appLine: status ? k('appLine', { count: status.with_conversation }) : null,
    appNote: k('appNote'),
    problems: status
      ? status.blocked + status.unreachable === 0
        ? [k('problemsNone')]
        : [
            ...(status.blocked ? [k('blocked', { count: status.blocked })] : []),
            ...(status.unreachable ? [k('unreachable', { count: status.unreachable })] : []),
            ...(status.last_problem_day
              ? [k('problemsLast', { date: format.dateTime(new Date(status.last_problem_day), { dateStyle: 'long', timeZone: 'Europe/Oslo' }) })]
              : []),
          ]
      : null,
    sent: status ? k('sent30', { count: status.sent_30d }) : null,
    step2: k('step2'),
    modes: Object.fromEntries(
      (['mangler', 'paaminn', 'alle'] as const).map((w) => [w, { label: k(`mode.${w}`), note: k(`modeNote.${w}`) }]),
    ) as TeamsSetupLabels['modes'],
    step3: k('step3'),
    installLead: k('installLead'),
    install: (['s1', 's2', 's3', 's4'] as const).map((s) => k(`install.${s}`)),
    download: k('download'),
    preview: k('preview'),
    previewSender: k('previewSender'),
    previewText: t('mail.sms.default', { org: org.name }),
    previewButton: t('mail.invitasjon.cta'),
    previewNote: k('previewNote'),
    legal: k('legal'),
    activate: k('activate'),
    deactivate: k('deactivate'),
    toggleNote: k('toggleNote'),
    readOnly: k('readOnly'),
    saving: k('saving'),
    problemTexts: Object.fromEntries(['invalid', 'denied', 'noOrg', 'notReady'].map((p) => [p, k(`problem.${p}`)])),
  }

  const on = settings.enabled && bound && bot

  return (
    <main className="animate-entry mx-auto max-w-page px-[16px] pb-[60px] pt-[26px] md:px-[28px]">
      <ButtonLink href={{ pathname: '/oppsett', query: { fane: 'integrasjoner' } }} size="xxs" tone="ghost">
        {k('back')}
      </ButtonLink>

      <div className="mt-[16px] flex flex-wrap items-end justify-between gap-[20px]">
        <div className="min-w-0">
          <span className="flex flex-wrap items-center gap-[11px]">
            <h1 className="m-0 font-display text-[32px] font-semibold leading-[1.1]">{k('title')}</h1>
            <span
              className="rounded-pill px-[12px] py-[4px] text-[11.5px] font-bold"
              style={on ? { background: '#CFE7E4', color: '#20431C' } : { background: '#FBEBBE', color: '#5C4600' }}
            >
              {on ? k('statusOn') : k('statusOff')}
            </span>
          </span>
          <p className="mt-[9px] max-w-[620px] text-[14.5px] leading-[1.6] text-mut [text-wrap:pretty]">{k('lead')}</p>
        </div>
      </div>

      {!bound ? (
        <section className="mt-[24px] max-w-[720px] rounded-panel border border-orange bg-peach px-[24px] py-[20px]">
          <h2 className="m-0 text-[15px] font-bold text-rustdeep">{k('needTenant.title')}</h2>
          <p className="mb-0 mt-[6px] text-[13.5px] leading-[1.6] text-rustdeep [text-wrap:pretty]">{k('needTenant.body')}</p>
          <ButtonLink href="/integrasjoner/entra" size="xxs" tone="primary" className="mt-[14px]">
            {k('needTenant.cta')}
          </ButtonLink>
        </section>
      ) : !bot ? (
        <section className="mt-[24px] max-w-[720px] rounded-panel border border-orange bg-peach px-[24px] py-[20px]">
          <h2 className="m-0 text-[15px] font-bold text-rustdeep">{k('needBot.title')}</h2>
          <p className="mb-0 mt-[6px] text-[13.5px] leading-[1.6] text-rustdeep [text-wrap:pretty]">{k('needBot.body')}</p>
        </section>
      ) : (
        <TeamsSetup initial={settings} canWrite={role === 'daglig_leder'} labels={labels} />
      )}
    </main>
  )
}
