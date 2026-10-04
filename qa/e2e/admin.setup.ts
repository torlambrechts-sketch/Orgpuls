import { expect, test as setup } from '@playwright/test'
import { DEFAULT_DB, LOCAL_ADMIN, openAdmin } from '../../scripts/seed/sentral-fixture.mjs'
import { acquireAdminLock, totp } from '../../scripts/verify/admin-session.mjs'
import { ADMIN_STATE } from './admin'

/**
 * Signs the fixture's local admin in once for the admin projects (WP-0.7), through the real
 * sign-in: the password, then a TOTP factor enrolled on /admin/mfa and answered with a code from
 * the key the enrolment shows; nothing of it is printed. scripts/seed/sentral-fixture.mjs writes
 * the admin inactive and with no factor, and `openAdmin` activates it in the LOCAL database only
 * (the fixture refuses any other). The admin's lock is taken for the Playwright runner, this
 * worker's parent, so the admin's pixel gate waits; admin.teardown.ts retires the admin and gives
 * the lock back when the admin projects are done, however they end.
 */
setup('sign the local admin in @setup', async ({ page }) => {
  setup.setTimeout(180_000)
  await acquireAdminLock({ owner: process.ppid })
  openAdmin(DEFAULT_DB)
  await page.goto('/admin/login')
  await page.locator('input[name=email]').fill(LOCAL_ADMIN.email)
  await page.locator('input[name=password]').fill(LOCAL_ADMIN.password)
  await Promise.all([page.waitForURL('**/admin/mfa', { timeout: 30_000 }), page.locator('button[type=submit]').click()])
  await page.locator('main button').first().click()
  const secret = ((await page.locator('code').first().textContent({ timeout: 20_000 })) ?? '').trim()
  expect(secret.length, 'the enrolment shows its key').toBeGreaterThan(15)
  for (let attempt = 0; ; attempt++) {
    await page.locator('input[name=code]').fill(totp(secret))
    await page.locator('form button[type=submit]').click()
    const ok = await page.waitForURL((u) => u.pathname === '/admin', { timeout: 15_000 }).then(
      () => true,
      () => false,
    )
    if (ok) break
    // a code read at the very end of its 30 s window: the next one, once
    expect(attempt, 'the admin gets past /admin/mfa').toBe(0)
    await page.waitForTimeout(31_000 - (Date.now() % 30_000))
  }
  await page.context().storageState({ path: ADMIN_STATE })
})
