import { readFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/**
 * What the admin suites check on every page they open (WP-0.7, D-224): the page drew its heading;
 * no reader failed and nothing was refused (the admin's two texts for those, from the messages,
 * since a failed read renders as a sentence and not as an error); the page does not scroll
 * sideways — a table may scroll inside its own region, as the admin's tables do; and axe finds no
 * serious or critical violation beyond one recorded for that page in qa/known-issues.json, the
 * rule and the file the respondent suites use. The admin signs in as the fixture's local admin, a
 * super-admin, so a refusal on these pages is a fault.
 */
export const ADMIN_STATE = 'qa/.auth/admin.json'

const en = JSON.parse(readFileSync('messages/en.json', 'utf8'))
const FAILED: string = en.admin.common.failed
const NOT_ALLOWED: string = en.admin.common.notAllowed
const known: Record<string, string[]> = JSON.parse(readFileSync('qa/known-issues.json', 'utf8'))

export async function checkAdminPage(page: Page, id: string, opts: { axe?: boolean } = {}) {
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('main h1').first(), `${id}: the page's heading`).toBeVisible()
  const text = await page.locator('main').first().innerText()
  expect(text.includes(FAILED), `${id}: a reader failed («${FAILED}»)`).toBe(false)
  expect(text.includes(NOT_ALLOWED), `${id}: the page was refused («${NOT_ALLOWED}»)`).toBe(false)
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(sideways, `${id}: the page scrolls sideways by ${sideways}px`).toBeLessThanOrEqual(0)
  if (opts.axe === false) return
  const axe = await new AxeBuilder({ page }).analyze()
  const allowed = new Set(known[id] ?? [])
  const blocking = axe.violations.filter((v) => (v.impact === 'serious' || v.impact === 'critical') && !allowed.has(v.id))
  expect(
    blocking.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    `axe on ${id}`,
  ).toEqual([])
}

/**
 * Console errors and uncaught exceptions, from the moment this is called. One message is the
 * harness's, not the page's: axe tries to enter every frame, and the campaign previews are
 * sandboxed iframes that run no script by design (CampaignStudio), so each attempt is logged as
 * «Blocked script execution in 'about:srcdoc'». A page loaded without axe logs none of them.
 */
export function watchAdminConsole(page: Page) {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith("Blocked script execution in 'about:srcdoc'")) errors.push(`console: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  return errors
}

/** A name no other run uses, so a journey finds its own rows and nothing else */
export const runName = (what: string) => `${what} ${new Date().toISOString().slice(11, 19).replaceAll(':', '')}-${Math.floor(Math.random() * 1000)}`
