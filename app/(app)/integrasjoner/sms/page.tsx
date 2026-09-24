import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { SmsSetup, type SmsSetupLabels } from '@/components/integrasjoner/SmsSetup'
import { ButtonLink } from '@/components/ui/Button'
import { getOrganization, getViewerRole } from '@/lib/org/read'
import { getSmsReach, getSmsSettings } from '@/lib/settings/read'

/**
 * Integrasjoner › SMS — the design's connection screen, `isSms` branch. D-66.
 *
 * Everything on it is real: the numbers are counted from the register, the modes are what
 * the dispatcher's claim decides from (0033), the preview is the exact text with a link of
 * the real length, and the button turns the channel on for this organisation. The sender
 * is the product's registered name; see SmsSetup for the three places this differs from
 * the design and why.
 */
export const dynamic = 'force-dynamic'

// a sample of the real link's shape: /s/ and 64 hex characters, which is what an SMS carries
const SAMPLE_TOKEN = '7f3a9c1e4b8d2f60a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1'

export default async function SmsPage() {
  const t = await getTranslations()
  const [org, role, settings, reach, h] = await Promise.all([
    getOrganization(),
    getViewerRole(),
    getSmsSettings(),
    getSmsReach(),
    headers(),
  ])
  if (!org || !settings) notFound()

  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'www.orgpuls.com'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const sampleLink = `${proto}://${host}/s/${SAMPLE_TOKEN}`

  const labels: SmsSetupLabels = {
    step1: t('smsSetup.step1'),
    mobileLine: t('smsSetup.mobileLine', { withPhone: reach.withPhone, total: reach.total }),
    mobileNote: t('smsSetup.mobileNote'),
    step2: t('smsSetup.step2'),
    sender: t('smsSetup.sender'),
    senderFixed: t('smsSetup.senderFixed'),
    senderNote: t('smsSetup.senderNote'),
    text: t('smsSetup.text'),
    counterOne: t('smsSetup.counterOne'),
    counterMany: t('smsSetup.counterMany'),
    linkNote: t('smsSetup.linkNote'),
    step3: t('smsSetup.step3'),
    modes: {
      mangler: { label: t('smsSetup.mode.mangler'), note: t('smsSetup.modeNote.mangler', { count: reach.phoneNoEmail }) },
      paaminn: { label: t('smsSetup.mode.paaminn'), note: t('smsSetup.modeNote.paaminn') },
      alle: { label: t('smsSetup.mode.alle'), note: t('smsSetup.modeNote.alle') },
    },
    cost: {
      mangler: t('smsSetup.cost.exact'),
      paaminn: t('smsSetup.cost.atMost'),
      alle: t('smsSetup.cost.exact'),
    },
    costUnits: t('smsSetup.costUnits'),
    preview: t('smsSetup.preview'),
    now: t('smsSetup.now'),
    legal: t('smsSetup.legal'),
    activate: t('smsSetup.activate'),
    deactivate: t('smsSetup.deactivate'),
    toggleNote: t('smsSetup.toggleNote'),
    creditsNote: t('smsSetup.creditsNote'),
    readOnly: t('smsSetup.readOnly'),
    saving: t('smsSetup.saving'),
    problems: Object.fromEntries(['invalid', 'denied', 'noOrg'].map((k) => [k, t(`smsSetup.problem.${k}`)])),
  }

  return (
    <main className="animate-entry mx-auto max-w-[1180px] px-[16px] pb-[60px] pt-[26px] md:px-[28px]">
      <ButtonLink href={{ pathname: '/oppsett', query: { fane: 'integrasjoner' } }} size="xxs" tone="ghost">
        {t('smsSetup.back')}
      </ButtonLink>

      <div className="mt-[16px] flex flex-wrap items-end justify-between gap-[20px]">
        <div className="min-w-0">
          <span className="flex flex-wrap items-center gap-[11px]">
            <h1 className="m-0 font-display text-[32px] font-semibold leading-[1.1]">{t('smsSetup.title')}</h1>
            <span
              className="rounded-pill px-[12px] py-[4px] text-[11.5px] font-bold"
              style={settings.enabled ? { background: '#CFE7E4', color: '#20431C' } : { background: '#FBEBBE', color: '#5C4600' }}
            >
              {settings.enabled ? t('smsSetup.statusOn') : t('smsSetup.statusOff')}
            </span>
          </span>
          <p className="mt-[9px] max-w-[620px] text-[14.5px] leading-[1.6] text-mut [text-wrap:pretty]">
            {t('smsSetup.lead')}
          </p>
        </div>
      </div>

      <SmsSetup
        initial={settings}
        defaultText={t('mail.sms.default', { org: org.name })}
        sender="Orgpuls"
        sampleLink={sampleLink}
        reach={reach}
        canWrite={role === 'daglig_leder'}
        labels={labels}
      />
    </main>
  )
}
