import { getTranslations } from 'next-intl/server'
import type { RosterPerson } from '@/lib/settings/read'

/**
 * Integrasjoner, the Oppsett tab. Bundle lines 2323-2348.
 *
 * **E-post is the design's locked "Alltid på" row where it is true.** Since 0032 a
 * dispatcher sends the queue through Brevo (D-65), so for an organisation whose mail is
 * on, the row reads as the design wrote it, with the real sender address. For one whose
 * mail is switched off — the demo organisations, whose addresses are fictional — it says
 * "Slått av" and that nobody receives the notices: a row reading "Alltid på" over a queue
 * that is not being sent would be the most misleading sentence in the product. The other
 * rows still say "Ikke satt opp", because nothing else is connected (D-29).
 *
 * The "Sett opp" buttons are omitted for the same reason the design's own "Kommer" row has
 * none: there is nothing behind them. A button that opens nothing is a promise. D-33.
 *
 * The SMS row's "9 av 34 har mobilnummer" is counted from the register rather than
 * written, because it is the one number here that is real and it is the one that decides
 * whether SMS would be worth connecting.
 */

const ROWS = ['epost', 'entra', 'teams', 'sms', 'hr'] as const

export async function IntegrasjonerTab({
  roster,
  withPhone,
  mailOn,
}: {
  roster: RosterPerson[]
  withPhone: number
  mailOn: boolean
}) {
  const t = await getTranslations()

  return (
    <section className="mt-[20px] rounded-panel border border-line bg-sf px-[26px] py-[24px]">
      <h2 className="m-0 font-display text-[21px] font-semibold">
        {t('oppsett.integrasjoner.title')}
      </h2>
      <p className="mt-[6px] max-w-[640px] text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">
        {t('oppsett.integrasjoner.lead')}
      </p>

      <div className="mt-[18px] flex flex-col gap-[11px]">
        {ROWS.map((k) => {
          const soon = k === 'hr'
          return (
            <div
              key={k}
              className="grid items-start gap-[16px] rounded-opt border border-line bg-bg px-[19px] py-[17px] md:[grid-template-columns:minmax(0,1fr)_136px]"
            >
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-[9px]">
                  <span className="text-[15px] font-bold">
                    {t(`oppsett.integrasjoner.${k}.name`)}
                  </span>
                  <span
                    className="rounded-pill px-[10px] py-[3px] text-[11px] font-bold"
                    style={
                      k === 'epost' && mailOn
                        ? { background: 'rgba(25,21,16,.07)', color: '#5F5849' }
                        : soon
                          ? { background: 'rgba(25,21,16,.05)', color: '#8A8272' }
                          : { background: '#FBEBBE', color: '#5C4600' }
                    }
                  >
                    {k === 'epost'
                      ? mailOn
                        ? t('oppsett.integrasjoner.statusAlways')
                        : t('oppsett.integrasjoner.statusMailOff')
                      : soon
                        ? t('oppsett.integrasjoner.statusSoon')
                        : t('oppsett.integrasjoner.statusOff')}
                  </span>
                </span>
                <span className="mt-[7px] block text-[13px] leading-[1.55] text-body [text-wrap:pretty]">
                  {k === 'epost' && mailOn
                    ? t('oppsett.integrasjoner.epost.whatOn')
                    : t(`oppsett.integrasjoner.${k}.what`)}
                </span>
                <span className="mt-[6px] block text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
                  {k === 'sms'
                    ? t('oppsett.integrasjoner.sms.need', {
                        withPhone,
                        total: roster.length,
                      })
                    : k === 'epost'
                      ? mailOn
                        ? t('oppsett.integrasjoner.epost.needOn')
                        : t('oppsett.integrasjoner.epost.needOff')
                      : t(`oppsett.integrasjoner.${k}.need`)}
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
