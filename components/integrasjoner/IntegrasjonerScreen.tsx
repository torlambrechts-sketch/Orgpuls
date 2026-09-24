import { getTranslations } from 'next-intl/server'
import { ButtonLink } from '@/components/ui/Button'

/**
 * Integrasjoner. Bundle lines 1143-1284.
 *
 * **The design's screen is a connection wizard, and this is not one.** Its four cards ask
 * for a tenant ID, tick the Entra groups to sync, choose a sync cadence, write an SMS
 * sender name and a message body, and end in a "Koble til" button. None of that is built:
 * there is no Entra client and no SMS gateway. E-mail is the exception since 0032 — it is
 * connected for the whole product, through Brevo, and needs nothing set up (D-65). A wizard
 * whose every field discards what you type and whose final button connects nothing is not
 * an unfinished feature, it is a false statement about the product, and four screens of it
 * is the most elaborate false statement in the bundle.
 *
 * So the screen keeps the design's *content* and drops its controls. For each channel it
 * prints what connecting will require, in the order the wizard would ask for it, which is
 * genuinely what a leader deciding whether to set this up needs to read. D-35.
 *
 * One number here is real and is therefore computed rather than described: how many of the
 * register carry a mobile number. It is the thing that decides whether SMS is worth
 * connecting at all, and it is counted with `head: true` so the numbers themselves never
 * leave the database.
 */
export interface IntegrasjonerView {
  withPhone: number
  total: number
  /** the outbox's own counts: waiting, accepted by the provider, given up on */
  queue: { pending: number; sent: number; failed: number }
  /** whether the dispatcher sends this organisation's notices (0032) */
  mailOn: boolean
  /** whether this organisation has SMS on (0033) */
  smsOn: boolean
}

const CHANNELS = [
  { key: 'epost', steps: [] },
  { key: 'entra', steps: ['tenant', 'permissions', 'groups', 'sync'] },
  { key: 'teams', steps: ['entraFirst', 'message'] },
  { key: 'sms', steps: [] },
  { key: 'hr', steps: ['vendor', 'fields'] },
] as const

