'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'
import { useId, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { articleByKey } from '@/lib/help/articles'
import type { SetupProgress } from '@/lib/shell/read'
import { labelOf, navState, type NavEntry } from '@/lib/shell/nav'
import { AppNav } from './AppNav'
import { useShell, type PanelMode } from './ShellPrefs'

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
 * Design 3 gives the three one button, "Hjelp" with Tuva's face, and puts the modes on a
 * row of tabs inside the panel; the button reopens the tab last chosen. The panel's state
 * lives in ShellPrefs, because in the side layout the rail's Hjelp opens it. The bar
 * around it carries the layout toggle and the Enkel/Full switch (D-70). The help site is
 * one step further, behind the panel's own "Hele hjelpesiden →". Everything inside the
 * panel that changes the address is a link styled as the bundle's button (D-06). D-48.
 *
 * The texts are the design's, per screen, in `headerPanel.*`. A screen the design has no
 * entry for falls back to Innsikt's, as `H[scr] || H.home` does; the law text falls back
 * the same way, and Rapport has one of its own.
 */

type Mode = PanelMode
type SciTab = 'forskning' | 'lov'

const SCREENS: [string, string][] = [
  ['/innsikt', 'home'],
  ['/malinger', 'measure'],
  ['/maleoppsett', 'plan'],
  ['/resultater', 'result'],
  ['/kommentarer', 'conv'],
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
  { key: 'arshjul', href: '/malinger?fane=arshjul' as Route },
  { key: 'maling', href: '/malinger' },
]

const screenOf = (pathname: string) =>
  SCREENS.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? 'home'

const PANEL_TABS: Mode[] = ['help', 'science', 'tuva']

export function HeaderBar({
  logo,
  items,
  trailing,
  lawMode,
  progress,
  assistantFace,
}: {
  logo: ReactNode
  /** the nav model (lib/shell/nav.ts), shared with the side rail */
  items: NavEntry[]
  /** the role selector and the account chip, rendered by the server header */
  trailing: ReactNode
  lawMode: boolean
  progress: SetupProgress | null
  assistantFace: string
}) {
  const t = useTranslations()
  const pathname = usePathname()
  const panelId = useId()
  const { prefs, setPref, panel: mode, togglePanel, pickPanel, closePanel } = useShell()
  const [sciTab, setSciTab] = useState<SciTab>('forskning')
  const side = prefs.layout === 'side'

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

  // the side layout's page title: the screen's own nav label, as the prototype's `curLabel`
  const current = items.find((i) => navState(i, pathname) === 'current')
  const title = current ? labelOf(current, prefs.view) : ''

  const tabLabel = (m: Mode) =>
    m === 'help' ? t('headerPanel.tab.help') : m === 'science' ? t(lawMode ? 'headerPanel.tab.scienceLaw' : 'headerPanel.tab.science') : 'Tuva'

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-sf">
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-[12px] gap-y-[10px] px-[16px] py-[11px] md:gap-[18px] md:px-[28px]">
        {/* in the side layout the rail carries the brand and the nav, except on a phone */}
        <span className={side ? 'contents md:hidden' : 'contents'}>
          {logo}
          <AppNav items={items} ariaLabel={t('nav.primaryAria')} />
        </span>
        {side ? (
          <span className="min-w-0 flex-auto font-display text-[17px] font-semibold max-md:hidden">{title}</span>
        ) : null}

        <span className="flex flex-none items-center gap-[8px] max-md:ml-auto">
          <button
            type="button"
            title={side ? t('header.layoutToTop') : t('header.layoutToSide')}
            aria-label={side ? t('header.layoutToTop') : t('header.layoutToSide')}
            onClick={() => setPref('layout', side ? 'top' : 'side')}
            className="flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-ctl border border-line bg-transparent p-0 text-ink max-md:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="1.5" y="2" width="13" height="12" rx="2" stroke="#191510" strokeWidth="1.5" />
              <path d={side ? 'M1.5 5.5h13' : 'M6 2v12'} stroke="#191510" strokeWidth="1.5" />
            </svg>
          </button>

          <button
            type="button"
            aria-label={t('header.helpAria')}
            aria-expanded={mode !== null}
            aria-controls={mode ? panelId : undefined}
            onClick={togglePanel}
            className={`flex h-[34px] cursor-pointer items-center gap-[8px] rounded-ctl border py-0 pl-[4px] pr-[13px] text-[12.5px] font-semibold text-ink max-md:pr-[4px] ${
              mode ? 'border-ink bg-sbg' : 'border-line bg-transparent'
            } ${side ? 'md:hidden' : ''}`}
          >
            <span
              aria-hidden="true"
              className="block h-[26px] w-[26px] flex-none rounded-btn bg-bg bg-cover bg-center bg-no-repeat"
              style={avatar}
            />
            {/* on a phone the face carries it; the aria-label already names the control */}
            <span className="max-md:hidden">{t('header.help')}</span>
          </button>

          <span
            role="group"
            aria-label={t('header.modeAria')}
            title={t('header.modeTitle')}
            className="flex rounded-bar bg-track p-[2px]"
          >
            {(['enkel', 'full'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={prefs.view === v}
                onClick={() => prefs.view !== v && setPref('view', v)}
                className={`cursor-pointer rounded-[7px] border-none px-[11px] py-[6px] text-[12px] font-bold ${
                  prefs.view === v ? 'bg-ink text-bg' : 'bg-transparent text-mut'
                }`}
              >
                {v === 'enkel' ? t('header.modeEnkel') : t('header.modeFull')}
              </button>
            ))}
          </span>

          {trailing}
        </span>
      </div>

      {mode ? (
        <div id={panelId} className="border-t border-line bg-sbg">
          <div className="mx-auto flex max-w-page items-start gap-[16px] px-[16px] pb-[20px] pt-[14px] md:px-[28px]">
            <span className="min-w-0 flex-1">
              <span
                role="group"
                aria-label={t('headerPanel.tabsAria')}
                className="mb-[14px] flex w-fit gap-[4px] rounded-btn bg-[rgba(25,21,16,.06)] p-[3px]"
              >
                {PANEL_TABS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => pickPanel(m)}
                    className={`flex cursor-pointer items-center gap-[7px] rounded-[8px] border-none px-[13px] py-[6px] text-[12.5px] text-ink ${
                      mode === m ? 'bg-sf font-bold' : 'bg-transparent font-medium'
                    }`}
                  >
                    {m === 'tuva' ? (
                      <span
                        aria-hidden="true"
                        className="block h-[20px] w-[20px] rounded-[7px] bg-bg bg-cover bg-center bg-no-repeat"
                        style={avatar}
                      />
                    ) : null}
                    {tabLabel(m)}
                  </button>
                ))}
              </span>
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
              onClick={closePanel}
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
