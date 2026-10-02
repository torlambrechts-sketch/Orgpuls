'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

/**
 * The front page's hero carousel (D-190; nettside-v3/Forside.dc.html, `section#topp`, «Hero
 * slider»), with the decision sheet's behaviour (lead decision 3, usability F-01…F-08):
 *
 * - No autoplay. The first theme is server-rendered and shown; a theme changes only when the
 *   visitor picks one. The design's 8-second timer is gone (WCAG 2.2.2).
 * - All three panels are in the HTML, the inactive ones `hidden`, so search engines, readers and
 *   visitors without JavaScript have every theme.
 * - The tabs are a real APG tablist: roving tabindex, ←/→ move and select (wrapping), Home/End go
 *   to the ends. The number circles are decoration.
 * - «Forrige tema» / «Neste tema» keep focus where it is and wrap. A change they make is
 *   announced once, politely («Tema 2 av 3: Oppfyll loven»); the panels themselves are not live.
 * - Should focus be inside a panel as it hides, it goes to the selected tab.
 *
 * Desktop is the design's, value for value: 40/56px padding, the 560px stage the slides centre in,
 * the 50px pill tabs and the 52px round arrows. Below 640px (G4.2) the band's own 16px gutter is
 * the side margin, the stage has no minimum height and the padding is 32px.
 */
export function HeroCarousel({
  panels,
  tabs,
  label,
  roledescription,
  tablist,
  prev,
  next,
  announce,
}: {
  panels: ReactNode[]
  tabs: string[]
  label: string
  roledescription: string
  tablist: string
  prev: string
  next: string
  /** one per theme, already filled in: «Tema 2 av 3: Oppfyll loven» */
  announce: string[]
}) {
  const [cur, setCur] = useState(0)
  const [said, setSaid] = useState('')
  const stage = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const refocus = useRef<number | null>(null)
  const n = tabs.length

  const select = (i: number, how: 'tab' | 'arrow') => {
    const to = (i + n) % n
    // F-06: focus inside the panel that is about to hide goes to the selected tab
    if (stage.current?.contains(document.activeElement)) refocus.current = to
    if (how === 'tab') refocus.current = to
    setCur(to)
    // F-05: only the arrow buttons announce; a selected tab already says so itself
    setSaid(how === 'arrow' ? (announce[to] ?? '') : '')
  }

  useEffect(() => {
    if (refocus.current === null) return
    tabRefs.current[refocus.current]?.focus()
    refocus.current = null
  }, [cur])

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const to =
      e.key === 'ArrowRight' ? cur + 1 : e.key === 'ArrowLeft' ? cur - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null
    if (to === null) return
    e.preventDefault()
    select(to, 'tab')
  }

  return (
    <section
      id="topp"
      data-screen-label="Hero slider"
      aria-roledescription={roledescription}
      aria-label={label}
      className="w-full max-w-[1240px] self-center px-[56px] py-[40px] max-sm:px-0 max-sm:py-[32px]"
    >
      <div id="hero-panels" ref={stage} className="flex min-h-[560px] items-center max-sm:min-h-0">
        <div className="w-full">
          {panels.map((p, i) => (
            <div key={i} role="tabpanel" id={`hero-panel-${i}`} aria-labelledby={`hero-tab-${i}`} hidden={i !== cur}>
              {p}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-[28px] flex flex-wrap items-center justify-between gap-[16px]">
        <div role="tablist" aria-label={tablist} onKeyDown={onKey} className="flex flex-wrap gap-[10px]">
          {tabs.map((t, i) => {
            const on = i === cur
            return (
              <button
                key={t}
                ref={(el) => {
                  tabRefs.current[i] = el
                }}
                type="button"
                role="tab"
                id={`hero-tab-${i}`}
                aria-selected={on}
                aria-controls={`hero-panel-${i}`}
                tabIndex={on ? 0 : -1}
                onClick={() => select(i, 'tab')}
                className={`flex min-h-[50px] cursor-pointer items-center gap-[11px] rounded-pill border pl-[7px] pr-[20px] text-[15.5px] text-ink ${
                  on ? 'border-ink bg-sbg font-bold' : 'border-line bg-sf font-semibold'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-[36px] w-[36px] flex-none items-center justify-center rounded-pill text-[14px] font-bold ${on ? 'bg-ac' : 'bg-track'}`}
                >
                  {i + 1}
                </span>
                {t}
              </button>
            )
          })}
        </div>
        <div className="flex gap-[10px]">
          {(
            [
              [prev, -1, '←'],
              [next, 1, '→'],
            ] as const
          ).map(([name, step, glyph]) => (
            <button
              key={step}
              type="button"
              aria-label={name}
              aria-controls="hero-panels"
              onClick={() => select(cur + step, 'arrow')}
              className="flex h-[52px] w-[52px] cursor-pointer items-center justify-center rounded-pill border border-ink bg-sf text-[20px] text-ink"
            >
              <span aria-hidden="true">{glyph}</span>
            </button>
          ))}
        </div>
      </div>
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {said}
      </p>
    </section>
  )
}
