import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from './fixtures'
import { checkScreen, flowToken, shotDir, watchConsole } from './respondent'

/**
 * The respondent flow under the pseudo-locale at 320 px (multilingual-gap-analysis, CI check 6).
 * Project `pseudo` only: the second QA server (port 3101, ORGPULS_PSEUDO=1) renders bokmål's
 * catalogue accented, about 40 % longer and bracketed (scripts/i18n/pseudo.mjs), so this is what
 * a longer language does to the survey on the narrowest phone it must work on.
 *
 * The gate on every screen: nothing scrolls sideways and no box's content is wider than the box,
 * or taller than a control or a clipping box (./respondent.ts); axe once per kind of screen; no
 * console error. The captures are artifacts for a person to look at, never baselines. The
 * statements themselves come from the database, not the catalogue, and stay in bokmål.
 */
const PSEUDO = '.pseudo/no.json'

test('respondent flow under the pseudo-locale @pseudo', async ({ page }) => {
  expect(existsSync(PSEUDO), `${PSEUDO} exists (scripts/qa/serve.mjs writes it when it starts the pseudo server)`).toBe(true)
  const m = JSON.parse(readFileSync(PSEUDO, 'utf8')).respond as Record<string, string>
  const dir = shotDir('pseudo')
  const errors = watchConsole(page)

  await page.goto(`/s/${flowToken('pseudo', 'no')}`)
  const next = page.getByRole('button', { name: m.next, exact: true })
  await expect(
    next,
    'the page renders the pseudo catalogue: if it shows «Neste», lib/i18n/request.ts does not pass its messages through pseudoMessages (lib/i18n/pseudo.ts)',
  ).toBeVisible()

  // bracketed like every message: «[1 / 33]»
  const progress = page.locator('main').getByText(/^\[?\d+ \/ \d+\]?$/)
  const total = Number((await progress.textContent())!.match(/\/ (\d+)/)![1])
  const kinds = new Set<string>()
  for (let n = 1; n <= total; n++) {
    await expect(progress).toHaveText(new RegExp(`^\\[?${n} / ${total}\\]?$`))
    const kind = await page
      .locator('main')
      .evaluate((el) => ['button[aria-pressed]', 'button[aria-expanded]', 'textarea'].map((s) => el.querySelectorAll(s).length).join('-'))
    const fresh = !kinds.has(kind)
    kinds.add(kind)
    const shot = `${dir}/q${String(n).padStart(2, '0')}.png`
    await checkScreen(page, 'r-question', { lang: null, axe: fresh, file: shot })

    const choices = page.locator('main button[aria-pressed]')
    const count = await choices.count()
    if (count > 0) await choices.nth(count - 1).click()
    else await page.locator('main textarea').fill('E2E')

    if (n === 1) {
      // the comment box open: the longest control text on the screen
      await page.locator('main button[aria-expanded]').click()
      await page.getByRole('textbox', { name: m.commentPrompt }).fill('E2E')
      await checkScreen(page, 'r-comment', { lang: null, file: `${dir}/comment.png` })
    }
    if (n < total) await next.click()
    else await page.getByRole('button', { name: m.submit, exact: true }).click()
  }

  await expect(page.locator('main').getByText('✓', { exact: true })).toBeVisible()
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0)
  await checkScreen(page, 'r-done', { lang: null, file: `${dir}/done.png` })
  expect(errors, 'no console error').toEqual([])
})
