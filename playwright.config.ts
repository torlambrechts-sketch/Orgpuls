import { defineConfig } from '@playwright/test'

/**
 * The QA harness (docs/implementation/engagement-phases.md § 2). Every test runs against the
 * Lumio AS tenant on the local Supabase stack, never a hosted project: the web server is
 * scripts/qa/serve.mjs, which reads the stack's URL from `supabase status`.
 *
 * Projects are viewports, and each carries only the screens that belong to it (§ 2.1):
 * respondent and employee screens on `mobile` and `small`, manager and public ones on
 * `desktop`. A test says which by its tag, `@respondent` or `@manager`.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium'
const PORT = Number(process.env.QA_PORT ?? 3100)

export default defineConfig({
  testDir: 'qa/e2e',
  outputDir: 'test-results',
  snapshotPathTemplate: 'qa/baselines/{projectName}/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [['list']],
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'nb-NO',
    timezoneId: 'Europe/Oslo',
    colorScheme: 'light',
    launchOptions: { executablePath, args: ['--no-sandbox', '--font-render-hinting=none'] },
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'mobile',
      grep: /@respondent|@employee/,
      use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
    {
      name: 'small',
      grep: /@respondent|@employee/,
      use: { viewport: { width: 360, height: 740 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    },
    {
      name: 'desktop',
      grep: /@manager|@public/,
      dependencies: ['setup'],
      use: { viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: 'node scripts/qa/serve.mjs',
    url: `http://localhost:${PORT}/logg-inn`,
    reuseExistingServer: true,
    timeout: 600_000,
  },
})
