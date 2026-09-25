'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ENKEL_PATHS } from '@/lib/shell/nav'
import { PREF_COOKIE, PREF_MAX_AGE, type ShellPrefs } from '@/lib/shell/prefs'

/**
 * The shell's state on the client: the layout preferences (lib/shell/prefs.ts) and the
 * help panel. D-70.
 *
 * The preferences arrive from the server, which read the cookies, so the first paint is
 * already right. A change is applied at once and written back to the cookie. The design's
 * toggles are instant, and nothing here needs the server's confirmation. Enkel/Full also
 * refreshes the route, because what a screen shows in Enkel is decided on the server.
 * Choosing Enkel on a screen Enkel does not have goes to Innsikt, as the prototype does.
 *
 * The panel lives here rather than in the header because two controls open it: the
 * header's Hjelp button in the top layout, the rail's in the side layout. It belongs to
 * the screen it was opened on and reads as closed anywhere else, as the prototype's
 * `panelFor` does. Pressing Hjelp reopens the tab last chosen (`lastPanel`).
 */
export type PanelMode = 'help' | 'science' | 'tuva'

interface ShellState {
  prefs: ShellPrefs
  setPref: <K extends keyof ShellPrefs>(key: K, value: ShellPrefs[K]) => void
  /**
   * Go to a Full screen from Enkel. Oversikt's "Se alle tall", "Alle tiltak" and the rest
   * switch the view as they go, as the prototype's `viewMode:"full"` does, so the screen
   * arrives with the nav that reaches it.
   */
  goFull: (href: string) => void
  panel: PanelMode | null
  togglePanel: () => void
  pickPanel: (mode: PanelMode) => void
  closePanel: () => void
}

const Ctx = createContext<ShellState | null>(null)

function writeCookie(name: string, value: string) {
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${value}; Path=/; Max-Age=${PREF_MAX_AGE}; SameSite=Lax${secure}`
}

export function ShellPrefsProvider({ initial, children }: { initial: ShellPrefs; children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [prefs, setPrefs] = useState(initial)
  const [panelState, setPanelState] = useState<{ mode: PanelMode; for: string } | null>(null)
  const [lastPanel, setLastPanel] = useState<PanelMode>('help')

  const setPref = useCallback(
    <K extends keyof ShellPrefs>(key: K, value: ShellPrefs[K]) => {
      setPrefs((p) => ({ ...p, [key]: value }))
      writeCookie(PREF_COOKIE[key], value)
      if (key === 'view') {
        const inEnkel = ENKEL_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
        if (value === 'enkel' && !inEnkel) router.push('/innsikt')
        else router.refresh()
      }
    },
    [pathname, router],
  )

  const goFull = useCallback(
    (href: string) => {
      setPrefs((p) => ({ ...p, view: 'full' }))
      writeCookie(PREF_COOKIE.view, 'full')
      router.push(href as Parameters<typeof router.push>[0])
    },
    [router],
  )

  const panel = panelState && panelState.for === pathname ? panelState.mode : null

  const value = useMemo<ShellState>(
    () => ({
      prefs,
      setPref,
      goFull,
      panel,
      togglePanel: () => setPanelState(panel ? null : { mode: lastPanel, for: pathname }),
      pickPanel: (mode) => {
        setLastPanel(mode)
        setPanelState({ mode, for: pathname })
      },
      closePanel: () => setPanelState(null),
    }),
    [prefs, setPref, goFull, panel, lastPanel, pathname],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useShell(): ShellState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useShell outside ShellPrefsProvider')
  return v
}
