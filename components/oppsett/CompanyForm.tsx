'use client'

import { useState, useTransition } from 'react'
import { saveBaselineMonth, saveLanguage } from '@/app/(app)/oppsett/actions'

/**
 * Innstillinger for hele selskapet. Bundle lines 2044-2073.
 *
 * Three blocks, two of which write.
 *
 * **Language.** The design offers Bokmål, Nynorsk, English and Polski. This product has
 * two message catalogues, `no` and `en`, and `organizations.default_lang` refuses anything
 * else. Offering Nynorsk and Polski would be offering a language the respondent form
 * cannot render. D-33.
 *
 * **The work-environment year's start month is `app.year_wheels.baseline_month`**, not a
 * column of its own — the design's own note says the årshjul follows it, and two columns
 * would be two truths that disagree the first time one moved. An organisation with no
 * wheel has nothing to move, and the block says so instead of silently creating one.
 *
 * **Bransjesammenligning is read-only** because it is. The næringskode comes from
 * Enhetsregisteret and the comparison group would come from a benchmark dataset this
 * product does not have; the design's "118 norske virksomheter" is a number with no
 * source, so it is not printed. D-33.
 */
export function CompanyForm({
  canWrite,
  lang,
  baselineMonth,
  months,
  labels,
}: {
  canWrite: boolean
  lang: 'no' | 'en'
  baselineMonth: number | null
  months: { value: number; label: string }[]
  labels: {
    language: string
    languageNote: string
    langNo: string
    langEn: string
    yearStart: string
    yearStartNote: string
    noWheel: string
    benchmark: string
    benchmarkNote: string
    saved: string
    problems: Record<string, string>
  }
}) {
  const [l, setL] = useState(lang)
  const [m, setM] = useState(baselineMonth)
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const run = (fn: () => Promise<{ ok: boolean; problem?: string }>) =>
    startTransition(async () => {
      const result = await fn()
      setProblem(result.ok ? null : (result.problem ?? 'denied'))
      setSaved(result.ok)
    })

  const status = problem
    ? { text: labels.problems[problem] ?? labels.problems.denied, colour: '#A33A16' }
    : saved && !pending
      ? { text: labels.saved, colour: '#2F5D2A' }
      : null

  return (
    <>
      <div className="mt-[16px]">
        <div className="text-[13.5px] font-semibold">{labels.language}</div>
        <div className="mt-[10px] flex flex-wrap gap-[7px]">
          {(['no', 'en'] as const).map((code) => (
            <label key={code} className="inline-flex flex-none">
              <input
                type="radio"
                name="lang"
                value={code}
                checked={l === code}
                disabled={!canWrite}
                onChange={() => {
                  setL(code)
                  const data = new FormData()
                  data.set('lang', code)
                  run(() => saveLanguage(data))
                }}
                className="peer absolute h-px w-px overflow-hidden opacity-0"
              />
              <Chip on={l === code}>{code === 'no' ? labels.langNo : labels.langEn}</Chip>
            </label>
          ))}
        </div>
        <div className="mt-[9px] text-[12.5px] leading-[1.5] text-mut">{labels.languageNote}</div>
      </div>

      <div className="mt-[20px] border-t border-line pt-[16px]">
        <div className="text-[13.5px] font-semibold">{labels.yearStart}</div>
        {baselineMonth === null ? (
          <div className="mt-[10px] max-w-[600px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
            {labels.noWheel}
          </div>
        ) : (
          <div className="mt-[10px] flex flex-wrap gap-[7px]">
            {months.map((month) => (
              <label key={month.value} className="inline-flex flex-none">
                <input
                  type="radio"
                  name="baselineMonth"
                  value={month.value}
                  checked={m === month.value}
                  disabled={!canWrite}
                  onChange={() => {
                    setM(month.value)
                    const data = new FormData()
                    data.set('month', String(month.value))
                    run(() => saveBaselineMonth(data))
                  }}
                  className="peer absolute h-px w-px overflow-hidden opacity-0"
                />
                <Chip on={m === month.value}>{month.label}</Chip>
              </label>
            ))}
          </div>
        )}
        <div className="mt-[9px] text-[12.5px] leading-[1.5] text-mut">{labels.yearStartNote}</div>
      </div>

      <div className="mt-[20px] border-t border-line pt-[16px]">
        <div className="text-[13.5px] font-semibold">{labels.benchmark}</div>
        <div className="mt-[7px] text-[13px] leading-[1.55] text-body [text-wrap:pretty]">
          {labels.benchmarkNote}
        </div>
      </div>

      {status ? (
        <p className="mt-[12px] text-[12.5px] leading-[1.5]" style={{ color: status.colour }}>
          {status.text}
        </p>
      ) : null}
    </>
  )
}

/** The design's settings chip (bundle 2050): 8px/15px padding, round, at 12.5px. */
function Chip({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex cursor-pointer items-center rounded-pill border px-[15px] py-[8px] text-[12.5px] peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
        on ? 'border-ink bg-sbg font-bold' : 'border-line bg-transparent font-medium'
      }`}
    >
      {children}
    </span>
  )
}
