import { getLocale, getTranslations } from 'next-intl/server'
import type { OwnResults } from '@/lib/own/read'

/**
 * A closed round's own «Skala 1–5» questions (0095, D-145), under the workspace, beside the
 * module's results and drawn with the same card. Reported for themselves: «Egne spørsmål
 * rapporteres for seg og regnes ikke inn i indeksen» (v3 bundle 5811).
 *
 * Every number is the database's. A question fewer than k answered arrives with no numbers and
 * is drawn as the sentence that says so. The bar is the share who answered «i stor grad» or
 * «i svært stor grad».
 */
export async function OwnQuestionResults({ results }: { results: OwnResults }) {
  const t = await getTranslations('resultater.own')
  const locale = await getLocale()
  const mean = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })

  return (
    <section className="mt-[14px] rounded-card border border-line bg-sf px-[22px] py-[20px]" aria-labelledby="egne">
      <h2 id="egne" className="m-0 font-display text-[20px] font-semibold leading-[1.2]">
        {t('title')}
      </h2>
      <p className="m-0 mt-[6px] max-w-[640px] text-[13px] leading-[1.55] text-mut [text-wrap:pretty]">{t('lead')}</p>
      <ul className="m-0 mt-[12px] list-none p-0">
        {results.items.map((i) => (
          <li key={i.id} className="border-t border-line py-[12px]">
            <div className="text-[13.5px] font-semibold leading-[1.45] [text-wrap:pretty]">{i.text}</div>
            {i.suppressed || i.n === null || i.high === null || i.mean === null ? (
              <div className="mt-[6px] text-[12.5px] text-mut">{t('suppressed', { threshold: results.threshold })}</div>
            ) : (
              <>
                <div className="mt-[8px] flex h-[10px] overflow-hidden rounded-pill bg-track" aria-hidden="true">
                  <span className="bg-mint" style={{ width: `${i.high}%` }} />
                </div>
                <div className="mt-[6px] flex flex-wrap gap-x-[16px] gap-y-[4px] text-[12.5px] text-body">
                  <b>{t('figure', { high: i.high })}</b>
                  <span>{t('mean', { mean: mean.format(i.mean) })}</span>
                  <span className="text-mut">{t('n', { n: i.n })}</span>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
