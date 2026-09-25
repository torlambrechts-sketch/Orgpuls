import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { CONTACT_MAIL } from '@/lib/marketing/site'
import { Tick } from './Tick'

/**
 * The three plans, as the start page draws them (Orgpuls_Start.dc.html, the price
 * section). Shared by the start page and /priser, so the two can never quote different
 * terms.
 */
const PLANS = [
  { key: 'small', accent: false, cta: 'registrer' },
  { key: 'usual', accent: true, cta: 'registrer' },
  { key: 'group', accent: false, cta: 'kontakt' },
] as const

export async function Plans() {
  const t = await getTranslations()
  return (
    <div className="mt-[22px] grid items-start gap-[13px] [grid-template-columns:repeat(auto-fit,minmax(min(272px,100%),1fr))]">
      {PLANS.map((p) => (
        <div
          key={p.key}
          className={`flex flex-col gap-[13px] rounded-[19px] p-[26px] ${
            p.accent ? 'border-2 border-ink bg-sbg' : 'border border-line bg-sf'
          }`}
        >
          <span className="flex flex-wrap items-center justify-between gap-[10px]">
            <span className="text-[16.5px] font-bold">{t(`start.plan.${p.key}.name`)}</span>
            {p.accent ? (
              <span className="rounded-pill bg-ac px-[11px] py-[4px] text-[11px] font-bold">{t('start.planRecommended')}</span>
            ) : null}
          </span>
          <span className="block text-[12.5px] text-mut">{t(`start.plan.${p.key}.who`)}</span>
          <span className="flex flex-wrap items-baseline gap-[7px]">
            <span className="font-display text-[38px] font-semibold leading-none">{t(`start.plan.${p.key}.price`)}</span>
            <span className="text-[13px] text-mut">{t(`start.plan.${p.key}.unit`)}</span>
          </span>
          <span className="mt-[4px] flex flex-col gap-[7px]">
            {['a', 'b', 'c', 'd'].map((i) => (
              <span key={i} className="flex items-start gap-[9px]">
                <Tick />
                <span className="text-[13px] leading-[1.5] [text-wrap:pretty]">{t(`start.plan.${p.key}.item.${i}`)}</span>
              </span>
            ))}
          </span>
          {p.cta === 'registrer' ? (
            <Link
              href="/registrer"
              className={`mt-[8px] inline-flex h-[44px] items-center justify-center rounded-cta border border-ink text-[14.5px] font-bold text-ink no-underline hover:text-ink hover:no-underline ${
                p.accent ? 'bg-ac' : 'bg-transparent'
              }`}
            >
              {t(`start.plan.${p.key}.cta`)}
            </Link>
          ) : (
            // "Snakk med oss" is a conversation, not a sign-in: an e-mail to the address
            // the product already gives for help (D-79)
            <a
              href={`mailto:${CONTACT_MAIL}?subject=${encodeURIComponent(t('seo.home.groupSubject'))}`}
              className="mt-[8px] inline-flex h-[44px] items-center justify-center rounded-cta border border-ink bg-transparent text-[14.5px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
            >
              {t(`start.plan.${p.key}.cta`)}
            </a>
          )}
        </div>
      ))}
    </div>
  )
}
