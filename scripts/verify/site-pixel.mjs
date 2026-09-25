/**
 * The pixel gate for the public site (D-88): each page of design-reference/orgpuls/nettside,
 * diffed whole against the running site.
 *
 * Same comparison as pixel.mjs — pixelmatch at threshold 0.1, a 0.1% budget — with the page
 * as the screen. A full page is taller than a screen, so it is also cut into 900-pixel bands
 * and each band is reported against a screen's own budget (1440 x 900): a page cannot pass
 * by spreading one wrong block over seven screens of right ones. The heights must match
 * first; if they do not, the bands are still compared from the top, so the first band that
 * fails is where the page starts to drift.
 *
 *   node scripts/verify/site-pixel.mjs                     # every page
 *   node scripts/verify/site-pixel.mjs Plattform --base http://localhost:3000
 *
 * Baselines come from site-baseline.mjs. Diffs are written to artifacts/pixel/site-<page>.png.
 *
 * The site does not say everything the design says: D-88 lists the claims the product does
 * not keep, reworded to what it does. Where a corrected sentence wraps differently, the page
 * below it moves, so the pages fail here by design. The layout was proven with the design's
 * own words (D-88 records the counts); read a failure here against that list, in the diff
 * image, before calling it a regression.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { chromium } from 'playwright-core'

const TOLERANCE = 0.1 // percent
const BAND = 900
const PAGES = { Forside: '/', Plattform: '/plattform', Hvorfor: '/hvorfor', Bruksomrader: '/bruksomrader', 'Om oss': '/om-oss' }

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : fallback
}
const base = arg('base', 'http://localhost:3000')
const width = Number(arg('width', '1440'))
const only = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'))

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const ctx = await b.newContext({ viewport: { width, height: 900 } })
mkdirSync('artifacts/pixel', { recursive: true })

let failed = 0
for (const [name, route] of Object.entries(PAGES).filter(([n]) => !only.length || only.includes(n))) {
  const slug = name.replace(/ /g, '-')
  const baseline = PNG.sync.read(readFileSync(`design-reference/orgpuls/nettside/baselines/${slug}-${width}.png`))
  const p = await ctx.newPage()
  const errors = []
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  p.on('pageerror', (e) => errors.push(String(e)))
  await p.goto(base + route, { waitUntil: 'networkidle' })
  await p.evaluate(() => document.fonts.ready)
  await p.mouse.move(0, 0)
  await p.waitForTimeout(600)
  const shot = PNG.sync.read(await p.screenshot({ fullPage: true }))
  writeFileSync(`artifacts/pixel/site-${slug}.shot.png`, PNG.sync.write(shot))
  await p.close()

  const w = Math.min(baseline.width, shot.width)
  const h = Math.min(baseline.height, shot.height)
  const crop = (img) => {
    const out = new PNG({ width: w, height: h })
    PNG.bitblt(img, out, 0, 0, w, h, 0, 0)
    return out
  }
  const diff = new PNG({ width: w, height: h })
  const a = crop(baseline)
  const c = crop(shot)
  pixelmatch(a.data, c.data, diff.data, w, h, { threshold: 0.1, diffMask: false })
  writeFileSync(`artifacts/pixel/site-${slug}.png`, PNG.sync.write(diff))

  // count per band from the diff image: pixelmatch paints a differing pixel red (255,0,0)
  const bands = []
  let total = 0
  for (let y0 = 0; y0 < h; y0 += BAND) {
    let n = 0
    for (let y = y0; y < Math.min(h, y0 + BAND); y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        if (diff.data[i] === 255 && diff.data[i + 1] === 0 && diff.data[i + 2] === 0) n++
      }
    }
    total += n
    bands.push({ y0, n, pct: (n / (w * BAND)) * 100 })
  }
  const pct = (total / (baseline.width * baseline.height)) * 100
  const sameHeight = baseline.height === shot.height
  const bandsPass = bands.every((x) => x.pct <= TOLERANCE)
  const pass = sameHeight && pct <= TOLERANCE && bandsPass
  if (!pass) failed++
  console.log(
    `${name} ${route}: height ${shot.height} vs ${baseline.height}${sameHeight ? '' : ' (DIFFERS)'} · ${total} px · ${pct.toFixed(4)}% · ${pass ? 'PASS' : 'FAIL'}`,
  )
  for (const x of bands) if (x.pct > TOLERANCE) console.log(`   band y=${x.y0}: ${x.n} px, ${x.pct.toFixed(3)}% of a screen`)
  if (errors.length) console.log(`   console errors: ${errors.slice(0, 3).join(' | ')}`)
}
await b.close()
process.exit(failed ? 1 : 0)
