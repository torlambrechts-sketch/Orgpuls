import { notFound } from 'next/navigation'
import { getFormatter, getTranslations } from 'next-intl/server'
import { ButtonLink } from '@/components/ui/Button'
import { getCurrentOrgId } from '@/lib/org/current'
import { entraClientId, getEntraStatus } from '@/lib/entra/read'
import { bindProblemFrom, entraGate } from '@/lib/entra/schema'
import { startEntraBinding, unbindEntra } from './actions'

/**
 * Integrasjoner › Microsoft Entra ID — the design's connection screen, `isEntra` branch
 * (Orgpuls_v3.dc.html lines 1803-1874, data 4558-4640). D-201.
 *
 * **What is built is the first half of the design's wizard.** Card 1 («Katalogen deres») and
 * card 2 («Hva vi ber om») are real: the tenant is the one the leader is signed in from — read
 * from their Microsoft identity, never typed, because a typed tenant is exactly what must not
 * be authorised on — and the permissions are the ones the consent covers. «Godkjenn og koble
 * til» sends a daglig leder, signed in with Microsoft, to Microsoft's admin consent; the binding
 * is made by the database when the answer comes back (0155).
 *
 * Cards 3 and 4 (groups, synchronisation) are the import, which is the next step and not built:
 * they keep the design's frame and say so in words, with none of the design's controls, so
 * nothing here can look as if it synchronised anything. No count is shown, and «Tilkoblet»
 * only when the binding row exists.
 *
 * Without ENTRA_CLIENT_ID in the environment there is no application to consent to: the screen
 * says the connection is not set up yet and offers no button.
 */
export const dynamic = 'force-dynamic'

const PERMS = ['signin', 'profile', 'never'] as const

export default async function EntraPage({
  searchParams,
}: {
  searchParams: Promise<{ feil?: string; koblet?: string; frakoblet?: string }>
}) {
  const t = await getTranslations('integrasjoner.entraSetup')
  const tn = await getTranslations()
  const format = await getFormatter()
  const params = await searchParams
  const orgId = await getCurrentOrgId()
  if (!orgId) notFound()
  const status = await getEntraStatus(orgId)
  const gate = entraGate(status, entraClientId())
  const problem = bindProblemFrom(params.feil)
  const date = (iso: string | null | undefined) => (iso ? format.dateTime(new Date(iso), { dateStyle: 'long' }) : '')

  const tenant = status?.tenant_id ?? status?.own_tenant ?? ''
  const card = 'rounded-panel border border-line bg-sf px-[24px] py-[22px]'
  const head = 'text-[11px] uppercase tracking-[0.11em] text-mut'

  return (
    <main className="animate-entry mx-auto max-w-page px-[16px] pb-[60px] pt-[26px] md:px-[28px]">
      <ButtonLink href={{ pathname: '/oppsett', query: { fane: 'integrasjoner' } }} size="xxs" tone="ghost">
        {t('back')}
      </ButtonLink>

      <div className="mt-[16px] flex flex-wrap items-end justify-between gap-[20px]">
        <div className="min-w-0">
          <span className="flex flex-wrap items-center gap-[11px]">
            <h1 className="m-0 font-display text-[32px] font-semibold leading-[1.1]">
              {tn('oppsett.integrasjoner.entra.name')}
            </h1>
            <span
              className="rounded-pill px-[12px] py-[4px] text-[11.5px] font-bold"
              style={status?.bound ? { background: '#CFE7E4', color: '#20431C' } : { background: '#FBEBBE', color: '#5C4600' }}
            >
              {status?.bound ? t('statusOn') : t('statusOff')}
            </span>
          </span>
          <p className="mt-[9px] max-w-[620px] text-[14.5px] leading-[1.6] text-mut [text-wrap:pretty]">{t('lead')}</p>
        </div>
      </div>

      <div className="mt-[24px] grid items-start gap-[20px] md:[grid-template-columns:minmax(0,1.55fr)_minmax(280px,.9fr)]">
        <div className="flex min-w-0 flex-col gap-[14px]">
          {/* 1 · Katalogen deres */}
          <section className={card}>
            <div className={head}>{t('step1')}</div>
            <label className="mt-[13px] block max-w-[360px]">
              <span className="mb-[6px] block text-[12.5px] text-mut">{t('tenantLabel')}</span>
              <input
                value={tenant}
                readOnly
                placeholder={t('tenantPlaceholder')}
                aria-describedby="entra-tenant-note"
                className="box-border h-[42px] w-full rounded-btn border border-line bg-bg px-[14px] text-[14px] text-ink outline-none"
              />
            </label>
            <div id="entra-tenant-note" className="mt-[9px] max-w-[560px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
              {status?.bound
                ? t('tenantBound', { date: date(status.bound_at) })
                : status?.own_tenant
                  ? t('tenantOwn')
                  : t('tenantNone')}
            </div>
          </section>

          {/* 2 · Hva vi ber om */}
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

          {/* 3 · Hvilke grupper skal med — 4 · Synkronisering: the import, not built */}
          {(['step3', 'step4'] as const).map((k) => (
            <section key={k} className={card}>
              <div className="flex flex-wrap items-center gap-[9px]">
                <span className={head}>{t(k)}</span>
                <span className="rounded-pill px-[10px] py-[3px] text-[11px] font-bold" style={{ background: 'rgba(25,21,16,.05)', color: '#8A8272' }}>
                  {tn('oppsett.integrasjoner.statusSoon')}
                </span>
              </div>
              <div className="mt-[10px] max-w-[580px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">{t(`${k}Later`)}</div>
            </section>
          ))}
        </div>

        <div className="flex min-w-0 flex-col gap-[14px] md:sticky md:top-[78px]">
          {params.koblet === '1' && status?.bound ? (
            <div role="status" className="rounded-note bg-mint px-[20px] py-[16px] text-[13px] leading-[1.55] text-greendeep [text-wrap:pretty]">
              {t('done')}
            </div>
          ) : null}
          {params.frakoblet === '1' && !status?.bound ? (
            <div role="status" className="rounded-note border border-line bg-sf px-[20px] py-[16px] text-[13px] leading-[1.55] [text-wrap:pretty]">
              {t('undone')}
            </div>
          ) : null}
          {problem ? (
            <p role="alert" className="m-0 text-[12.5px] leading-[1.5] text-danger [text-wrap:pretty]">
              {t(`problem.${problem}`)}
            </p>
          ) : null}

          {gate === 'can_bind' ? (
            <form action={startEntraBinding} className="flex flex-col">
              <button type="submit" className="h-[46px] cursor-pointer rounded-cta border border-ink bg-ac text-[15px] font-bold text-ink">
                {t('connect')}
              </button>
            </form>
          ) : gate === 'bound' && status?.daglig_leder ? (
            <form action={unbindEntra} className="flex flex-col">
              <button type="submit" className="h-[46px] cursor-pointer rounded-cta border border-ink bg-transparent text-[15px] font-bold text-ink">
                {t('disconnect')}
              </button>
            </form>
          ) : gate !== 'bound' ? (
            <div className="rounded-note border border-line bg-sbg px-[20px] py-[18px] text-[12.5px] leading-[1.6] text-body [text-wrap:pretty]">
              {t(`gate.${gate}`)}
            </div>
          ) : null}

          <div className="text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">
            {status?.bound ? t('boundNote') : t('toggleNote')} {t('mfaNote')}
          </div>
          {status?.last_event ? (
            <div className="text-[12px] leading-[1.5] text-mut">
              {t(`lastEvent.${status.last_event.event}`, { date: date(status.last_event.happened_at) })}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  )
}
