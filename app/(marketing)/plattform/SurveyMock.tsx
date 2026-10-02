import { getTranslations } from 'next-intl/server'

/** Page 4 of 15 (11 factor pages and the 4 questions outside the index), so the bar is 27 % full */
const PAGE = 4
const PAGES = 15
/** the option drawn chosen on each statement: 4, 3, none */
const CHOSEN = [4, 3, 0] as const

/**
 * The questionnaire as an employee meets it, drawn, not photographed: one factor's three
 * statements on one page (D-150), the real ones (`factor.ytring.s1–s3`), with the survey's own
 * progress, time and comment strings. It stands in for the screenshot the design shows here,
 * which predates D-150 (one statement a page, «1 / 6») and must not ship (decision sheet,
 * Plattform › 2). The drawing is the front page design's survey mock (Forside.dc.html, «Måling
 * og svar»), set where the screenshot sat: the image's frame (−6px −8px, radius 13, hairline).
 *
 * One picture to a screen reader (`role="img"` with a label); nothing in it is focusable (F-11,
 * G-17). Text the design draws in faint is mut (G5).
 */
export async function SurveyMock() {
  const t = await getTranslations()
  const statements = (['s1', 's2', 's3'] as const).map((s) => t(`factor.ytring.${s}`))
  return (
    <div
      role="img"
      aria-label={t('site.plattform.respondent.mock')}
      className="-mx-[8px] -my-[6px] rounded-tile border border-line bg-bg p-[26px] max-sm:p-[18px]"
    >
      <span className="flex items-baseline justify-between gap-[12px]">
        <span className="text-[11px] font-bold uppercase tracking-[.11em] text-mut">
          {t('factor.ytring.name')} · {t('respond.progress', { n: PAGE, total: PAGES })}
        </span>
        <span className="text-[12px] text-mut">{t('respond.timeLeft', { minutes: 3 })}</span>
      </span>
      <span className="mt-[10px] block h-[6px] rounded-bar bg-track">
        <span className="block h-full rounded-bar bg-ink" style={{ width: `${Math.round((PAGE / PAGES) * 100)}%` }} />
      </span>
      <span className="mt-[22px] flex flex-col gap-[18px]">
        {statements.map((s, i) => (
          <span key={s} className="block">
            <span className="block font-display text-[17px] font-semibold leading-[1.3] [text-wrap:pretty]">{s}</span>
            <span className="mt-[10px] grid grid-cols-5 gap-[6px]">
              {[1, 2, 3, 4, 5].map((n) => (
                <span
                  key={n}
                  className={`flex h-[38px] items-center justify-center rounded-opt border text-[14px] ${
                    n === CHOSEN[i] ? 'border-ink bg-sbg font-bold' : 'border-line bg-sf font-medium'
                  }`}
                >
                  {n}
                </span>
              ))}
            </span>
          </span>
        ))}
      </span>
      <span className="mt-[20px] block rounded-opt border border-dashed border-rule px-[14px] py-[12px] text-[13px] text-mut">
        {t('respond.commentPrompt')}
      </span>
    </div>
  )
}
