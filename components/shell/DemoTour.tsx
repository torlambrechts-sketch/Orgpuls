'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { useShell } from '@/components/shell/ShellPrefs'
import { leaveDemo } from '@/lib/demo/actions'

/**
 * «Utforsk demoen» (D-191): a guide on the demo's start page, six real screens to try and the way
 * to an account of one's own. Rendered by DemoNotice, so it exists only in a visitor's demo copy
 * (demo_state); outside a demo nothing here mounts, and the screens stay as the design draws them.
 *
 * It watches every screen of the shell and ticks a step off once its screen has been opened. What
 * has been seen, and whether the guide is folded or closed, is a per-viewer convenience: it lives
 * in this browser's localStorage, read and written in try/catch, and nothing of it reaches the
 * database. It belongs to one copy of the demo — `copy` is when that copy is made fresh — so a new
 * copy starts a new guide. Without storage the guide still works for the page it is on.
 *
 * No design exists for it. It is the app's own panel card (Card: r20, #FFFDF6 on a hairline) with
 * Innsikt's display heading, rows drawn as the Deltakelse group rows are (r13 on the canvas), and
 * the app's buttons (components/ui/Button). In Enkel, where the nav is Oversikt alone, a step
 * switches to Full on the way, as Oversikt's own links do (goFull).
 */
type StepKey = 'innsikt' | 'resultater' | 'kommentarer' | 'tiltak' | 'malinger' | 'rapport'

const STEPS: { key: StepKey; href: string; path: string }[] = [
  { key: 'innsikt', href: '/innsikt', path: '/innsikt' },
  { key: 'resultater', href: '/resultater?visning=varmekart', path: '/resultater' },
  { key: 'kommentarer', href: '/kommentarer?status=ubesvart', path: '/kommentarer' },
  { key: 'tiltak', href: '/tiltak', path: '/tiltak' },
  { key: 'malinger', href: '/malinger?fane=arshjul', path: '/malinger' },
  { key: 'rapport', href: '/rapport', path: '/rapport' },
]
const KEYS = STEPS.map((s) => s.key)

type Mode = 'open' | 'folded' | 'closed'
type Saved = { copy: string; seen: StepKey[]; mode: Mode }

const STORE = 'orgpuls.demoTour'

const stepAt = (pathname: string) =>
  STEPS.find((s) => pathname === s.path || pathname.startsWith(`${s.path}/`))?.key ?? null

/** what this browser remembers for this copy of the demo, or a fresh guide */
function load(copy: string): Saved {
  const fresh: Saved = { copy, seen: [], mode: 'open' }
  try {
    const raw = window.localStorage.getItem(STORE)
    if (!raw) return fresh
    const v: unknown = JSON.parse(raw)
    if (!v || typeof v !== 'object') return fresh
    const o = v as Record<string, unknown>
    if (o.copy !== copy) return fresh
    const seen = Array.isArray(o.seen) ? o.seen.filter((k): k is StepKey => KEYS.includes(k as StepKey)) : []
    const mode: Mode = o.mode === 'folded' || o.mode === 'closed' ? o.mode : 'open'
    return { copy, seen, mode }
  } catch {
    return fresh
  }
}

function save(s: Saved) {
  try {
    window.localStorage.setItem(STORE, JSON.stringify(s))
  } catch {
    // private window, blocked storage: the guide simply forgets
  }
}

