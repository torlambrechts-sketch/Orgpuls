import { shoot } from '../visual/shoot'
import { authFile, expect, test } from './fixtures'

/**
 * P0.2: baselines of the screens the engagement work will change, as they are today. Their
 * pre-existing issues are recorded in qa/reports/phase-0.md, not fixed (§ P0.2).
 *
 * The respondent screens use Drift's first link (`qa-lumio-drift-000001`), which the seed leaves
 * unanswered; nothing here submits, so the link stays fresh for the next run.
 */
test.describe('respondent @respondent @p0.2', () => {
  test('r-intro, r-question, r-submit', async ({ page }) => {
    await page.goto('/s/qa-lumio-drift-000001')
    // today the flow has no intro of its own: the first screen is statement 1 (P0 report)
    await expect(page.getByRole('button', { name: 'Neste' })).toBeVisible()
    await shoot(page, 'r-intro')
    await page.getByRole('button', { name: 'Litt enig' }).click()
    await shoot(page, 'r-question')
    const skip = page.getByRole('button', { name: 'Hopp over' })
    while (!(await page.getByRole('button', { name: 'Send inn' }).isVisible())) await skip.click()
    await shoot(page, 'r-submit')
  })
})

test.describe('manager @manager @p0.2', () => {
  test.use({ storageState: authFile('kari') })
  test('m-results', async ({ page }) => {
    await page.goto('/resultater')
    await shoot(page, 'm-results')
  })
  test('m-factor', async ({ page }) => {
    await page.goto('/resultater?faktor=mengde')
    await shoot(page, 'm-factor')
  })
  test('m-actions', async ({ page }) => {
    await page.goto('/tiltak')
    await shoot(page, 'm-actions')
  })
  test('m-comments', async ({ page }) => {
    await page.goto('/kommentarer')
    await shoot(page, 'm-comments')
  })
})
