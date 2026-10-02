'use client'

import { createContext, useContext, useState } from 'react'
import { fitOf, PLAN_SIZES, SIZE_RANGE } from '@/lib/site/pricing'

/**
 * Pris's «Hvor mange ansatte er dere?» (D-190; nettside-v3/Pris.dc.html, the hero's slider): one
 * headcount the slider sets, which picks the plan that fits. The plan cards and the ink band's size
 * row light the fitting plan, so the three share it through this context. The server draws the
 * design's starting state (18 employees, Liten), so the page reads the same before JavaScript.
 */
const Size = createContext<number>(SIZE_RANGE.start)

const SetSize = createContext<(n: number) => void>(() => {})

export function SizeProvider({ children }: { children: React.ReactNode }) {
  const [n, setN] = useState<number>(SIZE_RANGE.start)
  return (
    <SetSize.Provider value={setN}>
      <Size.Provider value={n}>{children}</Size.Provider>
    </SetSize.Provider>
  )
}

const useFit = () => fitOf(useContext(Size))

/**
 * A message's `{name}` arguments and its `<b>`, `<abbr>` and `<sr>` tags, client side (the public
 * site has no client message provider): bold, a visible abbreviation a screen reader skips, and the
 * words it reads instead (R-04: «kr/mnd» is read «kroner per måned»).
 */
function rich(template: string, values: Record<string, string | number>) {
  const text = template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''))
  const out: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(/<(b|abbr|sr)>(.*?)<\/\1>/g)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const [, tag, inner] = m
    const key = out.length
    out.push(
      tag === 'b' ? (
        <strong key={key} className="text-ink">
          {inner}
        </strong>
      ) : tag === 'abbr' ? (
        <span key={key} aria-hidden="true">
          {inner}
        </span>
      ) : (
        <span key={key} className="sr-only">
          {inner}
        </span>
      ),
    )
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export type SliderWords = {
  label: string
  /** the typed number's name (R-02) */
  number: string
  valuetext: string
  valuetextGroup: string
  readout: string
  readoutGroup: string
  /** «ansatt» / «ansatte»: the unit after the number, singular at 1 */
  unitOne: string
  unitOther: string
  /** the plan names, in PLAN_SIZES order */
  plans: string[]
}

/**
 * The panel: a native range (arrows, Page Up/Down, Home/End) with its visible label, and the
 * read-out beside it. The range's `aria-valuetext` names the plan and the price, so a screen reader
 * hears the plan change (R-01); the read-out itself is not a live region, which would speak on every
 * step. Below 640px the read-out may take its own line and wrap (R-03).
 */
export function SizeSlider({ w }: { w: SliderWords }) {
  const n = useContext(Size)
  const setN = useContext(SetSize)
  const [draft, setDraft] = useState<string | null>(null)
  const fit = fitOf(n)
  const monthly = PLAN_SIZES[fit]!.monthly
  const values = { n, unit: n === 1 ? w.unitOne : w.unitOther, plan: w.plans[fit]!, price: monthly ?? '', perHead: monthly ? Math.round(monthly / n) : '' }
  const valuetext = (monthly ? w.valuetext : w.valuetextGroup).replace(/\{(\w+)\}/g, (_, k: keyof typeof values) => String(values[k]))
  return (
    <div className="mt-[36px] flex flex-wrap items-center gap-x-[28px] gap-y-[14px] rounded-[20px] border border-line bg-sf px-[24px] py-[20px]">
      <label htmlFor="ansatte" className="flex-none text-[15px] font-bold">
        {w.label}
      </label>
      <input
        id="ansatte"
        type="range"
        min={SIZE_RANGE.min}
        max={SIZE_RANGE.max}
        step={1}
        value={n}
        onChange={(e) => {
          setDraft(null)
          setN(Number(e.target.value))
        }}
        aria-valuetext={valuetext}
        className="m-[2px] h-[28px] min-w-0 flex-[1_1_220px] cursor-pointer accent-ink"
      />
      <span className="flex min-w-[min(250px,100%)] flex-none items-baseline gap-[10px] max-sm:min-w-0 max-sm:flex-initial">
        <input
          type="number"
          inputMode="numeric"
          min={SIZE_RANGE.min}
          max={SIZE_RANGE.max}
          step={1}
          value={draft ?? n}
          aria-label={w.number}
          onChange={(e) => {
            setDraft(e.target.value)
            const v = Number(e.target.value)
            // past the slider's end every headcount is Flere selskaper: the slider rests at its end,
            // the field keeps the typed number, and both name the same plan
            if (Number.isInteger(v) && v >= SIZE_RANGE.min) setN(Math.min(v, SIZE_RANGE.max))
          }}
          onBlur={() => setDraft((d) => (d !== null && Number.isInteger(Number(d)) && Number(d) > SIZE_RANGE.max ? String(Number(d)) : null))}
          className="m-0 flex-none border-0 bg-transparent p-0 font-display text-[30px] font-semibold tabular-nums text-ink [appearance:textfield] [field-sizing:content] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="min-w-0 text-[13.5px] text-body">{rich(monthly ? w.readout : w.readoutGroup, values)}</span>
      </span>
    </div>
  )
}

/** A plan card: drawn as the one that fits (2px ink border, soft yellow) or as the others */
export function FitCard({ i, children }: { i: number; children: React.ReactNode }) {
  const fit = useFit() === i
  return (
    <li
      className={`flex flex-col gap-[13px] rounded-[20px] p-[26px] ${fit ? 'border-2 border-ink bg-sbg' : 'border border-line bg-sf'}`}
    >
      {children}
    </li>
  )
}

/** «Passer dere», on the fitting card only: text, so it is read with the card (R-04) */
export function FitBadge({ i, label }: { i: number; label: string }) {
  return useFit() === i ? <span className="rounded-pill bg-ac px-[11px] py-[4px] text-[11.5px] font-bold">{label}</span> : null
}

/** The card's button: yellow on the fitting card, outlined on the others */
export function FitCta({ i, href, describedBy, children }: { i: number; href: string; describedBy: string; children: React.ReactNode }) {
  const fit = useFit() === i
  return (
    <a
      href={href}
      aria-describedby={describedBy}
      className={`mt-[8px] flex min-h-[46px] items-center justify-center rounded-cta border border-ink text-[14.5px] font-bold text-ink no-underline hover:text-ink ${
        fit ? 'bg-ac' : 'bg-transparent'
      }`}
    >
      {children}
    </a>
  )
}

/**
 * One size in the ink band's row of three: yellow on the size that fits, with «(passer dere)» for a
 * screen reader, since the fill alone says it (R-05). Below 640px the row is a column, its sizes
 * parted by a top rule instead of a left one.
 */
export function FitSize({ i, sr, children }: { i: number; sr: string; children: React.ReactNode }) {
  const fit = useFit() === i
  return (
    <li
      className={`flex flex-col gap-[4px] px-[18px] py-[16px] ${i ? 'border-l border-[rgba(252,246,233,.22)] max-sm:border-l-0 max-sm:border-t' : ''} ${
        fit ? 'bg-ac text-ink' : 'bg-transparent text-bg'
      }`}
    >
      {children}
      {fit ? <span className="sr-only">{sr}</span> : null}
    </li>
  )
}
