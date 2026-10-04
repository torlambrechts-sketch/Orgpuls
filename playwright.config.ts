import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

/**
 * The QA harness (docs/implementation/engagement-phases.md § 2). Every test runs against the
 * Lumio AS tenant on the local Supabase stack, never a hosted project: the web server is
 * scripts/qa/serve.mjs, which reads the stack's URL from `supabase status`.
 *
 * Projects are viewports, and each carries only the screens that belong to it (§ 2.1):
 * respondent and employee screens on `mobile` and `small`, manager and public ones on
 * `desktop`. A test says which by its tag, `@respondent` or `@manager`.
 *
 * `tiny` (320 × 640) is the narrowest phone the survey must work on (multilingual-gap-analysis,
 * CI check 6). It runs the respondent tests that do not compare against a baseline: a step's
 * captures (@p0.2, @p1.2 …) have baselines at 390 and 360 only. `pseudo` is the same viewport
 * against a second server that renders the pseudo catalogue (scripts/i18n/pseudo.mjs); it runs
 * @pseudo and nothing else.
 */
const cloudChromium = '/opt/pw-browsers/chromium'
// the cloud image's Chromium (CLAUDE.md: never `playwright install` there); CI installs Playwright's own
const executablePath = process.env.PLAYWRIGHT_CHROMIUM ?? (existsSync(cloudChromium) ? cloudChromium : undefined)
const PORT = Number(process.env.QA_PORT ?? 3100)
const PSEUDO_PORT = Number(process.env.QA_PSEUDO_PORT ?? 3101)
const phone = { isMobile: true, hasTouch: true }

export default defineConfig({
  testDir: 'qa/e2e',
  outputDir: 'test-results',
  snapshotPathTemplate: 'qa/baselines/{projectName}/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'nb-NO',
    timezoneId: 'Europe/Oslo',
    colorScheme: 'light',
    // a failed CI run keeps its trace in the uploaded test-results (the flow's own test text only)
    trace: process.env.CI ? 'retain-on-failure' : 'off',
    launchOptions: { executablePath, args: ['--no-sandbox', '--font-render-hinting=none'] },
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'mobile',
      grep: /@respondent|@employee/,
      use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, ...phone },
    },
    {
      name: 'small',
      grep: /@respondent|@employee/,
      use: { viewport: { width: 360, height: 740 }, deviceScaleFactor: 1, ...phone },
    },
    {
      name: 'tiny',
      grep: /@respondent/,
      grepInvert: /@p\d+\.\d+/,
      use: { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, ...phone },
    },
    {
      name: 'pseudo',
      grep: /@pseudo/,
      use: { baseURL: `http://localhost:${PSEUDO_PORT}`, viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, ...phone },
    },
    {
      name: 'desktop',
      grep: /@manager|@public/,
      dependencies: ['setup'],
      use: { viewport: { width: 1280, height: 800 } },
    },
    // The admin (WP-0.7): signed in once as the fixture's local admin (qa/e2e/admin.setup.ts), retired
    // again after (admin.teardown.ts). `admin` runs the smoke, every page and the journeys at 1440,
    // `admin-phone` the smoke and every page at 390. Run scripts/seed/sentral-fixture.mjs first: it
    // writes the admin.
    { name: 'admin-setup', testMatch: /admin\.setup\.ts/, teardown: 'admin-teardown' },
    { name: 'admin-teardown', testMatch: /admin\.teardown\.ts/ },
    {
      name: 'admin',
      testMatch: /admin-.*\.spec\.ts/,
      grep: /@admin/,
      dependencies: ['admin-setup'],
      use: { viewport: { width: 1440, height: 900 }, storageState: 'qa/.auth/admin.json' },
    },
    {
      name: 'admin-phone',
      testMatch: /admin-(smoke|pages)\.spec\.ts/,
      grep: /@smoke|@pages/,
      dependencies: ['admin-setup'],
      // a plain 390 × 900 window, as the Phase A baseline was captured (docs/crm-enrichment/screens/baseline)
      use: { viewport: { width: 390, height: 900 }, storageState: 'qa/.auth/admin.json' },
    },
  ],
  // started in order: the first builds when there is no build, the second serves the same one
  webServer: [
    {
      command: 'node scripts/qa/serve.mjs',
      url: `http://localhost:${PORT}/logg-inn`,
      reuseExistingServer: true,
      timeout: 600_000,
    },
    {
      command: 'node scripts/qa/serve.mjs',
      url: `http://localhost:${PSEUDO_PORT}/logg-inn`,
      env: { QA_PORT: String(PSEUDO_PORT), ORGPULS_PSEUDO: '1' },
      reuseExistingServer: true,
      timeout: 600_000,
    },
  ],
})
