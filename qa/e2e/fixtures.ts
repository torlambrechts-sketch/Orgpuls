import { test as base } from '@playwright/test'

/**
 * Every QA page runs at 10:00 Oslo time on the day the seed was built around, three days into
 * hovedmåling 2. § 2.2 names 15 October 2026; only the browser's clock can be frozen, and the
 * server and database would disagree with it, so the seed anchors the open round to today and
 * the browser is frozen at today 10:00 (DEVIATIONS D-121).
 */
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(new Date())
export const QA_NOW = new Date(new Date(`${today}T10:00:00Z`).getTime() - osloOffsetMs(today))

function osloOffsetMs(day: string) {
  const d = new Date(`${day}T12:00:00Z`)
  const oslo = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Oslo' }))
  const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }))
  return oslo.getTime() - utc.getTime()
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(QA_NOW)
    await use(page)
  },
})
export { expect } from '@playwright/test'

/** The five QA logins (scripts/qa/seed.mjs). */
export const QA_USERS = {
  kari: 'kari@lumio.example',
  hanne: 'hanne@lumio.example',
  per: 'per@lumio.example',
  siri: 'siri@lumio.example',
  jonas: 'jonas@lumio.example',
} as const
export type QaUser = keyof typeof QA_USERS
export const QA_PASSWORD = 'qa-local-only'
export const authFile = (u: QaUser) => `qa/.auth/${u}.json`
