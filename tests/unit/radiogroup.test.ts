import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChoiceGroup } from '@/components/respond/ChoiceGroup'
import { arrowTarget, tabStop } from '@/lib/respond/radiogroup'

/**
 * A question's options are a radio group (WAI-ARIA APG; the deep audit of 2026-09-28): the
 * keyboard model, and the roles and tab stops the respondent flow renders. The browser half —
 * focus moving with the arrow keys, Tab reaching one option per question — is
 * qa/e2e/respondent-keyboard.spec.ts.
 */
describe('arrowTarget', () => {
  it('moves forward with Down and Right, back with Up and Left, wrapping', () => {
    expect(arrowTarget('ArrowDown', 0, 6)).toBe(1)
    expect(arrowTarget('ArrowRight', 4, 6)).toBe(5)
    expect(arrowTarget('ArrowDown', 5, 6)).toBe(0)
    expect(arrowTarget('ArrowUp', 3, 6)).toBe(2)
    expect(arrowTarget('ArrowLeft', 0, 6)).toBe(5)
  })
  it('leaves every other key to the browser and the flow', () => {
    for (const k of [' ', 'Enter', 'Tab', '1', 'Home', 'End', 'a']) expect(arrowTarget(k, 2, 6)).toBeNull()
    expect(arrowTarget('ArrowDown', 0, 0)).toBeNull()
  })
})

describe('tabStop', () => {
  it('is the chosen option, else the first', () => {
    expect(tabStop([1, 2, 3, 4, 5, 0], undefined)).toBe(0)
    expect(tabStop([1, 2, 3, 4, 5, 0], 4)).toBe(3)
    // «Ikke relevant for meg» is 0 and last
    expect(tabStop([1, 2, 3, 4, 5, 0], 0)).toBe(5)
    expect(tabStop([1, 2, 3], 9)).toBe(0)
  })
})

describe('ChoiceGroup', () => {
  const options = [1, 2, 3, 4, 5].map((value) => ({ value, label: `valg ${value}` }))
  const render = (value: number | undefined, apart = true) =>
    renderToStaticMarkup(
      createElement(ChoiceGroup, {
        labelledBy: 'q-legend',
        options,
        apart: apart ? { value: 0, label: 'Ikke relevant for meg' } : null,
        value,
        onChange: () => {},
      }),
    )
  const radios = (html: string) => html.match(/<button[^>]*>/g) ?? []

  it('is one radiogroup named by the statement, the not-relevant option in it', () => {
    const html = render(undefined)
    expect(html.match(/role="radiogroup"/g)).toHaveLength(1)
    expect(html).toContain('aria-labelledby="q-legend"')
    expect(radios(html)).toHaveLength(6)
    for (const b of radios(html)) {
      expect(b).toContain('role="radio"')
      expect(b).not.toContain('aria-pressed')
    }
  })

  it('checks exactly the chosen option and gives the group one tab stop', () => {
    const none = radios(render(undefined))
    expect(none.filter((b) => b.includes('aria-checked="true"'))).toHaveLength(0)
    expect(none.map((b) => b.match(/tabindex="(-?\d)"/)![1])).toEqual(['0', '-1', '-1', '-1', '-1', '-1'])

    const third = radios(render(3))
    expect(third.map((b) => b.includes('aria-checked="true"'))).toEqual([false, false, true, false, false, false])
    expect(third.map((b) => b.match(/tabindex="(-?\d)"/)![1])).toEqual(['-1', '-1', '0', '-1', '-1', '-1'])

    const na = radios(render(0))
    expect(na.map((b) => b.includes('aria-checked="true"'))).toEqual([false, false, false, false, false, true])
    expect(na.at(-1)).toContain('tabindex="0"')
  })

  it('without a not-relevant option has only the scale', () => {
    expect(radios(render(undefined, false))).toHaveLength(5)
  })
})