export function DemoTour({ copy }: { copy: string }) {
  const t = useTranslations('demo.tour')
  const pathname = usePathname()
  const { prefs, goFull } = useShell()
  // the server's first paint and the browser's first render agree: nothing remembered yet
  const [state, setState] = useState<Saved>({ copy, seen: [], mode: 'open' })
  const [ready, setReady] = useState(false)

  // the screen in view counts as seen, remembered for this copy
  useEffect(() => {
    const at = stepAt(pathname)
    const s = load(copy)
    const next = at && !s.seen.includes(at) ? { ...s, seen: [...s.seen, at] } : s
    save(next)
    setState(next)
    setReady(true)
  }, [pathname, copy])

  if (pathname !== '/innsikt' || state.mode === 'closed') return null

  const here = stepAt(pathname)
  const seen = new Set<StepKey>(state.seen)
  if (here) seen.add(here)
  const done = STEPS.filter((s) => seen.has(s.key)).length
  const open = state.mode === 'open'
  const setMode = (mode: Mode) => {
    const next = { ...state, mode }
    save(next)
    setState(next)
  }
  const wide = prefs.view === 'enkel' ? 'max-w-overview' : 'max-w-page'

  return (
    <section
      aria-labelledby="demo-tour-title"
      data-ready={ready ? 'true' : undefined}
      className={`mx-auto ${wide} px-[16px] pt-[24px] md:px-[28px] print:hidden`}
    >
      <div className="rounded-card border border-line bg-sf px-[20px] py-[18px] md:px-[24px]">
        <div className="flex flex-wrap items-center gap-x-[14px] gap-y-[8px]">
          <h2 id="demo-tour-title" className="m-0 font-display text-[22px] font-semibold">
            {t('title')}
          </h2>
          <span className="text-[12.5px] text-mut" aria-live="polite">
            {t('progress', { done, total: STEPS.length })}
          </span>
          <span className="ml-auto flex flex-none gap-[8px]">
            <Button
              size="xxs"
              tone="secondary"
              aria-expanded={open}
              aria-controls="demo-tour-steps"
              onClick={() => setMode(open ? 'folded' : 'open')}
            >
              {open ? t('hide') : t('show')}
            </Button>
            <Button size="xxs" tone="ghost" onClick={() => setMode('closed')}>
              {t('close')}
            </Button>
          </span>
        </div>
        <div
          aria-hidden="true"
          className="mt-[12px] h-[6px] overflow-hidden rounded-pill bg-track"
        >
          <span className="block h-full rounded-pill bg-greenbar" style={{ width: `${(done / STEPS.length) * 100}%` }} />
        </div>

        <div id="demo-tour-steps" hidden={!open}>
          <p className="m-0 mt-[12px] text-[13px] leading-[1.5] text-mut">{t('lead')}</p>
          <ol className="m-0 mt-[12px] grid list-none gap-[8px] p-0 md:grid-cols-2 xl:grid-cols-3">
            {STEPS.map((s, i) => {
              const isDone = seen.has(s.key)
              return (
                <li key={s.key} className="min-w-0">
                  <Link
                    href={s.href as Route}
                    onClick={(e) => {
                      if (prefs.view === 'enkel' && s.key !== 'innsikt') {
                        e.preventDefault()
                        goFull(s.href)
                      }
                    }}
                    aria-current={pathname === s.path ? 'page' : undefined}
                    className="flex h-full items-center gap-[12px] rounded-tile border border-line bg-bg px-[14px] py-[11px] text-ink no-underline hover:border-ink hover:text-ink hover:no-underline"
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-[26px] w-[26px] flex-none items-center justify-center rounded-pill text-[12px] font-bold ${
                        isDone ? 'bg-mint text-greendeep' : 'border border-rule text-mut'
                      }`}
                    >
                      {isDone ? '✓' : i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-bold leading-[1.35] [text-wrap:pretty]">
                        {t(`items.${s.key}.title`)}
                        {isDone ? <span className="sr-only"> ({t('seen')})</span> : null}
                      </span>
                      <span className="mt-[2px] block text-[12px] leading-[1.4] text-mut [text-wrap:pretty]">
                        {t(`items.${s.key}.hint`)}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
            <li className="min-w-0 md:col-span-2 xl:col-span-3">
              <div className="flex flex-wrap items-center gap-x-[14px] gap-y-[10px] rounded-tile bg-sbg px-[14px] py-[12px]">
                <span
                  aria-hidden="true"
                  className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-pill bg-ink text-[12px] font-bold text-sf"
                >
                  {STEPS.length + 1}
                </span>
                {/* on a phone the button wraps under the text rather than squeeze it */}
                <span className="min-w-[180px] flex-1">
                  <span className="block text-[13.5px] font-bold leading-[1.35]">{t('own.title')}</span>
                  <span className="mt-[2px] block text-[12px] leading-[1.4] text-body [text-wrap:pretty]">{t('own.hint')}</span>
                </span>
                <form action={leaveDemo}>
                  <Button type="submit" size="xs" tone="primary">
                    {t('own.cta')}
                  </Button>
                </form>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </section>
  )
}
