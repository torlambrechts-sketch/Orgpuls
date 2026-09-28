import { getTranslations } from 'next-intl/server'
import type { OpenAnswers as Data } from '@/lib/own/read'

/**
 * What employees wrote in answer to a question rather than on a statement (0095, D-145): the
 * open field and the round's own «Fritekst» questions. Under the comments, in the comment
 * card's own form, for one round, which the heading names.
 *
 * The texts arrive masked and in an order that is not the order they were written in; they
 * have no group and no hour, and cannot be answered, so there is no reply field. The page
 * renders it only when somebody wrote; below k responses the database returns no texts.
 */
export async function OpenAnswers({ data, round }: { data: Data; round: string }) {
  const t = await getTranslations()
  return (
    <section className="mt-[16px] rounded-note border border-line bg-sf px-[20px] py-[18px]" aria-labelledby="fritekst">
      <h2 id="fritekst" className="text-[15px] font-bold">
        {t('kommentarer.open.title')}
      </h2>
      {data.status === 'insufficient_data' ? (
        <p className="m-0 mt-[6px] text-[12.5px] leading-[1.5] text-mut">
          {t('kommentarer.open.insufficient', { threshold: data.threshold })}
        </p>
      ) : (
        <>
          <p className="m-0 mt-[4px] max-w-[680px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">
            {t('kommentarer.open.lead', { round })}
          </p>
          {data.items.map((q) => (
            <div key={q.key} className="mt-[14px] border-t border-line pt-[12px]">
              <div className="flex flex-wrap items-baseline justify-between gap-[8px]">
                <h3 className="m-0 text-[13.5px] font-semibold leading-[1.45] [text-wrap:pretty]">
                  {q.text ?? t(`extra.${q.extra}.text`)}
                </h3>
                <span className="text-[11.5px] text-mut">{t('kommentarer.open.count', { count: q.answers.length })}</span>
              </div>
              {q.answers.length ? (
                <ul className="m-0 mt-[6px] list-none p-0">
                  {q.answers.map((a, i) => (
                    <li key={i} className="mt-[8px] text-[14px] leading-[1.55] [text-wrap:pretty]">
                      «{a}»
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 mt-[6px] text-[12.5px] text-mut">{t('kommentarer.open.none')}</p>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  )
}
