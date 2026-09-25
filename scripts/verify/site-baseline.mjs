/**
 * Renders the public site's design pages (design-reference/orgpuls/nettside, D-88) into
 * baselines, the way the application's baselines were captured: headless Chromium,
 * --no-sandbox, a 1440 x 900 viewport, full page.
 *
 * The pages are prototypes: support.js loads React, ReactDOM and Babel from unpkg and the
 * fonts from Google. Neither is fetched by the browser here. The three scripts are cached
 * under node_modules/.cache/dc-vendor (fetched once with curl, which goes through the
 * session's proxy), and the fonts are the design's own files in design-reference/orgpuls/fonts
 * — the same files app/fonts.css serves (D-07), so a baseline and the site are set in the
 * same faces. The pages are served over HTTP from design-reference/orgpuls, because the
 * runtime fetches its own file and `../tuva/…` resolves against that folder.
 *
 *   node scripts/verify/site-baseline.mjs                  # every page, 1440 wide
 *   node scripts/verify/site-baseline.mjs --width 390 Forside
 *
 * Writes design-reference/orgpuls/nettside/baselines/<page>-<width>.png.
 */
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, extname, join, normalize } from 'node:path'
import { chromium } from 'playwright-core'

const ROOT = 'design-reference/orgpuls'
const FONTS = join(ROOT, 'fonts')
const OUT = join(ROOT, 'nettside', 'baselines')
const VENDOR = 'node_modules/.cache/dc-vendor'
const VENDOR_URLS = [
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js',
]
export const PAGES = {
  Forside: '/',
  Plattform: '/plattform',
  Hvorfor: '/hvorfor',
  Bruksomrader: '/bruksomrader',
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : fallback
}
const width = Number(arg('width', '1440'))
const only = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'))

mkdirSync(VENDOR, { recursive: true })
for (const url of VENDOR_URLS) {
  const file = join(VENDOR, basename(url))
  if (!existsSync(file)) execFileSync('curl', ['-sSfL', '-m', '120', '-o', file, url])
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.png': 'image/png', '.css': 'text/css' }
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  const file = join(ROOT, path)
  if (!file.startsWith(ROOT) || !existsSync(file)) {
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
for (const name of Object.keys(PAGES).filter((n) => !only.length || only.includes(n))) {
  const p = await ctx.newPage()
  await p.goto(`${origin}/nettside/${encodeURIComponent(name)}.dc.html`, { waitUntil: 'networkidle' })
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(600)
  const file = join(OUT, `${name.replace(/ /g, '-')}-${width}.png`)
  await p.screenshot({ path: file, fullPage: true })
  const h = await p.evaluate(() => document.documentElement.scrollHeight)
  console.log(`${file} ${width}x${h}`)
  await p.close()
}
await b.close()
server.close()
