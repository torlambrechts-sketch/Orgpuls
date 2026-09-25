import type { Route } from 'next'
import Link from 'next/link'
import { getFormatter, getTranslations } from 'next-intl/server'
import { DPA_VERSION } from '@/lib/legal/dpa'
import type { DpaSignature } from '@/lib/legal/read'

/**
 * Personvern. Bundle lines 2303-2322.
 *
 * Eight cards of plain statement about what is processed and why. The design's threshold
 * warning — shown when the threshold is under five — is unreachable here and the card is
 * therefore absent: `app.k_min()` is a function returning 5 and the column refuses
 * anything below it, so there is no state in which the warning could be true. Rendering it
 * would be rendering a warning about a configuration the database will not accept. D-31.
 *
 * The design's three document buttons were omitted while nothing stood behind them (D-33).
 * The data processing agreement now exists, on its own tab (D-87), and this tab opens with
 * its status and a link there; the other two documents are still not drawn.
 */

const CARDS = ['basis', 'stored', 'special', 'retention', 'access', 'processor', 'dpia', 'protocol'] as const

export async function PersonvernTab({ threshold, signed }: { threshold: number; signed: DpaSignature[] }) {
  const t = await getTranslations()
  const format = await getFormatter()
  const current = signed.find((s) => s.version === DPA_VERSION) ?? null

  return (
    <>
      <div
        className={`mt-[20px] flex flex-wrap items-center justify-between gap-[12px] rounded-note border px-[22px] py-[16px] ${
          current ? 'border-line bg-sf' : 'border-ink bg-sbg'
        }`}
      >
        <span className="text-[13.5px] font-semibold">
          {current
            ? t('oppsett.dpa.status.signed', {
                name: current.signer_name,
                when: format.dateTime(new Date(current.signed_at), { dateStyle: 'long', timeZone: 'Europe/Oslo' }),
              })
            : t('oppsett.dpa.status.unsigned')}
        </span>
        <Link href={'/oppsett?fane=databehandleravtale' as Route} className="text-[13px] font-bold">
          {current ? t('oppsett.tab.databehandleravtale') : t('oppsett.dpa.status.open')}
        </Link>
      </div>
      <div className="mt-[14px] grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        {CARDS.map((k) => (
          <div key={k} className="rounded-note border border-line bg-sf px-[22px] py-[20px]">
            <div className="text-[14.5px] font-bold">{t(`oppsett.personvern.${k}.head`)}</div>
            <div className="mt-[6px] text-[13px] leading-[1.6] text-body [text-wrap:pretty]">
              {k === 'dpia' ? t('oppsett.personvern.dpia.body', { threshold }) : t(`oppsett.personvern.${k}.body`)}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
