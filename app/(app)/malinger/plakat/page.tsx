import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { outboundBase } from '@/lib/hosts'
import { PrintButton } from '@/components/rapport/PrintButton'
import { ButtonLink } from '@/components/ui/Button'
import { qrPath } from '@/lib/entry/qr'
import { getCurrentOrgId } from '@/lib/org/current'
import { getOrganization } from '@/lib/org/read'
import { getOrgLogo, logoPath } from '@/lib/org/logo'
import { getEntryCode } from '@/lib/settings/survey'

/**
 * The QR poster (0076, D-126), printed from Målinger › Innstillinger and put up where people
 * who do not read e-mail at work will see it. The code opens /inn/<code> on the production host, where
 * a person asks for their own link; the poster itself carries nothing that answers anything.
 *
 * The design has no poster. It is set in the product's own type and tokens, and prints on
 * whatever paper the printer has: the shell drops away in print (ShellFrame, globals.css)
 * and so do this page's controls.
 */
export const dynamic = 'force-dynamic'

export default async function PosterPage() {
  const t = await getTranslations('malinger.plakat')
  const org = await getCurrentOrgId()
  const [organization, code, logo] = await Promise.all([getOrganization(), org ? getEntryCode(org) : Promise.resolve(null), getOrgLogo()])

  const back = (
    <ButtonLink href={{ pathname: '/malinger', query: { fane: 'innstillinger' } }} size="xxs" tone="ghost">
      {t('back')}
    </ButtonLink>
  )

  if (!code || !organization) {
    return (
      <main className="mx-auto max-w-page px-[28px] pb-[60px] pt-[30px] max-sm:px-[16px]">
        {back}
        <h1 className="m-0 mt-[16px] font-display text-[30px] font-semibold leading-[1.1]">{t('noneTitle')}</h1>
        <p className="mt-[8px] max-w-[560px] text-[14px] leading-[1.6] text-mut [text-wrap:pretty]">{t('noneLead')}</p>
      </main>
    )
  }

  // a printed poster must work for whoever scans it: the production address, never a preview's
  // or a proxy's host (lib/hosts.ts outboundBase); a local run prints its own
  const h = await headers()
  const base = outboundBase(h.get('x-forwarded-host') ?? h.get('host'), h.get('x-forwarded-proto'))
  const url = `${base}/inn/${code}`
  const shown = `${base.replace(/^https?:\/\//, '').replace(/^www\./, '')}/inn/${code}`
  const qr = qrPath(url)

  return (
    <main className="mx-auto max-w-page px-[28px] pb-[60px] pt-[30px] max-sm:px-[16px] print:max-w-none print:p-0">
      <div className="report-chrome">
        {back}
        <div className="mt-[16px] flex flex-wrap items-end justify-between gap-[20px]">
          <div className="min-w-0">
            <h1 className="m-0 font-display text-[30px] font-semibold leading-[1.1]">{t('title')}</h1>
            <p className="mt-[8px] max-w-[560px] text-[14px] leading-[1.6] text-mut [text-wrap:pretty]">{t('lead')}</p>
          </div>
          <PrintButton label={t('print')} />
        </div>
      </div>

      <article
        aria-label={t('sheetAria')}
        className="mx-auto mt-[24px] max-w-[640px] rounded-panel border border-line bg-sf px-[44px] py-[48px] text-center max-sm:px-[22px] max-sm:py-[30px] print:mt-0 print:max-w-none print:rounded-none print:border-0 print:bg-transparent print:px-0 print:py-0"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the organisation's logo (0104, D-154), same-origin; its name follows */}
        {logo ? <img src={logoPath(logo.key)} alt="" className="mx-auto mb-[14px] block h-[48px] w-auto max-w-[200px] object-contain" /> : null}
        <span className="block text-[13px] font-bold uppercase tracking-[.1em] text-mut">{organization.name}</span>
        <h2 className="m-0 mt-[12px] font-display text-[40px] font-semibold leading-[1.1] [text-wrap:balance] max-sm:text-[30px]">
          {t('heading')}
        </h2>
        <p className="mx-auto mt-[12px] max-w-[460px] text-[16px] leading-[1.55] text-body [text-wrap:pretty]">
          {t('sub', { org: organization.name })}
        </p>

        <svg
          viewBox={`0 0 ${qr.size} ${qr.size}`}
          role="img"
          aria-label={t('qrAria', { url: shown })}
          shapeRendering="crispEdges"
          className="mx-auto mt-[26px] block h-auto w-[300px] max-w-full text-ink"
        >
          <path d={qr.d} fill="currentColor" />
        </svg>
        <p className="mt-[12px] text-[14px] text-mut">
          {t('orGo')} <span className="font-bold text-ink">{shown}</span>
        </p>

        <ol className="mx-auto mt-[26px] flex max-w-[460px] list-none flex-col gap-[12px] p-0 text-left">
          {(['step1', 'step2', 'step3'] as const).map((s, i) => (
            <li key={s} className="flex items-start gap-[12px] text-[15px] leading-[1.5]">
              <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-pill bg-ac text-[13px] font-bold text-ink">
                {i + 1}
              </span>
              <span className="[text-wrap:pretty]">{t(s)}</span>
            </li>
          ))}
        </ol>

        <p className="mx-auto mt-[26px] max-w-[460px] border-t border-line pt-[16px] text-[13px] leading-[1.55] text-mut [text-wrap:pretty]">
          {t('anonymous', { k: organization.threshold })}
        </p>
      </article>
    </main>
  )
}
