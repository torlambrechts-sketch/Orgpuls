/**
 * Renders the Sentral admin design (design-reference/sentral/Sentral_Admin.dc.html) into one
 * baseline per view, the way site-baseline.mjs renders the public site: headless Chromium,
 * a 1440 × 900 viewport, full page, React/ReactDOM/Babel from node_modules/.cache/dc-vendor
 * and the design's own font files, so nothing is fetched by the browser.
 *
 * The prototype has no router: a view is reached by pressing its area in the top bar and its
 * page in the sub-bar (behind «More» when the bar has no room), as a person would.
 *
 *   node scripts/verify/sentral-baseline.mjs                 # every view
 *   node scripts/verify/sentral-baseline.mjs Growth          # one area
 *   node scripts/verify/sentral-baseline.mjs --width 390 Growth
 *
 * Writes design-reference/sentral/renders/<area>-<page>-<width>.png.
 */
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, extname, join, normalize } from 'node:path'
import { chromium } from 'playwright-core'

const ROOT = 'design-reference'
const FONTS = join(ROOT, 'orgpuls', 'fonts')
const OUT = join(ROOT, 'sentral', 'renders')
const VENDOR = 'node_modules/.cache/dc-vendor'
const VENDOR_URLS = [
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js',
]

/** [area, page] as the design's D.nav names them */
export const VIEWS = [
  ['Overview', 'Dashboard'],
  ['Customers', 'Customers'],
  ['Customers', 'Organizations'],
  ['CRM', 'Pipeline'],
  ['CRM', 'Contacts & lists'],
  ['CRM', 'Campaigns'],
  ['CRM', 'Journeys'],
  ['CRM', 'Tasks'],
  ['CRM', 'Tickets'],
  ['CRM', 'Lead scoring'],
  ['CRM', 'Consent'],
  ['CRM', 'Brønnøysund triggers'],
  ['CRM', 'Partners'],
  ['Content', 'Pages'],
  ['Content', 'Templates'],
  ['Content', 'Landing & front pages'],
  ['Content', 'Tools & lead magnets'],
  ['Content', 'Media'],
  ['Content', 'SEO'],
  ['Content', 'Languages'],
  ['Analytics', 'Overview'],
  ['Analytics', 'Pages'],
  ['Analytics', 'Goals'],
  ['Growth', 'Board'],
  ['Growth', '90-day plan'],
  ['Growth', 'Funnel & lead math'],
  ['Growth', 'Event catalogue'],
  ['Growth', 'Automation rules'],
  ['Growth', 'Experiments'],
  ['Growth', 'Risks & decisions'],
  ['Growth', 'Coverage review'],
  ['Admin', 'Users & roles'],
  ['Admin', 'Billing & plans'],
  ['Admin', 'Site settings'],
  ['Admin', 'Deliverability'],
  ['Admin', 'Audit log'],
]

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : fallback
}
const width = Number(arg('width', '1440'))
const only = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'))
export const slug = (area, page) => `${area}-${page}`.replace(/[^A-Za-z0-9ø]+/g, '_').replace(/ø/g, 'o')

mkdirSync(VENDOR, { recursive: true })
for (const url of VENDOR_URLS) {
  const file = join(VENDOR, basename(url))
  if (!existsSync(file)) execFileSync('curl', ['-sSfL', '-m', '120', '-o', file, url])
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.png': 'image/png', '.css': 'text/css' }
const server = createServer((req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  // the design sits beside no runtime of its own: it is the same dc runtime as the product's design
  if (path === '/sentral/support.js') path = '/orgpuls/support.js'
  // …and it loads React, ReactDOM and Babel from /cdn/, served from the vendor cache
  const file = path.startsWith('/cdn/') ? join(VENDOR, basename(path)) : join(ROOT, path)
  if (!(file.startsWith(ROOT) || file.startsWith(VENDOR)) || !existsSync(file)) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const ctx = await b.newContext({ viewport: { width, height: 900 } })
await ctx.route(/unpkg\.com/, (r) =>
  r.fulfill({ path: join(VENDOR, basename(new URL(r.request().url()).pathname)), contentType: 'application/javascript' }),
)
await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ path: join(FONTS, 'fonts.raw.css'), contentType: 'text/css' }))
await ctx.route(/fonts\.gstatic\.com/, (r) =>
  r.fulfill({ path: join(FONTS, basename(new URL(r.request().url()).pathname)), contentType: 'font/woff2' }),
)

mkdirSync(OUT, { recursive: true })
const errors = []
const p = await ctx.newPage()
p.setDefaultTimeout(10000)
p.on('pageerror', (e) => errors.push(String(e)))
await p.goto(`${origin}/sentral/Sentral_Admin.dc.html`, { waitUntil: 'networkidle' })
await p.evaluate(() => document.fonts.ready)
let failed = 0
for (const [area, page] of VIEWS.filter(([a]) => !only.length || only.includes(a))) {
  try {
    await p.getByRole('button', { name: area, exact: true }).first().click()
    await p.waitForTimeout(250)
    const target = p.getByRole('button', { name: page, exact: true })
    if (!(await target.first().isVisible().catch(() => false))) {
      const more = p.getByRole('button', { name: /^More/ })
      if (await more.count()) await more.first().click()
    }
    await target.first().click()
    await p.mouse.move(0, 0)
    await p.waitForTimeout(500)
    await p.evaluate(() => window.scrollTo(0, 0))
    const file = join(OUT, `${slug(area, page)}-${width}.png`)
    await p.screenshot({ path: file, fullPage: true })
    const h = await p.evaluate(() => document.documentElement.scrollHeight)
    console.log(`${file} ${width}x${h}`)
  } catch (e) {
    failed++
    console.log(`FAIL ${area} › ${page}: ${String(e).split('\n')[0]}`)
  }
}
console.log(errors.length ? `page errors: ${errors.slice(0, 3).join(' / ')}` : 'no page errors')
await b.close()
server.close()
process.exit(failed ? 1 : 0)
