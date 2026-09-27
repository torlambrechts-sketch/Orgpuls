import { test as setup } from '@playwright/test'
import { authFile, QA_PASSWORD, QA_USERS, type QaUser } from './fixtures'

/** Signs each QA user in once, through the real sign-in page, and keeps the session. */
for (const user of Object.keys(QA_USERS) as QaUser[]) {
  setup(`sign in ${user} @setup`, async ({ page }) => {
    await page.goto('/logg-inn')
    await page.getByLabel(/e-post|email/i).fill(QA_USERS[user])
    await page.getByLabel(/passord|password/i).fill(QA_PASSWORD)
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith('/logg-inn'), { timeout: 30_000 }),
      page.getByRole('button', { name: /logg inn|sign in/i }).click(),
    ])
    await page.context().storageState({ path: authFile(user) })
  })
}
