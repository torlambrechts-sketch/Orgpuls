import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

/**
 * The landing-page tests (docs/landingsside-gjennomgang.md 8): layout and screenshots,
 * against a running server — `npx next build && npx next start`, then
 *
 *   npx playwright test tests/landing-layout.spec.ts
 *   SHOT_LABEL=before npx playwright test tests/landing-screenshots.spec.ts
 *
 * BASE_URL points them elsewhere. The browser is the one the other scripts use: the cloud
 * image's Chromium where it exists, Playwright's own (CI installs it) everywhere else.
 */
const IMAGE_CHROMIUM = '/opt/pw-browsers/chromium'

export default defineConfig({
  testDir: 'tests',
  testMatch: 'landing-*.spec.ts',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    launchOptions: {
      args: ['--no-sandbox'],
      ...(existsSync(IMAGE_CHROMIUM) ? { executablePath: IMAGE_CHROMIUM } : {}),
    },
  },
})