export async function IntegrasjonerScreen({ view }: { view: IntegrasjonerView }) {
  const t = await getTranslations()

  const pct = view.total === 0 ? 0 : Math.round((view.withPhone / view.total) * 100)

  return (
    <main className="animate-entry mx-auto max-w-page px-[16px] md:px-[28px] pb-[60px] pt-[26px]">
      <ButtonLink href="/oppsett" size="xxs" tone="ghost">
        {t('integrasjoner.back')}
      </ButtonLink>

      <div className="mt-[16px] flex flex-wrap items-end justify-between gap-[20px]">
        <div className="min-w-0">
          <span className="flex flex-wrap items-center gap-[11px]">
            <h1 className="m-0 font-display text-[32px] font-semibold leading-[1.1]">
              {t('integrasjoner.title')}
            </h1>
            <span
              className="rounded-pill px-[12px] py-[4px] text-[11.5px] font-bold"
              style={view.mailOn ? { background: '#CFE7E4', color: '#20431C' } : { background: '#FBEBBE', color: '#5C4600' }}
            >
              {view.mailOn ? t('integrasjoner.statusMail') : t('integrasjoner.statusMailOff')}
            </span>
          </span>
          <p className="mt-[9px] max-w-[620px] text-[14.5px] leading-[1.6] text-mut [text-wrap:pretty]">
            {t('integrasjoner.lead')}
          </p>
        </div>
      </div>

      {/*
        The queue is stated as numbers rather than as a status: a leader who reads how many
        went out and how many could not be sent knows more than one who reads "connected".
        Where the organisation's mail is switched off, the same box says so, in the warning
        colours, because then the queue is the whole story.
      */}
      {view.mailOn ? (
        <div className="mt-[20px] rounded-panel border border-line bg-mint px-[24px] py-[18px]">
          <div className="text-[13.5px] leading-[1.6] text-greendeep [text-wrap:pretty]">
            {t('integrasjoner.queueOn', view.queue)}
          </div>
        </div>
      ) : (
        <div className="mt-[20px] rounded-panel border border-orange bg-peach px-[24px] py-[18px]">
          <div className="text-[13.5px] leading-[1.6] text-rustdeep [text-wrap:pretty]">
            {t('integrasjoner.queueOff', { count: view.queue.pending })}
          </div>
        </div>
      )}

      <div className="mt-[20px] flex flex-col gap-[14px]">
        {CHANNELS.map((c) => (
          <section
            key={c.key}
            className="rounded-panel border border-line bg-sf px-[24px] py-[22px]"
          >
            <div className="flex flex-wrap items-center gap-[9px]">
              <h2 className="m-0 font-display text-[21px] font-semibold">
                {t(`oppsett.integrasjoner.${c.key}.name`)}
              </h2>
              <span
                className="rounded-pill px-[10px] py-[3px] text-[11px] font-bold"
                style={
                  c.key === 'epost' && view.mailOn
                    ? { background: 'rgba(25,21,16,.07)', color: '#5F5849' }
                    : c.key === 'sms' && view.smsOn
                      ? { background: '#CFE7E4', color: '#20431C' }
                      : c.key === 'hr'
                      ? { background: 'rgba(25,21,16,.05)', color: '#8A8272' }
                      : { background: '#FBEBBE', color: '#5C4600' }
                }
              >
                {c.key === 'epost'
                  ? view.mailOn
                    ? t('oppsett.integrasjoner.statusAlways')
                    : t('oppsett.integrasjoner.statusMailOff')
                  : c.key === 'sms' && view.smsOn
                    ? t('oppsett.integrasjoner.statusOn')
                    : c.key === 'hr'
                      ? t('oppsett.integrasjoner.statusSoon')
                      : t('oppsett.integrasjoner.statusOff')}
              </span>
            </div>

            <p className="mt-[7px] max-w-[640px] text-[13.5px] leading-[1.6] text-body [text-wrap:pretty]">
              {c.key === 'epost' && view.mailOn
                ? t('oppsett.integrasjoner.epost.whatOn')
                : t(`oppsett.integrasjoner.${c.key}.what`)}
            </p>

            {c.key === 'sms' ? (
              <div className="mt-[16px] rounded-tile border border-line bg-bg px-[16px] py-[14px]">
                <div className="flex flex-wrap items-baseline justify-between gap-[12px]">
                  <span className="text-[15px] font-bold">
                    {t('integrasjoner.mobileLine', {
                      withPhone: view.withPhone,
                      total: view.total,
                    })}
                  </span>
                  <span className="text-[12.5px] text-mut">{pct} %</span>
                </div>
                <span className="mt-[9px] block h-[8px] overflow-hidden rounded-pill bg-ink/[0.08]">
                  <span
                    className="block h-full rounded-pill bg-amberbar"
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <div className="mt-[11px] max-w-[580px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">
                  {t('integrasjoner.mobileNote')}
                </div>
              </div>
            ) : null}

            {c.key === 'sms' ? (
              <ButtonLink
                href="/integrasjoner/sms"
                size="xxs"
                tone={view.smsOn ? 'secondary' : 'primary'}
                className="mt-[16px]"
              >
                {view.smsOn ? t('oppsett.integrasjoner.btnSettings') : t('integrasjoner.smsSetup')}
              </ButtonLink>
            ) : null}

            {/* e-mail is connected for the whole product: its only state is on or off */}
            {c.key === 'sms' ? null : c.key === 'epost' ? (
              <p className="mt-[10px] max-w-[640px] text-[13px] leading-[1.55] text-mut [text-wrap:pretty]">
                {view.mailOn ? t('integrasjoner.mailReady') : t('oppsett.integrasjoner.epost.needOff')}
              </p>
            ) : (
            <div className="mt-[16px]">
              <div className="text-[11px] uppercase tracking-[0.11em] text-mut">
                {t('integrasjoner.needsHead')}
              </div>
              <ol className="m-0 mt-[12px] flex list-none flex-col gap-[8px] p-0">
                {c.steps.map((s, i) => (
                  <li
                    key={s}
                    className="grid items-start gap-[13px] rounded-cta border border-line bg-bg px-[14px] py-[12px] [grid-template-columns:24px_minmax(0,1fr)]"
                  >
                    <span className="flex h-[24px] w-[24px] flex-none items-center justify-center rounded-pill bg-ink text-[12px] font-bold text-bg">
                      {i + 1}
                    </span>
                    <span className="min-w-0 text-[13px] leading-[1.55] [text-wrap:pretty]">
                      {t(`integrasjoner.step.${c.key}.${s}`)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            )}
          </section>
        ))}
      </div>

      <p className="mt-[20px] max-w-[680px] text-[12.5px] leading-[1.6] text-mut [text-wrap:pretty]">
        {t('integrasjoner.privacyNote')}
      </p>
    </main>
  )
}
