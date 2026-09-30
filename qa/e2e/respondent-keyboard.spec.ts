import no from '../../messages/no.json'
import { expect, test } from './fixtures'
import { watchConsole } from './respondent'

/**
 * A question's options are a radio group (WAI-ARIA APG; the deep audit of 2026-09-28, «Likert
 * options are aria-pressed buttons»): the group is named by its statement, each option is a
 * radio with aria-checked, Tab reaches one option per question, the arrow keys move and choose
 * (wrapping), Space chooses, and the focused option wears the bundle's focus ring (line 23).
 * The keyboard model itself is tests/unit/radiogroup.test.ts.
 *
 * Drift's first link, which the seed leaves unanswered: nothing here submits, so it stays fresh.
 * A choice made with the keyboard is kept like any other (P1-4): reloading restores it.
 */
const TOKEN = 'qa-lumio-drift-000001'

test('the options are a radio group, operable from the keyboard @respondent @flow', async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto(`/s/${TOKEN}`)
  await page.getByRole('button', { name: no.respond.start, exact: true }).click()

  // a page with more than one question (a factor's statements share one, D-150)
  const groups = page.locator('main [role=radiogroup]')
  const next = page.getByRole('button', { name: no.respond.next, exact: true })
  for (let i = 0; i < 40 && (await groups.count()) < 2; i++) await next.click()
  const count = await groups.count()
  expect(count, 'a page with several statements').toBeGreaterThan(1)

  // each question's options: one radiogroup named by its statement, radios only, nothing pressed
  const fieldsets = page.locator('main fieldset')
  await expect(fieldsets).toHaveCount(count)
  for (let g = 0; g < count; g++) {
    const legend = (await fieldsets.nth(g).locator('legend').textContent())!.trim()
    await expect(fieldsets.nth(g).getByRole('radiogroup', { name: legend, exact: true })).toHaveCount(1)
  }
  await expect(page.locator('main [aria-pressed]')).toHaveCount(0)

  const first = groups.nth(0).getByRole('radio')
  const n = await first.count()
  expect(n, 'the scale and «Ikke relevant for meg»').toBeGreaterThan(2)
  await expect(first.last()).toHaveAccessibleName(no.respond.notRelevant)
  await expect(groups.nth(0).locator('[role=radio][aria-checked=true]')).toHaveCount(0)

  // one tab stop per group: from the first group's option, Tab visits every other group once
  for (let g = 0; g < count; g++) await expect(groups.nth(g).locator('[tabindex="0"]')).toHaveCount(1)
  await first.first().focus()
  const visited: number[] = []
  for (let i = 0; i < 4 * count + 4; i++) {
    await page.keyboard.press('Tab')
    const at = await page.evaluate(() => {
      const el = document.activeElement
      const group = el?.closest('[role=radiogroup]')
      return group ? Array.from(document.querySelectorAll('main [role=radiogroup]')).indexOf(group) : -1
    })
    if (at >= 0) visited.push(at)
    if (visited.length === count - 1) break
  }
  expect(visited, 'Tab lands once in each following group, never twice in one').toEqual(Array.from({ length: count - 1 }, (_, i) => i + 1))

  // Space chooses the focused option: Tab has stopped in the last group, on its first option
  const second = groups.nth(count - 1).getByRole('radio')
  await expect(second.first()).toBeFocused()
  await page.keyboard.press(' ')
  await expect(second.first()).toHaveAttribute('aria-checked', 'true')

  // the arrow keys move and choose, wrapping at both ends
  await first.first().focus()
  await page.keyboard.press('ArrowDown')
  await expect(first.nth(1)).toBeFocused()
  await expect(first.nth(1)).toHaveAttribute('aria-checked', 'true')
  await expect(first.nth(0)).toHaveAttribute('aria-checked', 'false')
  await page.keyboard.press('ArrowRight')
  await expect(first.nth(2)).toBeFocused()
  await expect(first.nth(2)).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowLeft')
  await expect(first.nth(0)).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(first.nth(n - 1), 'Up from the first wraps to «Ikke relevant for meg»').toBeFocused()
  await expect(first.nth(n - 1)).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('ArrowDown')
  await expect(first.nth(0), 'Down from the last wraps to the first').toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(first.nth(2)).toHaveAttribute('aria-checked', 'true')
  await expect(groups.nth(0).locator('[role=radio][aria-checked=true]')).toHaveCount(1)
  // the other group kept its own choice
  await expect(second.first()).toHaveAttribute('aria-checked', 'true')

  // the tab stop follows the choice, and the focused option wears the bundle's focus ring
  await expect(groups.nth(0).locator('[tabindex="0"]')).toHaveCount(1)
  await expect(first.nth(2)).toHaveAttribute('tabindex', '0')
  const ring = await first.nth(2).evaluate((el) => {
    const s = getComputedStyle(el)
    return { visible: el.matches(':focus-visible'), outline: `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`, offset: s.outlineOffset }
  })
  expect(ring).toEqual({ visible: true, outline: '3px solid rgb(25, 21, 16)', offset: '2px' })

  // the choices are kept on the device like any other (P1-4): a reload restores them
  const progress = await page.locator('main').getByText(/^\d+ \/ \d+$/).textContent()
  await page.waitForTimeout(300)
  await page.reload()
  await expect(page.getByRole('status').filter({ hasText: no.respond.restored })).toBeVisible()
  await expect(page.locator('main').getByText(/^\d+ \/ \d+$/)).toHaveText(progress!)
  await expect(groups.nth(0).getByRole('radio').nth(2)).toHaveAttribute('aria-checked', 'true')
  await expect(groups.nth(count - 1).getByRole('radio').first()).toHaveAttribute('aria-checked', 'true')

  expect(errors, 'no console error').toEqual([])
})
