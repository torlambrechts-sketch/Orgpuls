/**
 * Captures app routes the same way the design baselines were captured.
 *
 * The baselines in design-reference/orgpuls/baselines are 1440-wide full-page PNGs,
 * taken through scripts/playwright-mcp.sh: headless Chromium, --no-sandbox, viewport
 * 1440x900. A shot taken any other way is not comparable to them, so the launch
 * options here mirror that script rather than being chosen.
 *
 * It exists for one other reason: every app route is behind auth, and signing in by
 * hand through the MCP browser means passing the password as a tool argument, which
 * writes it into a transcript. This reads the environment in-process, uses the
 * credential once, and never writes it anywhere. Nothing is printed but the file paths.
 *
 *   node scripts/verify/shoot.mjs /malinger /innsikt
 *   node scripts/verify/shoot.mjs --out artifacts/shots --base http://localhost:3000 /malinger
 */
import { readFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}

// a flag's value is not a route: an absolute `--out /tmp/shots` used to be visited as one,
// and its 404 was the "intermittent" console error the smoke runs reported
const argv = process.argv.slice(2)
const routes = argv.filter((a, i) => a.startsWith('/') && !['--out', '--base'].includes(argv[i - 1]))
if (routes.length === 0) {
  console.error('give at least one route, e.g. node scripts/verify/shoot.mjs /malinger')
  process.exit(2)
}

const base = arg('base', 'http://localhost:3000')
const outDir = arg('out', 'artifacts/shots')

/**
 * Credentials come from the environment first and `.env.local` second.
 *
 * That order matters in a cloud session: `.env.local` is gitignored, so a fresh VM has
 * no such file and only the environment carries anything. On a laptop it is usually the
 * other way round. Reading both means this works in either place without a setup step,
 * and nothing is ever written back out.
 */
const env = (() => {
  const out = {}
  if (existsSync('.env.local')) {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  // the environment wins: it is what a cloud session is configured with
  for (const k of ['ORGPULS_DEV_EMAIL', 'ORGPULS_DEV_PASSWORD']) {
    if (process.env[k]) out[k] = process.env[k]
  }
  return out
})()

const EXECUTABLES = [
  process.env.PLAYWRIGHT_BROWSERS_PATH && `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium`,
  process.env.PLAYWRIGHT_BROWSERS_PATH &&
    `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium/chrome-linux/chrome`,
  '/opt/pw-browsers/chromium',
  '/opt/ms-playwright/chromium/chrome-linux/chrome',
].filter(Boolean)

const executablePath = EXECUTABLES.find((p) => existsSync(p))

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox'],
  ...(executablePath ? { executablePath } : {}),
})

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

// Sign in once; the session cookie then covers every route in this run.
const email = env.ORGPULS_DEV_EMAIL
const password = env.ORGPULS_DEV_PASSWORD
if (!email || !password) {
  console.error('ORGPULS_DEV_EMAIL and ORGPULS_DEV_PASSWORD must be set in the environment or .env.local')
  await browser.close()
  process.exit(2)
}

await page.goto(`${base}/logg-inn`, { waitUntil: 'networkidle' })
await page.getByLabel(/e-post|email/i).fill(email)
await page.getByLabel(/passord|password/i).fill(password)
await Promise.all([
  page.waitForURL((u) => !u.pathname.startsWith('/logg-inn'), { timeout: 15000 }),
  page.getByRole('button', { name: /logg inn|sign in/i }).click(),
])

mkdirSync(outDir, { recursive: true })
for (const route of routes) {
  await page.goto(`${base}${route}`, { waitUntil: 'networkidle' })
  // the ht-in entry animation is .25s; capture after it has settled, or the shot
  // catches the 6px translate and every region diffs
  await page.waitForTimeout(500)
  const file = join(outDir, `${route.replace(/^\//, '').replace(/\//g, '-') || 'root'}.png`)
  await page.screenshot({ path: file, fullPage: true })
  console.log(`${route} -> ${file}`)
}

await browser.close()

if (errors.length) {
  console.error(`\n${errors.length} console error(s):`)
  for (const e of errors) console.error(`  ${e}`)
  process.exit(1)
}
console.log('no console errors')
