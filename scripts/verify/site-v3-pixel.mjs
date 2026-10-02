/**
 * The pixel gate for the third site design (D-190): each page of design-reference/orgpuls/nettside-v3,
 * diffed whole against the running site, exactly as site-pixel.mjs does for the second design —
 * pixelmatch at threshold 0.1, a 0.1% budget, and the page cut into 900-pixel bands so one wrong
 * block cannot hide on a tall page. Baselines come from site-v3-baseline.mjs, captured with reduced
 * motion, as the site is shot here.
 *
 *   node scripts/verify/site-v3-pixel.mjs                          # every page, 1440 wide
 *   node scripts/verify/site-v3-pixel.mjs Plattform --base http://localhost:3400 --width 390
 *
 * Diffs are written to artifacts/pixel/site-v3-<page>-<width>.png, the site's shot beside it.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { chromium } from 'playwright-core'

const TOLERANCE = 0.1 // percent
const BAND = 900
const PAGES = { Forside: '/', Plattform: '/plattform', Bruksomrader: '/bruksomrader', Bransjer: '/bransjer', Pris: '/priser' }

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : fallback
}
const base = arg('base', 'http://localhost:3000')
const width = Number(arg('width', '1440'))
const only = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'))

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const ctx = await b.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
mkdirSync('artifacts/pixel', { recursive: true })

let failed = 0
for (const [name, route] of Object.entries(PAGES).filter(([n]) => !only.length || only.includes(n))) {
  const slug = name.replace(/ /g, '-')
  const baseline = PNG.sync.read(readFileSync(`design-reference/orgpuls/nettside-v3/baselines/${slug}-${width}.png`))
  const p = await ctx.newPage()
  const errors = []
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  p.on('pageerror', (e) => errors.push(String(e)))
  await p.goto(base + route, { waitUntil: 'networkidle' })
  await p.evaluate(() => document.fonts.ready)
  await p.mouse.move(0, 0)
  await p.waitForTimeout(600)
  const shot = PNG.sync.read(await p.screenshot({ fullPage: true }))
  writeFileSync(`artifacts/pixel/site-v3-${slug}-${width}.shot.png`, PNG.sync.write(shot))
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
  writeFileSync(`artifacts/pixel/site-v3-${slug}-${width}.png`, PNG.sync.write(diff))

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
