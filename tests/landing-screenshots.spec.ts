import { test } from '@playwright/test'

/**
 * docs/landingsside-gjennomgang.md 2 and 8: every landing page at 375, 768 and 1440 px, in
 * the light and the dark colour scheme, full page, before and after a change:
 *
 *   SHOT_LABEL=before npx playwright test tests/landing-screenshots.spec.ts
 *   SHOT_LABEL=after  npx playwright test tests/landing-screenshots.spec.ts
 *
 * Written to tests/screenshots/<page>-<width>-<scheme>-<label>.png, which git ignores.
 */
const pages = ['/', '/lovkrav', '/verneombud', '/smaa-bedrifter', '/bygg-og-anlegg']
const label = process.env.SHOT_LABEL ?? 'after'

for (const path of pages) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`screenshots ${path} ${scheme}`, async ({ browser }) => {
      for (const width of [375, 768, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme })
        const page = await context.newPage()
        await page.goto(path, { waitUntil: 'networkidle' })
        // lazy pictures load as they come into view; scroll through once, then back to the top
        const height = await page.evaluate(() => document.documentElement.scrollHeight)
        for (let y = 0; y < height; y += 700) await page.evaluate((top) => window.scrollTo(0, top), y)
        await page.waitForLoadState('networkidle')
        await page.evaluate(() => window.scrollTo(0, 0))
        const name = path === '/' ? 'forside' : path.slice(1)
        await page.screenshot({ path: `tests/screenshots/${name}-${width}-${scheme}-${label}.png`, fullPage: true })
        await context.close()
      }
    })
  }
}
