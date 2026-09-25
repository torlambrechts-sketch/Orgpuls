import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { PricingSeen } from './PricingSeen'
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
    // 3 x 4 columns; on a phone the recommended plan comes first (docs/landingsside-gjennomgang.md 4.2)
    <div className="mt-8 grid items-start gap-6 md:grid-cols-3">
      <PricingSeen />
      {PLANS.map((p) => (
        <div
          key={p.key}
          className={`flex flex-col gap-3 rounded-card p-6 lg:p-8 ${
            p.accent ? 'max-md:order-first border-2 border-ink bg-sbg' : 'border border-line bg-bg'
          }`}
        >
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-mk-h3 font-bold">{t(`start.plan.${p.key}.name`)}</span>
            {p.accent ? (
              <span className="rounded-pill bg-ac px-3 py-1 text-mk-small font-bold">{t('start.planRecommended')}</span>
            ) : null}
          </span>
          <span className="block text-mk-small text-mut">{t(`start.plan.${p.key}.who`)}</span>
          <span className="flex flex-wrap items-baseline gap-2">
            <span className="font-display text-mk-h2 font-semibold leading-none">{t(`start.plan.${p.key}.price`)}</span>
            <span className="text-mk-small text-mut">{t(`start.plan.${p.key}.unit`)}</span>
          </span>
          <span className="mt-1 flex flex-col gap-2">
            {['a', 'b', 'c', 'd'].map((i) => (
              <span key={i} className="flex items-start gap-2">
                <Tick />
                <span className="text-mk-card [text-wrap:pretty]">{t(`start.plan.${p.key}.item.${i}`)}</span>
              </span>
            ))}
          </span>
          {p.cta === 'registrer' ? (
            <Link
              href="/registrer"
              className={`mt-2 inline-flex h-12 items-center justify-center rounded-cta border border-ink text-mk-card font-bold text-ink no-underline hover:text-ink hover:no-underline ${
                p.accent ? 'bg-ac' : 'bg-transparent'
              }`}
            >
              {t(`start.plan.${p.key}.cta`)}
            </Link>
          ) : (
            // "Snakk med oss" is a conversation, not a sign-in: the contact page (D-79, D-85)
            <Link
              href="/kontakt"
              className="mt-2 inline-flex h-12 items-center justify-center rounded-cta border border-ink bg-transparent text-mk-card font-bold text-ink no-underline hover:text-ink hover:no-underline"
            >
              {t(`start.plan.${p.key}.cta`)}
            </Link>
          )}
        </div>
      ))}
    </div>
  )
}
