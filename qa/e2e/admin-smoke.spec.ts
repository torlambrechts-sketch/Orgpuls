import { expect, test } from '@playwright/test'
import { checkAdminPage, watchAdminConsole } from './admin'

/**
 * The admin's smoke (WP-0.7, DEC-38): signed in as the fixture's local admin, the overview and the
 * CRM's main pages open, draw their heading, fail no read, scroll nothing sideways, pass axe and
 * log no console error. This is the part CI runs on every pull request (`--project admin --grep
 * @smoke`, about a minute); the journeys (admin-journeys.spec.ts) and the same pages at 390 px
 * (`--project admin-phone`) run locally before each package.
 */
const PAGES = [
  { id: 'a-overview', path: '/admin' },
  { id: 'a-crm', path: '/admin/crm' },
  { id: 'a-prospects', path: '/admin/crm/prospects' },
  { id: 'a-pipeline', path: '/admin/crm/pipeline' },
  { id: 'a-contacts', path: '/admin/crm/contacts' },
  { id: 'a-ops', path: '/admin/ops' },
] as const

for (const p of PAGES) {
  test(`${p.id} ${p.path} @admin @smoke`, async ({ page }, info) => {
    const errors = watchAdminConsole(page)
    const res = await page.goto(p.path, { waitUntil: 'networkidle' })
    expect(res?.status(), `${p.path} answers`).toBeLessThan(400)
    // a session that was not let in lands on the sign-in page instead
    expect(new URL(page.url()).pathname, `${p.path} stays signed in`).toBe(p.path)
    await checkAdminPage(page, info.project.name === 'admin-phone' ? `${p.id}@390` : p.id)
    expect(errors, `console on ${p.path}`).toEqual([])
  })
}
