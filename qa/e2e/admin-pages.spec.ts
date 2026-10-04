import { expect, test, type Page } from '@playwright/test'
import { checkAdminPage, watchAdminConsole } from './admin'
import { ADMIN_ROUTES, type AdminRoute } from './admin-routes'

/**
 * Every admin page (WP-0.7; the brief's A8): opened at the project's width — 1440 in `admin`, 390
 * in `admin-phone` — with the smoke's checks (heading, no failed read, nothing sideways, axe, no
 * console error) and a full-page capture in test-results/shots/admin/<project>/, which
 * scripts/verify/admin-baseline-diff.mjs compares with the Phase A baseline so a change to an
 * existing page is seen and listed. Local, before each package:
 *
 *   QA_PORT=3400 npx playwright test --project admin --project admin-phone --grep '@setup|@pages'
 */
async function open(page: Page, r: AdminRoute) {
  if (!r.from) return page.goto(r.path, { waitUntil: 'networkidle' })
  await page.goto(r.from, { waitUntil: 'networkidle' })
  const href = await page
    .locator(`main a[href^="${r.path}"]`)
    .evaluateAll((as, prefix) => as.map((a) => a.getAttribute('href') ?? '').find((h) => h.length > prefix.length && !h.includes('?')) ?? null, r.path)
  expect(href, `${r.from} links to a ${r.path}… record`).not.toBeNull()
  return page.goto(href!, { waitUntil: 'networkidle' })
}

for (const r of ADMIN_ROUTES) {
  test(`${r.name} ${r.path}${r.from ? '[id]' : ''} @admin @pages`, async ({ page }, info) => {
    const errors = watchAdminConsole(page)
    const res = await open(page, r)
    expect(res?.status(), `${r.name} answers`).toBeLessThan(400)
    await page.screenshot({ path: `test-results/shots/admin/${info.project.name}/${r.name}.png`, fullPage: true, animations: 'disabled', caret: 'hide' })
    // known issues are per width: a page's phone layout can fail a rule its desktop one passes
    await checkAdminPage(page, info.project.name === 'admin-phone' ? `a-${r.name}@390` : `a-${r.name}`)
    expect(errors, `console on ${r.name}`).toEqual([])
  })
}
