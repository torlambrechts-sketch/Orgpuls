import { describe, expect, it } from 'vitest'
import { parsePrefs, PREF_COOKIE } from '@/lib/shell/prefs'
import { labelOf, navState, NAV_ROUTES, visibleNav, type NavEntry } from '@/lib/shell/nav'

const jar = (values: Record<string, string>) => (name: string) => values[name]

describe('parsePrefs', () => {
  it('falls back to the defaults when nothing is stored', () => {
    expect(parsePrefs(jar({}), 'full')).toEqual({ view: 'full', layout: 'top', rail: 'open' })
    expect(parsePrefs(jar({}), 'enkel').view).toBe('enkel')
  })

  it('reads what was stored', () => {
    const read = jar({ [PREF_COOKIE.view]: 'enkel', [PREF_COOKIE.layout]: 'side', [PREF_COOKIE.rail]: 'closed' })
    expect(parsePrefs(read, 'full')).toEqual({ view: 'enkel', layout: 'side', rail: 'closed' })
  })

  it('never trusts a value it does not know', () => {
    const read = jar({ [PREF_COOKIE.view]: 'admin', [PREF_COOKIE.layout]: '<script>', [PREF_COOKIE.rail]: '' })
    expect(parsePrefs(read, 'full')).toEqual({ view: 'full', layout: 'top', rail: 'open' })
  })
})

const entries: NavEntry[] = NAV_ROUTES.map((r) => ({
  ...r,
  label: r.key,
  enkelLabel: r.key === 'innsikt' ? 'oversikt' : undefined,
  badge: null,
}))
const byKey = (k: string) => entries.find((e) => e.key === k)!

describe('navState', () => {
  it('marks the screen and anything below it as current', () => {
    expect(navState(byKey('resultater'), '/resultater')).toBe('current')
    expect(navState(byKey('oppsett'), '/oppsett')).toBe('current')
  })

  it('keeps Målinger tinted on the screens reached from it', () => {
    // Årshjulet is a tab of Målinger now (D-74), so it is Målinger itself, not a screen below it
    for (const path of ['/maleoppsett', '/forhandsvis', '/malinger/ny']) {
      expect(navState(byKey('malinger'), path)).toBe(path === '/malinger/ny' ? 'current' : 'trail')
    }
  })

  it('does not confuse a prefix with a screen', () => {
    expect(navState(byKey('innsikt'), '/innsiktx')).toBeNull()
    expect(navState(byKey('resultater'), '/rapport')).toBeNull()
  })
})

describe('Enkel', () => {
  it('shows Oversikt and Oppsett only, with Innsikt renamed', () => {
    const shown = visibleNav(entries, 'enkel')
    expect(shown.map((e) => e.key)).toEqual(['innsikt', 'oppsett'])
    expect(shown.map((e) => labelOf(e, 'enkel'))).toEqual(['oversikt', 'oppsett'])
  })

  it('leaves Full untouched', () => {
    expect(visibleNav(entries, 'full')).toHaveLength(6)
    expect(labelOf(byKey('innsikt'), 'full')).toBe('innsikt')
  })
})
