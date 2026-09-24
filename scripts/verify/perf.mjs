/**
 * Performance on a deployed build (P8): TTFB and LCP for the heaviest screens, read from
 * the browser's own Navigation Timing and largest-contentful-paint entries, median of
 * five loads each after one warm-up.
 *
 * The plan's budget is TTFB < 400 ms and LCP < 2 s. It is measured from wherever this
 * runs, so the network between here and the edge is part of the number; the script
 * prints the login page's TTFB as that floor, so a slow screen can be told from a slow
 * route to the server. Signs in with ORGPULS_DEV_EMAIL / ORGPULS_DEV_PASSWORD
 * (environment, never printed) and writes nothing.
 *
 *   node scripts/verify/perf.mjs [--base http://localhost:3000]
 */
import { chromium } from 'playwright-core'

const argv = process.argv.slice(2)
const base = argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : 'https://www.orgpuls.com'
// a remote build is reached through the environment's proxy; localhost never is
const remote = !/^http:\/\/localhost/.test(base)
const proxy = remote && process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'], proxy })

const SCREENS = [
  ['Oversikt (Enkel)', '/innsikt', 'enkel'],
  ['Innsikt (Full)', '/innsikt', 'full'],
  ['Resultater', '/resultater', 'full'],
  ['Kommentarer', '/kommentarer', 'full'],
  ['Tiltak', '/tiltak', 'full'],
  ['Målinger', '/malinger', 'full'],
]

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

async function measure(page, url) {
  await page.goto(url, { waitUntil: 'load' })
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const nav = performance.getEntriesByType('navigation')[0]
        let lcp = 0
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) lcp = Math.max(lcp, e.startTime)
        }).observe({ type: 'largest-contentful-paint', buffered: true })
        setTimeout(() => resolve({ ttfb: nav.responseStart, lcp }), 1500)
      }),
  )
}

const login = await b.newPage()
const floor = []
for (let i = 0; i < 6; i++) floor.push((await measure(login, base + '/logg-inn')).ttfb)
floor.shift()
console.log(`${'login page (the floor)'.padEnd(24)} TTFB ${Math.round(median(floor))} ms`)
await login.close()

let over = 0
for (const [name, path, view] of SCREENS) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addCookies([{ name: 'op_view', value: view, url: base }])
  const p = await ctx.newPage()
  await p.goto(base + '/logg-inn', { waitUntil: 'networkidle' })
  await p.getByLabel(/e-post|email/i).fill(process.env.ORGPULS_DEV_EMAIL)
  await p.getByLabel(/passord|password/i).fill(process.env.ORGPULS_DEV_PASSWORD)
  await Promise.all([
    p.waitForURL((u) => !u.pathname.startsWith('/logg-inn')),
    p.getByRole('button', { name: /logg inn|sign in/i }).click(),
  ])
  await measure(p, base + path)
  const runs = []
  for (let i = 0; i < 5; i++) runs.push(await measure(p, base + path))
  const ttfb = Math.round(median(runs.map((r) => r.ttfb)))
  const lcp = Math.round(median(runs.map((r) => r.lcp)))
  const ok = ttfb < 400 && lcp < 2000
  if (!ok) over++
  console.log(
    `${name.padEnd(24)} TTFB ${String(ttfb).padStart(4)} ms   LCP ${String(lcp).padStart(4)} ms   ${ok ? 'within budget' : 'OVER'}`,
  )
  await ctx.close()
}
await b.close()
process.exit(over ? 1 : 0)
