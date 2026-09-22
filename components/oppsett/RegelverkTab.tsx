import { getTranslations } from 'next-intl/server'
import { ButtonLink } from '@/components/ui/Button'

/**
 * Regelverk. Bundle lines 2435-2472.
 *
 * The tab exists only in law mode, which is the design's own rule. Two blocks: the
 * provisions this product answers to, and the factors the regulation's chapter 1A names
 * against where each one is actually asked.
 *
 * **The coverage list is checked against the seeded instrument, not written by hand.** A
 * factor key that stopped being seeded would otherwise keep a ✓ here for as long as nobody
 * looked. The regulation's nine named factors map onto eleven QPS factors, two of them
 * two-to-one, and the last two map onto the screening questions outside the index — which
 * is why those two carry "!" rather than "✓": a screening count is not a measurement of
 * the factor, and the design says so in the same words.
 */

const LEGAL = ['aml31c', 'aml91', 'aml23', 'aml43', 'forskrift1a', 'aml62'] as const

/**
 * Each row: the regulation's own wording, and the factor keys that answer it. An empty
 * array means the regulation names something this instrument screens for rather than
 * measures — the "!" rows.
 */
const COVERAGE: { key: string; factors: string[] }[] = [
  { key: 'unclear', factors: ['rolle', 'motstrid'] },
  { key: 'emotional', factors: ['emosjon'] },
  { key: 'workload', factors: ['mengde'] },
  { key: 'support', factors: ['leder', 'kollega'] },
  { key: 'control', factors: ['medvirk'] },
  { key: 'integrity', factors: ['integritet', 'ytring'] },
  { key: 'contact', factors: ['kontakt'] },
  { key: 'harassment', factors: [] },
  { key: 'violence', factors: [] },
]

const GAPS = ['vernerunde', 'samtaler', 'informasjon', 'opplaering', 'bht'] as const

export async function RegelverkTab({ factorKeys }: { factorKeys: string[] }) {
  const t = await getTranslations()
  const seeded = new Set(factorKeys)

  return (
    <>
      <section className="mt-[20px] rounded-panel border border-sbg bg-sbg px-[26px] py-[24px]">
        <div className="flex flex-wrap items-start justify-between gap-[14px]">
          <h2 className="m-0 font-display text-[21px] font-semibold">
            {t('oppsett.regelverk.title')}
          </h2>
          <ButtonLink href="/rapport" size="sm" tone="quiet" pad={15}>
            {t('oppsett.regelverk.openReport')}
          </ButtonLink>
        </div>
        <div className="mt-[14px] flex flex-col gap-[9px]">
          {LEGAL.map((k) => (
            <div key={k} className="flex items-baseline gap-[12px]">
              <span className="w-[104px] flex-none text-[12px] font-bold">
                {t(`oppsett.regelverk.legal.${k}.ref`)}
              </span>
              <span className="text-[13px] leading-[1.55] [text-wrap:pretty]">
                {t(`oppsett.regelverk.legal.${k}.what`)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-[16px] rounded-panel border border-line bg-sf px-[26px] py-[24px]">
        <h2 className="m-0 font-display text-[21px] font-semibold">
          {t('oppsett.regelverk.coverTitle')}
        </h2>
        <p className="mt-[6px] max-w-[680px] text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">
          {t('oppsett.regelverk.coverLead')}
        </p>

        <div className="mt-[16px] flex flex-col gap-[7px]">
          {COVERAGE.map((row) => {
            // a row is covered only while every factor it names is actually in the
            // instrument; drop one from the seed and the tick here goes with it
            const covered = row.factors.length > 0 && row.factors.every((f) => seeded.has(f))
            return (
              <div
                key={row.key}
                className="grid items-center gap-[13px] rounded-btn border border-line bg-bg px-[14px] py-[11px] [grid-template-columns:24px_minmax(0,1fr)_minmax(0,1.4fr)]"
              >
                <span
                  className="flex h-[22px] w-[22px] items-center justify-center rounded-pill text-[12px] font-bold"
                  style={
                    covered
                      ? { background: '#CFE7E4', color: '#20431C' }
                      : { background: '#FBEBBE', color: '#5C4600' }
                  }
                >
                  {covered ? '✓' : '!'}
                </span>
                <span className="text-[13.5px] font-semibold [text-wrap:pretty]">
                  {t(`oppsett.regelverk.cover.${row.key}.ref`)}
                </span>
                <span className="text-[12.5px] text-mut [text-wrap:pretty]">
                  {covered
                    ? row.factors.map((f) => t(`factor.${f}.label`)).join(' · ')
                    : t(`oppsett.regelverk.cover.${row.key}.where`)}
                </span>
              </div>
            )
          })}
        </div>

        <div className="mt-[20px] border-t border-line pt-[18px]">
          <div className="max-w-[680px] text-[13.5px] leading-[1.6] [text-wrap:pretty]">
            {t('oppsett.regelverk.gapLead')}
          </div>
          <div className="mt-[12px] flex flex-col gap-[7px]">
            {GAPS.map((g) => (
              <div key={g} className="flex items-start gap-[10px]">
                <span className="mt-[1px] block h-[18px] w-[18px] flex-none rounded-focus border border-dashed border-rule" />
                <span className="text-[13px] leading-[1.5] text-body [text-wrap:pretty]">
                  {t(`oppsett.regelverk.gap.${g}`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
