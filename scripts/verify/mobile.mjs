/**
 * Captures routes at phone width and reports what is broken there, measurably.
 *
 * The pixel gate compares against the design's baselines, and every baseline is 1440 px
 * wide — the bundle has no phone rendering. So nothing checked how a screen behaves on a
 * phone until a user opened /registrer on one and found the form squeezed into a 60 px
 * column beside the sales card (D-50). This script is that check.
 *
 * Two failures are measured rather than eyeballed:
 *
 *   overflow   the document is wider than the viewport, so the page scrolls sideways
 *   squeezed   running text laid out at fewer than two words a line over three or more
 *              lines — the symptom of a multi-column grid that never collapses
 *
 * Screenshots are written for everything else a person has to look at.
 *
 *   node scripts/verify/mobile.mjs --out artifacts/mobile / /registrer /logg-inn
 *   node scripts/verify/mobile.mjs --out artifacts/mobile --signin /innsikt /malinger
 *
 * `--signin` uses ORGPULS_DEV_EMAIL / ORGPULS_DEV_PASSWORD, as shoot.mjs does.
 * Exits 1 if any route scrolls sideways or squeezes text below 48 px; milder wrapping is a
 * warning, because a label wrapping onto two lines in a narrow table cell is not a defect.
 */
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const routes = argv.filter((a, i) => a.startsWith('/') && !['--out', '--base', '--width'].includes(argv[i - 1]))
const outDir = arg('out', 'artifacts/mobile')
const base = arg('base', 'http://localhost:3000')
const width = Number(arg('width', '390'))
const FAIL_WIDTH = 48

const env = { ...process.env }
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !env[m[1]]) env[m[1]] = m[2]
  }
}

const EXECUTABLES = [
  env.PLAYWRIGHT_BROWSERS_PATH && `${env.PLAYWRIGHT_BROWSERS_PATH}/chromium`,
  '/opt/pw-browsers/chromium',
  '/opt/ms-playwright/chromium/chrome-linux/chrome',
].filter(Boolean)
const executablePath = EXECUTABLES.find((p) => existsSync(p))

const browser = await chromium.launch(executablePath ? { executablePath } : {})
const context = await browser.newContext({
  viewport: { width, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
const page = await context.newPage()

if (flag('signin')) {
  if (!env.ORGPULS_DEV_EMAIL || !env.ORGPULS_DEV_PASSWORD) {
    console.error('--signin needs ORGPULS_DEV_EMAIL and ORGPULS_DEV_PASSWORD')
    process.exit(2)
  }
  await page.goto(`${base}/logg-inn`, { waitUntil: 'networkidle' })
  await page.getByLabel(/e-post|email/i).fill(env.ORGPULS_DEV_EMAIL)
  await page.getByLabel(/passord|password/i).fill(env.ORGPULS_DEV_PASSWORD)
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/logg-inn'), { timeout: 15000 }),
    page.getByRole('button', { name: /logg inn|sign in/i }).click(),
  ])
}

mkdirSync(outDir, { recursive: true })
let failed = 0

for (const route of routes) {
  await page.goto(`${base}${route}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)

  // measured against the device width, not innerWidth: with mobile emulation the browser
  // widens its layout viewport to fit content that will not shrink, and innerWidth then
  // reports the widened value — which hides exactly the overflow this is looking for
  const report = await page.evaluate((vw) => {
    const overflow = document.documentElement.scrollWidth - vw
    // running text: an element whose own text has at least four words
    const squeezed = []
    for (const el of document.querySelectorAll('body *')) {
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join(' ')
      const words = own.split(/\s+/).filter(Boolean).length
      if (words < 4) continue
      const r = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || style.visibility === 'hidden') continue
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.3
      const lines = Math.max(1, Math.round(r.height / lineHeight))
      // fewer than two words a line over three or more lines: a column that never collapsed
      if (lines >= 3 && words / lines < 2) {
        squeezed.push({ width: Math.round(r.width), text: `${el.tagName.toLowerCase()} ${Math.round(r.width)}px "${own.slice(0, 40)}"` })
      }
    }
    // what sticks out past the right edge, so an overflow names its cause
    const wide = []
    if (overflow > 1) {
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect()
        // the outermost culprit: wider than the device, and its parent is not
        const parent = el.parentElement?.getBoundingClientRect()
        if (r.right > vw + 1 && r.width > 0 && (!parent || parent.right <= vw + 1 || parent.width < r.width)) {
          const scroller = el.closest('[class*="overflow-x-auto"], [class*="overflow-auto"]')
          if (!scroller) wide.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 4).join('.')} w=${Math.round(r.width)}`)
        }
      }
    }
    return { overflow, squeezed: squeezed.slice(0, 6), wide: wide.slice(0, 6) }
  }, width)

  // a query string names the file too, in characters every file system and CI artifact accepts
  const file = join(outDir, `${route.replace(/^\//, '').replace(/[/?&=]/g, '-') || 'root'}.png`)
  await page.screenshot({ path: file, fullPage: true })

  // failures: the page scrolls sideways, or text is squeezed below FAIL_WIDTH (the /registrer
  // bug was 8 px). Milder wrapping is printed as a warning for a person to look at.
  const severe = report.squeezed.filter((q) => q.width < FAIL_WIDTH)
  const mild = report.squeezed.filter((q) => q.width >= FAIL_WIDTH)
  const problems = []
  if (report.overflow > 1) problems.push(`scrolls sideways by ${report.overflow}px ${report.wide.join(' | ')}`)
  if (severe.length) problems.push(`squeezed text: ${severe.map((q) => q.text).join(' | ')}`)
  if (problems.length) failed++
  const note = mild.length ? `  (warn: ${mild.map((q) => q.text).join(' | ')})` : ''
  console.log(`${route.padEnd(16)} ${problems.length ? 'FAIL ' + problems.join(' ; ') : 'ok'}${note}`)
}

await browser.close()
process.exit(failed ? 1 : 0)
