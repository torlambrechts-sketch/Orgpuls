import { getLocale, getTranslations } from 'next-intl/server'
import type { EffectResult as Data } from '@/lib/own/read'

/**
 * «Tiltakene etter forrige kartlegging har hatt positiv effekt på arbeidsplassen min» (0097,
 * P1-7), under the workspace beside the other questions outside the index, in the same card.
 * The database's figures, whole organisation only; fewer than k answers is the sentence.
 */
export async function EffectResult({ data }: { data: Data }) {
  const t = await getTranslations('resultater.effect')
  const locale = await getLocale()
  const mean = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return (
    <section className="mt-[14px] rounded-card border border-line bg-sf px-[22px] py-[20px]" aria-labelledby="effekt">
      <h2 id="effekt" className="m-0 font-display text-[20px] font-semibold leading-[1.2]">
        {t('title')}
      </h2>
      <p className="m-0 mt-[6px] max-w-[640px] text-[13px] leading-[1.55] text-mut [text-wrap:pretty]">{t('lead')}</p>
      {data.status === 'ok' ? (
        <>
          <div className="mt-[12px] flex h-[10px] overflow-hidden rounded-pill bg-track" aria-hidden="true">
            <span className="bg-mint" style={{ width: `${data.agree}%` }} />
          </div>
          <div className="mt-[6px] flex flex-wrap gap-x-[16px] gap-y-[4px] text-[12.5px] text-body">
            <b>{t('figure', { agree: data.agree })}</b>
            <span>{t('mean', { mean: mean.format(data.mean) })}</span>
            <span className="text-mut">{t('n', { n: data.n })}</span>
          </div>
        </>
      ) : (
        <div className="mt-[10px] text-[12.5px] text-mut">{t('suppressed', { threshold: data.threshold })}</div>
      )}
    </section>
  )
}
