/**
 * Renders the third site design (design-reference/orgpuls/nettside-v3, D-190: the SMB front page,
 * Plattform, Bruksområder, Bransjer and Pris) into baselines, as site-baseline.mjs does for the
 * second: headless Chromium, --no-sandbox, full page, React/ReactDOM/Babel from the curl-cached
 * copies in node_modules/.cache/dc-vendor. The bundle carries its own fonts (_ds/…/assets/fonts,
 * the same woff2 files public/fonts serves) and images, so nothing else is fetched.
 *
 *   node scripts/verify/site-v3-baseline.mjs                    # every page, 1440 wide
 *   node scripts/verify/site-v3-baseline.mjs --width 390 Forside
 *
 * Writes design-reference/orgpuls/nettside-v3/baselines/<page>-<width>.png, and for the front
 * page's hero carousel one shot of the hero per slide: Forside-slide<n>-<width>.png.
 */
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, extname, join, normalize } from 'node:path'
import { chromium } from 'playwright-core'

const ROOT = 'design-reference/orgpuls/nettside-v3'
const OUT = join(ROOT, 'baselines')
const VENDOR = 'node_modules/.cache/dc-vendor'
const VENDOR_URLS = [
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js',
]
export const PAGES = {
  Forside: '/',
  Plattform: '/plattform',
  Bruksomrader: '/bruksomrader',
  Bransjer: '/bransjer',
  Pris: '/priser',
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

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
}
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
const ctx = await b.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
await ctx.route(/unpkg\.com/, (r) =>
  r.fulfill({ path: join(VENDOR, basename(new URL(r.request().url()).pathname)), contentType: 'application/javascript' }),
)

const settle = async (p) => {
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(700)
}

mkdirSync(OUT, { recursive: true })
for (const name of Object.keys(PAGES).filter((n) => !only.length || only.includes(n))) {
  const p = await ctx.newPage()
  await p.goto(`${origin}/${encodeURIComponent(name)}.dc.html`, { waitUntil: 'networkidle' })
  await settle(p)
  const file = join(OUT, `${name}-${width}.png`)
  await p.screenshot({ path: file, fullPage: true })
  const h = await p.evaluate(() => document.documentElement.scrollHeight)
  console.log(`${file} ${width}x${h}`)
  if (name === 'Forside') {
    // the carousel: each slide's hero, chosen by its tab, as the visitor sees it on arrival
    const tabs = p.getByRole('tab')
    for (let i = 0; i < (await tabs.count()); i++) {
      await tabs.nth(i).click()
      await settle(p)
      const shot = join(OUT, `Forside-slide${i + 1}-${width}.png`)
      await p.locator('#topp').screenshot({ path: shot })
      console.log(shot)
    }
  }
  await p.close()
}
await b.close()
server.close()
