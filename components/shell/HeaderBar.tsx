'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'
import { useId, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { articleByKey } from '@/lib/help/articles'
import type { SetupProgress } from '@/lib/shell/read'

/**
 * The header bar and the panel that opens under it. Bundle lines 49-148 (markup) and
 * 3082-3190 (`helpData`).
 *
 * Hjelp, Grunnlag and the assistant are three modes of one panel, not three places to go.
 * Each opens a band under the header, for the screen you are on:
 *
 *   Hjelp     three steps for this screen, and three help articles about it
 *   Grunnlag  what the screen rests on — the research, and (in law mode) what the
 *             Working Environment Act requires here
 *   Tuva      "Kom i gang": the four steps to being set up, ticked from real rows
 *
 * The panel belongs to the screen it was opened on, as the prototype's `panelFor` does:
 * navigate and it is gone. That is derived, not effected — the state remembers which path
 * it was opened for, and a different path simply reads as closed.
 *
 * Until this component existed Grunnlag and the assistant were buttons with no handler,
 * and Hjelp was a link to /hjelp. Hjelp is a toggle again, because the design's control
 * opens the panel; the help site is one step further, behind the panel's own "Hele
 * hjelpesiden →". Everything inside the panel that changes the address is a link styled
 * as the bundle's button (D-06). D-48.
 *
 * The texts are the design's, per screen, in `headerPanel.*`. A screen the design has no
 * entry for falls back to Innsikt's, as `H[scr] || H.home` does; the law text falls back
 * the same way, and Rapport has one of its own.
 */

type Mode = 'help' | 'science' | 'tuva'
type SciTab = 'forskning' | 'lov'

const SCREENS: [string, string][] = [
  ['/innsikt', 'home'],
  ['/malinger', 'measure'],
  ['/maleoppsett', 'plan'],
  ['/arshjulet', 'wheel'],
  ['/resultat', 'result'],
  ['/samtaler', 'conv'],
  ['/tiltak', 'tasks'],
  ['/oppsett', 'settings'],
  ['/integrasjoner', 'conn'],
  ['/rapport', 'report'],
  ['/hjelp', 'helpsite'],
]

/** Screens with their own steps and research text; everything else reads Innsikt's. */
const WITH_HELP = ['home', 'measure', 'result', 'conv', 'tasks', 'plan', 'wheel', 'settings']
/** Screens with their own law text. */
const WITH_LAW = [...WITH_HELP, 'report']
/** The steps whose wording differs when law mode is off (bundle 3090-3120). */
const PLAIN_VARIANT: Record<string, string[]> = { home: ['s2', 's3'], measure: ['s1'], plan: ['s1'] }

/** The three articles the design suggests per screen (bundle 3157-3169), by registry key. */
const ARTICLES: Record<string, string[]> = {
  home: ['lesIndeksen', 'funnTilTiltak', 'forsteTimen'],
  measure: ['grunnlinjeEllerPuls', 'svarprosent', 'settOppArshjulet'],
  plan: ['egneSporsmal', 'grunnlinjeEllerPuls', 'velgTerskel'],
  wheel: ['settOppArshjulet', 'svarprosent', 'sms'],
  result: ['lesIndeksen', 'strekIStedet', 'funnTilTiltak'],
  conv: ['svarPaKommentar', 'hvaVilagrer', 'funnTilTiltak'],
  tasks: ['funnTilTiltak', 'grunnlinjeEllerPuls', 'lesIndeksen'],
  settings: ['rollerOgTilgang', 'ansatteUtenHr', 'gdpr'],
  conn: ['entra', 'sms', 'ansatteUtenHr'],
  report: ['rapportTilTilsynet', 'hvaLovenKrever', 'lesIndeksen'],
}
const DEFAULT_ARTICLES = ['forsteTimen', 'lesIndeksen', 'hvaVilagrer']

/** The four setup steps and where each is done (bundle 3140-3145). */
const STEPS: { key: keyof SetupProgress; href: Route }[] = [
  { key: 'register', href: '/oppsett?fane=ansatte' as Route },
  { key: 'grupper', href: '/oppsett?fane=grupper' as Route },
  { key: 'arshjul', href: '/arshjulet' },
  { key: 'maling', href: '/malinger' },
]

const screenOf = (pathname: string) =>
  SCREENS.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? 'home'

const toggleClass = (on: boolean) =>
  `h-[34px] cursor-pointer rounded-ctl border border-line text-[12.5px] font-semibold text-ink ${
    on ? 'bg-sbg' : 'bg-transparent'
  }`

export function HeaderBar({
  logo,
  nav,
  trailing,
  lawMode,
  progress,
  assistantFace,
}: {
  logo: ReactNode
  nav: ReactNode
  /** the role selector and the account chip, rendered by the server header */
  trailing: ReactNode
  lawMode: boolean
  progress: SetupProgress | null
  assistantFace: string
}) {
  const t = useTranslations()
  const pathname = usePathname()
  const panelId = useId()
  const [panel, setPanel] = useState<{ mode: Mode; for: string } | null>(null)
  const [sciTab, setSciTab] = useState<SciTab>('forskning')

  const mode = panel && panel.for === pathname ? panel.mode : null
  const toggle = (m: Mode) =>
    setPanel((p) => (p && p.for === pathname && p.mode === m ? null : { mode: m, for: pathname }))

  const screen = screenOf(pathname)
  const helpKey = WITH_HELP.includes(screen) ? screen : 'home'
  const lawKey = WITH_LAW.includes(screen) ? screen : 'home'
  const tab: SciTab = lawMode ? sciTab : 'forskning'

  const step = (n: 's1' | 's2' | 's3') =>
    t(`headerPanel.screen.${helpKey}.${!lawMode && PLAIN_VARIANT[helpKey]?.includes(n) ? `${n}Plain` : n}`)
  const steps = [step('s1'), step('s2'), step('s3')]

  const articles = (ARTICLES[screen] ?? DEFAULT_ARTICLES)
    .map(articleByKey)
    .filter((a): a is NonNullable<typeof a> => a !== null && (lawMode || !a.lawOnly))

  const left = progress ? STEPS.filter((s) => !progress[s.key]).length : 0
  const avatar = { backgroundImage: `url(/tuva/${assistantFace}.png)` }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-sf">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-[18px] px-[28px] py-[11px]">
        {logo}
        {nav}

        <span className="flex flex-none items-center gap-[8px]">
          <button
            type="button"
            aria-label={t('header.helpAria')}
            aria-expanded={mode === 'help'}
            aria-controls={mode === 'help' ? panelId : undefined}
            onClick={() => toggle('help')}
            className={`flex items-center gap-[7px] px-[13px] ${toggleClass(mode === 'help')}`}
          >
            <span
              aria-hidden="true"
              className="flex h-[17px] w-[17px] items-center justify-center rounded-pill border-[1.5px] border-ink text-[11px] font-bold leading-none"
            >
              ?
            </span>
            {t('header.help')}
          </button>

          <button
            type="button"
            aria-label={t('headerPanel.grunnlagAria')}
            aria-expanded={mode === 'science'}
            aria-controls={mode === 'science' ? panelId : undefined}
            onClick={() => toggle('science')}
            className={`px-[13px] ${toggleClass(mode === 'science')}`}
          >
            {t('header.grunnlag')}
          </button>

          <button
            type="button"
            aria-label={t('header.assistantAria')}
            aria-expanded={mode === 'tuva'}
            aria-controls={mode === 'tuva' ? panelId : undefined}
            onClick={() => toggle('tuva')}
            className={`flex items-center gap-[7px] py-0 pl-[4px] pr-[13px] ${toggleClass(mode === 'tuva')}`}
          >
            <span
              aria-hidden="true"
              className="block h-[26px] w-[26px] flex-none rounded-btn bg-bg bg-cover bg-center"
              style={avatar}
            />
            Tuva
          </button>

          {trailing}
        </span>
      </div>

      {mode ? (
        <div id={panelId} className="border-t border-line bg-sbg">
          <div className="mx-auto flex max-w-[1180px] items-start gap-[16px] px-[28px] pb-[20px] pt-[18px]">
            <span className="min-w-0 flex-1">
              {mode === 'help' ? (
                <>
                  <span className="block text-[15px] font-bold">
                    {t(`headerPanel.screen.${helpKey}.title`)}
                  </span>
                  <span className="mt-[12px] grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
                    {steps.map((text, i) => (
                      <span key={i} className="flex items-start gap-[10px]">
                        <span className="flex h-[21px] w-[21px] flex-none items-center justify-center rounded-pill bg-ink text-[11px] font-bold text-sbg">
                          {i + 1}
                        </span>
                        <span className="text-[13px] leading-[1.55] [text-wrap:pretty]">{text}</span>
                      </span>
                    ))}
                  </span>
                  <span className="mt-[16px] flex flex-wrap items-end justify-between gap-[14px] border-t border-[rgba(25,21,16,.15)] pt-[14px]">
                    <span className="text-[11px] uppercase tracking-[.11em] text-mut">
                      {t('headerPanel.readMore')}
                    </span>
                    <Link
                      href="/hjelp"
                      className="flex h-[32px] items-center rounded-bar border border-ink bg-sf px-[13px] text-[12px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
                    >
                      {t('headerPanel.allHelp')}
                    </Link>
                  </span>
                  <span className="mt-[11px] grid gap-[9px] [grid-template-columns:repeat(auto-fit,minmax(215px,1fr))]">
                    {articles.map((a) => (
                      <Link
                        key={a.key}
                        href={`/hjelp/${a.key}` as Route}
                        className="block rounded-cta border border-line bg-sf px-[14px] py-[12px] text-left text-ink no-underline hover:text-ink hover:no-underline"
                      >
                        <span className="flex items-baseline justify-between gap-[10px]">
                          <span className="text-[10px] font-bold uppercase tracking-[.09em] text-mut">
                            {t(`hjelp.category.${a.category}`)}
                          </span>
                          <span className="text-[11px] text-mut">
                            {t('hjelp.readMinutes', { count: a.read })}
                          </span>
                        </span>
                        <span className="mt-[5px] block text-[13px] font-semibold leading-[1.35] [text-wrap:pretty]">
                          {t(`hjelp.article.${a.key}.title`)}
                        </span>
                      </Link>
                    ))}
                  </span>
                </>
              ) : null}

              {mode === 'science' ? (
                <>
                  {lawMode ? (
                    <span className="flex flex-wrap gap-[7px]">
                      {(['forskning', 'lov'] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          aria-pressed={tab === k}
                          onClick={() => setSciTab(k)}
                          className={`cursor-pointer rounded-pill border px-[14px] py-[7px] text-[12.5px] text-ink ${
                            tab === k ? 'border-ink bg-sf font-bold' : 'border-rule bg-transparent font-medium'
                          }`}
                        >
                          {t(`headerPanel.tabs.${k}`)}
                        </button>
                      ))}
                    </span>
                  ) : null}
                  <span className="mt-[13px] block text-[11px] uppercase tracking-[.11em] text-mut">
                    {t(`headerPanel.kicker.${tab}`)}
                  </span>
                  <span className="mt-[8px] block max-w-[820px] text-[13.5px] leading-[1.65] [text-wrap:pretty]">
                    {tab === 'lov'
                      ? t(`headerPanel.law.${lawKey}`)
                      : t(`headerPanel.screen.${helpKey}.sci`)}
                  </span>
                </>
              ) : null}

              {mode === 'tuva' ? (
                <span className="flex items-start gap-[13px]">
                  <span
                    aria-hidden="true"
                    className="block h-[38px] w-[38px] flex-none rounded-btn bg-sf bg-cover bg-center"
                    style={avatar}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold">{t('headerPanel.start.title')}</span>
                    {progress ? (
                      <>
                        <span className="mt-[2px] block text-[13px] leading-[1.5] text-mut">
                          {left > 0
                            ? t('headerPanel.start.left', { left, total: STEPS.length })
                            : t('headerPanel.start.done')}
                        </span>
                        <span className="mt-[13px] grid gap-[8px] [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                          {STEPS.map((s, i) => {
                            const ok = progress[s.key]
                            return (
                              <Link
                                key={s.key}
                                href={s.href}
                                className={`flex w-full items-center gap-[10px] rounded-btn border px-[12px] py-[10px] text-left text-ink no-underline hover:text-ink hover:no-underline ${
                                  ok ? 'border-link bg-mint' : 'border-rule bg-bg'
                                }`}
                              >
                                <span
                                  className={`flex h-[20px] w-[20px] flex-none items-center justify-center rounded-pill border-[1.5px] text-[11px] font-bold ${
                                    ok ? 'border-link text-greendeep' : 'border-rule text-mut'
                                  }`}
                                >
                                  {ok ? '✓' : i + 1}
                                </span>
                                <span
                                  className={`text-[13px] ${ok ? 'font-normal line-through' : 'font-semibold'}`}
                                >
                                  {t(`headerPanel.start.step.${s.key}`)}
                                </span>
                              </Link>
                            )
                          })}
                        </span>
                      </>
                    ) : null}
                    <span className="mt-[12px] block text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">
                      {t('headerPanel.start.tip', { tip: steps[0] ?? '' })}
                    </span>
                  </span>
                </span>
              ) : null}
            </span>

            <button
              type="button"
              aria-label={t('headerPanel.close')}
              onClick={() => setPanel(null)}
              className="h-[30px] w-[30px] flex-none cursor-pointer rounded-pill border border-ink bg-transparent p-0 text-[15px] leading-none text-ink"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}
    </header>
  )
}
