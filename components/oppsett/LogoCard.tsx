'use client'

import { useRef, useState, useTransition } from 'react'
import { removeLogo, setLogoInHeader, uploadLogo, type LogoResult } from '@/app/(app)/oppsett/logo-actions'

/**
 * The organisation's logo (0104, D-154). The design's «Hva står i toppen» (bundle v3 lines
 * 3677-3695): two choices, and a 96 px dashed field to drop the logo in when the second is
 * picked. The design's first choice is «Assistenten», whose face stands in the logo; the header
 * here carries the Orgpuls mark, not the assistant (D-32), so the first choice is the mark.
 *
 * The field is a label over a file input, so it is a button for the keyboard and a drop target
 * for the mouse. The logo is also shown where the design does not place it — the invitations,
 * the survey, the round page — and the lead says so, so the choice here is not mistaken for
 * the only place it appears.
 */
export function LogoCard({
  logo,
  canWrite,
  labels,
}: {
  logo: { src: string; inHeader: boolean } | null
  canWrite: boolean
  labels: {
    title: string
    lead: string
    top: string
    options: { mark: { label: string; note: string }; logo: { label: string; note: string } }
    drop: string
    hint: string
    hintDone: string
    hintNotTop: string
    remove: string
    saving: string
    problems: Record<string, string>
  }
}) {
  const [mode, setMode] = useState<'mark' | 'logo'>(logo?.inHeader ? 'logo' : 'mark')
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const input = useRef<HTMLInputElement>(null)

  const done = (r: LogoResult) => setProblem(r.ok ? null : r.problem)

  const pick = (next: 'mark' | 'logo') => {
    setMode(next)
    setProblem(null)
    // with no logo stored there is nothing to switch yet: the upload that follows puts it on top
    if (!logo || !canWrite) return
    start(async () => done(await setLogoInHeader(next === 'logo')))
  }

  const send = (file: File | undefined) => {
    if (!file || !canWrite) return
    start(async () => {
      const data = new FormData()
      data.set('logo', file)
      const r = await uploadLogo(data)
      // a logo stored while «Orgpuls» is chosen keeps the mark on top
      if (r.ok && mode === 'mark') done(await setLogoInHeader(false))
      else done(r)
      if (input.current) input.current.value = ''
    })
  }

  const hint = problem
    ? (labels.problems[problem] ?? labels.problems.denied)
    : !logo
      ? labels.hint
      : logo.inHeader
        ? labels.hintDone
        : labels.hintNotTop

  return (
    <section className="rounded-panel border border-line bg-sf px-[24px] py-[22px]" aria-labelledby="logo-head">
      <h2 id="logo-head" className="m-0 text-[11px] font-normal uppercase tracking-[0.11em] text-mut">
        {labels.title}
      </h2>
      <p className="mt-[7px] max-w-[600px] text-[13px] leading-[1.6] text-body [text-wrap:pretty]">{labels.lead}</p>

      <div className="mt-[16px] text-[13.5px] font-semibold">{labels.top}</div>
      <div className="mt-[11px] flex flex-col gap-[8px]">
        {(['mark', 'logo'] as const).map((k) => (
          <label
            key={k}
            className={`flex items-start gap-[11px] rounded-cta border px-[15px] py-[13px] text-left ${
              canWrite ? 'cursor-pointer' : 'cursor-not-allowed'
            } ${mode === k ? 'border-ink bg-sbg' : 'border-line bg-transparent'}`}
          >
            <input
              type="radio"
              name="logoTop"
              value={k}
              checked={mode === k}
              disabled={!canWrite || pending}
              onChange={() => pick(k)}
              className="peer absolute h-px w-px overflow-hidden opacity-0"
            />
            <span className="mt-[2px] flex h-[17px] w-[17px] flex-none items-center justify-center rounded-pill border-2 border-ink peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink">
              <span className="block h-[8px] w-[8px] rounded-pill" style={{ background: mode === k ? '#191510' : 'transparent' }} />
            </span>
            <span className="min-w-0">
              <span className={`block text-[13.5px] ${mode === k ? 'font-bold' : 'font-medium'}`}>{labels.options[k].label}</span>
              <span className="mt-[2px] block text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">{labels.options[k].note}</span>
            </span>
          </label>
        ))}
      </div>

      {mode === 'logo' || logo ? (
        <div className="mt-[13px]">
          <label
            className={`relative flex h-[96px] items-center justify-center overflow-hidden rounded-tile border border-dashed border-[#C4BCA8] bg-bg has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
              canWrite ? 'cursor-pointer' : 'cursor-not-allowed'
            }`}
            onDragOver={(e) => {
              if (canWrite) e.preventDefault()
            }}
            onDrop={(e) => {
              e.preventDefault()
              send(e.dataTransfer.files?.[0])
            }}
          >
            <input
              ref={input}
              type="file"
              name="logo"
              accept="image/png,image/jpeg,image/webp"
              disabled={!canWrite || pending}
              onChange={(e) => send(e.target.files?.[0])}
              className="absolute h-px w-px overflow-hidden opacity-0"
            />
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- a same-origin image the route serves; next/image adds nothing at 96 px
              <img src={logo.src} alt={labels.title} className="block h-full max-h-[80px] w-auto max-w-[80%] object-contain" />
            ) : (
              <span className="text-[13px] text-mut">{pending ? labels.saving : labels.drop}</span>
            )}
          </label>
          <div
            role={problem ? 'alert' : undefined}
            className="mt-[9px] max-w-[580px] text-[12.5px] leading-[1.5] [text-wrap:pretty]"
            style={{ color: problem ? '#A33A16' : logo?.inHeader ? '#2F5D2A' : '#5F5849' }}
          >
            {pending ? labels.saving : hint}
          </div>
          {logo && canWrite ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => done(await removeLogo()))}
              className="mt-[10px] inline-flex h-[32px] cursor-pointer items-center rounded-ctl border border-line bg-transparent px-[12px] text-[12.5px] font-semibold text-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-default disabled:opacity-60"
            >
              {labels.remove}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
