import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { RosterPerson } from '@/lib/settings/read'
import { getCurrentOrgId } from '@/lib/org/current'
import { entraClientId, getEntraStatus } from '@/lib/entra/read'
import { getTeamsSettings, teamsBotConfigured } from '@/lib/teams/read'

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
 * SMS is the exception since D-66: its row carries the design's button, "Sett opp" while
 * off and "Innstillinger" once connected, and it opens the real SMS screen.
 *
 * Microsoft Entra ID is the second exception since D-201: Microsoft sign-in and the tenant
 * binding are built, so the row says «Tilkoblet» when — and only when — the organisation has
 * bound a tenant, and carries the button to the Entra screen whenever there is an Entra
 * application to consent to (ENTRA_CLIENT_ID). Without one it says so and has no button.
 *
 * Microsoft Teams is the third since D-203: it says «Tilkoblet» only when the organisation has it
 * on, a tenant bound and this deployment's bot set up. Without a tenant it says the design's «Krever
 * Entra ID først» and carries the design's muted «Krever Entra» button, which opens the Teams screen
 * that says the same and where to go; without a bot it says so and has no button. The design's
 * «Svarprosenten er typisk 10–15 poeng høyere …» is not used: nothing backs it (X-056).
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
  smsOn,
}: {
  roster: RosterPerson[]
  withPhone: number
  mailOn: boolean
  /** whether this organisation has SMS on (0033) */
  smsOn: boolean
}) {
  const t = await getTranslations()
  // this tab reads the binding itself, so the Oppsett page and screen need no new prop
  const orgId = await getCurrentOrgId()
  const entra = orgId ? await getEntraStatus(orgId) : null
  const entraOn = entra?.bound ?? false
  const entraReady = entraOn || entraClientId() !== null
  const teams = await getTeamsSettings()
  const teamsBot = teamsBotConfigured()
  const teamsOn = (teams?.enabled ?? false) && entraOn && teamsBot

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
                        : (k === 'sms' && smsOn) || (k === 'entra' && entraOn) || (k === 'teams' && teamsOn)
                          ? { background: '#CFE7E4', color: '#20431C' }
                          : soon
                          ? { background: 'rgba(25,21,16,.05)', color: '#8A8272' }
                          : { background: '#FBEBBE', color: '#5C4600' }
                    }
                  >
                    {k === 'epost'
                      ? mailOn
                        ? t('oppsett.integrasjoner.statusAlways')
                        : t('oppsett.integrasjoner.statusMailOff')
                      : (k === 'sms' && smsOn) || (k === 'entra' && entraOn) || (k === 'teams' && teamsOn)
                        ? t('oppsett.integrasjoner.statusOn')
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
                      : k === 'entra'
                        ? entraOn
                          ? t('oppsett.integrasjoner.entra.needBound')
                          : entraReady
                            ? t('oppsett.integrasjoner.entra.need')
                            : t('oppsett.integrasjoner.entra.needOff')
                        : k === 'teams'
                          ? !entraOn
                            ? t('oppsett.integrasjoner.teams.need')
                            : !teamsBot
                              ? t('oppsett.integrasjoner.teams.needBot')
                              : teamsOn
                                ? t('oppsett.integrasjoner.teams.needOn')
                                : t('oppsett.integrasjoner.teams.needReady')
                          : t(`oppsett.integrasjoner.${k}.need`)}
                </span>
              </span>
              {k === 'entra' && entraReady ? (
                <Link
                  href="/integrasjoner/entra"
                  className={`inline-flex h-[38px] items-center justify-center rounded-ctl border border-ink px-[14px] text-[12.5px] font-bold text-ink no-underline hover:text-ink hover:no-underline ${
                    entraOn ? 'bg-transparent' : 'bg-ac'
                  }`}
                >
                  {entraOn ? t('oppsett.integrasjoner.btnSettings') : t('oppsett.integrasjoner.btnSetup')}
                </Link>
              ) : k === 'teams' && (!entraOn || teamsBot) ? (
                <Link
                  href="/integrasjoner/teams"
                  className={`inline-flex h-[38px] items-center justify-center rounded-ctl border px-[14px] text-[12.5px] font-bold no-underline hover:no-underline ${
                    !entraOn
                      ? 'border-line bg-transparent text-faint hover:text-faint'
                      : teamsOn
                        ? 'border-ink bg-transparent text-ink hover:text-ink'
                        : 'border-ink bg-ac text-ink hover:text-ink'
                  }`}
                >
                  {!entraOn
                    ? t('oppsett.integrasjoner.btnRequiresEntra')
                    : teamsOn
                      ? t('oppsett.integrasjoner.btnSettings')
                      : t('oppsett.integrasjoner.btnSetup')}
                </Link>
              ) : k === 'sms' ? (
                <Link
                  href="/integrasjoner/sms"
                  className={`inline-flex h-[38px] items-center justify-center rounded-ctl border border-ink px-[14px] text-[12.5px] font-bold text-ink no-underline hover:text-ink hover:no-underline ${
                    smsOn ? 'bg-transparent' : 'bg-ac'
                  }`}
                >
                  {smsOn ? t('oppsett.integrasjoner.btnSettings') : t('oppsett.integrasjoner.btnSetup')}
                </Link>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
