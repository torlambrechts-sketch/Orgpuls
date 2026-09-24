/**
 * The v3 pixel run (P8): every state design 3 draws, captured from the app the way
 * `baseline-v3.mjs` captured it from the prototype, and compared band by band.
 *
 * A screen is compared in tiles of 240 x 100 px, six across. Each tile is searched a little
 * up and down (`--shift`, default 40 px), because a block pushed by a longer block above it
 * is still the same block (D-71's eleven factors against the design's nine). A tile passes
 * at the gate's own tolerance, 0.1 % of a 1440 x 900 screen.
 *
 * A tile that differs because the data differs is not a failure of the build, and it is
 * not hidden either. `scripts/verify/v3-claims.json` names, per state, the tiles that
 * match ("y:x"). That makes it a regression gate: a claimed tile that stops matching fails
 * the run. What the unclaimed tiles show, and why, is D-77. `--write` records the current passes
 * as the claims; use it only after reading why each unclaimed band differs.
 *
 * Signs in with ORGPULS_DEV_EMAIL / ORGPULS_DEV_PASSWORD (environment, never printed)
 * against :3000 with the design fixture seeded. `--first-run` runs the Veiviser's nine
 * steps instead. It needs `design-fixture.mjs --first-run` applied, and it WRITES: the
 * steps save, and the eighth plans a round. Reseed afterwards.
 *
 *   node scripts/verify/v3-run.mjs [--only 07] [--write] [--out dir]
 *   node scripts/verify/v3-run.mjs --first-run [--write]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { chromium } from 'playwright-core'

const argv = process.argv.slice(2)
const flag = (n) => argv.includes(`--${n}`)
const arg = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d)
const base = 'http://localhost:3000'
const BASE_DIR = 'design-reference/orgpuls/baselines-v3'
const CLAIMS = 'scripts/verify/v3-claims.json'
const out = arg('out', '/tmp/v3-run')
const only = arg('only', null)
const SHIFT = Number(arg('shift', 40))
const BAND = 100
const TILE = 240
const LIMIT = Math.floor(1440 * 900 * 0.001)
mkdirSync(out, { recursive: true })

// the header's help button is named for everything its panel holds (D-70)
const HELP = 'Hjelp, grunnlag og assistent'
const full = { op_view: 'full' }
const side = { op_view: 'full', op_layout: 'side' }
/** [baseline, route, cookies, presses, options] — as baseline-v3.mjs reaches each state */
const STATES = [
  ['01-oversikt-enkel', '/innsikt', {}, []],
  ['02-innsikt-full', '/innsikt', full, []],
  ['03-malinger-kommende', '/malinger', full, []],
  ['04-malinger-historikk', '/malinger?fane=historikk', full, []],
  ['05-malinger-arshjul', '/malinger?fane=arshjul', full, []],
  ['06-malinger-sporsmalssett', '/malinger?fane=sporsmal', full, []],
  ['07-resultater-varmekart', '/resultater', full, []],
  ['08-resultater-prioritet', '/resultater?visning=prioritet', full, []],
  ['09-resultater-segmentprofil', '/resultater?visning=segment', full, []],
  ['10-resultater-sammenlign', '/resultater?visning=sammenlign', full, []],
  ['11-resultater-utvikling', '/resultater?visning=utvikling', full, []],
  ['12-kommentarer', '/kommentarer', full, []],
  ['13-tiltak-tavle', '/tiltak', full, []],
  ['14-tiltak-liste', '/tiltak?fane=liste', full, []],
  ['15-oppsett-selskap', '/oppsett', full, []],
  // 16 and 17 are the verneombud's and an avdelingsleder's Innsikt: a role is a membership,
  // not a menu (lib/org/read.ts), and the fixture has one login. D-77.
  ['18-side-innsikt', '/innsikt', side, []],
  ['19-side-resultater', '/resultater', side, []],
  ['20-side-sammentrukket', '/innsikt', { ...side, op_rail: 'closed' }, []],
  ['21-hjelp', '/innsikt', {}, [HELP]],
  // 22 is the phone: the prototype's page overflows to 444 px there (D-71), so its layout is
  // not the one a 390 px screen can show; it is checked by mobile.mjs for overflow instead
  ['23-panel-hjelp', '/innsikt', full, [HELP], { viewport: true }],
  ['24-panel-grunnlag', '/innsikt', full, [HELP, 'Grunnlag og lov'], { viewport: true }],
  ['25-panel-tuva', '/innsikt', full, [HELP, 'Tuva'], { viewport: true }],
]
const WIZARD = [
  'Velkommen',
  'Virksomheten',
  'Ansatte',
  'Grupper og terskel',
  'Verneombud',
  'Hva dere måler',
  'Rytme og oppfølging',
  'Første utsending',
  'Klart',
]

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const errors = []
async function page(cookies, width = 1440) {
  const ctx = await b.newContext({ viewport: { width, height: 900 } })
  await ctx.addCookies(Object.entries(cookies).map(([name, value]) => ({ name, value, url: base })))
  const p = await ctx.newPage()
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await p.goto(base + '/logg-inn', { waitUntil: 'networkidle' })
  await p.getByLabel(/e-post|email/i).fill(process.env.ORGPULS_DEV_EMAIL)
  await p.getByLabel(/passord|password/i).fill(process.env.ORGPULS_DEV_PASSWORD)
  await Promise.all([
    p.waitForURL((u) => !u.pathname.startsWith('/logg-inn')),
    p.getByRole('button', { name: /logg inn|sign in/i }).click(),
  ])
  return p
}

const read = (f) => PNG.sync.read(readFileSync(f))
const crop = (png, x, y, w, h) => {
  const o = new PNG({ width: w, height: h })
  PNG.bitblt(png, o, x, y, w, h, 0, 0)
  return o
}
/** each tile's best diff within ±SHIFT: ['y:x', diffPx] */
function tiles(basePng, shotPng) {
  const w = Math.min(basePng.width, shotPng.width)
  const res = []
  for (let y = 0; y + BAND <= basePng.height; y += BAND) {
    for (let x = 0; x + TILE <= w; x += TILE) {
      const A = crop(basePng, x, y, TILE, BAND)
      let best = null
      // outward from no shift, so an exact match ends the search early
      for (const dy of [0, ...Array.from({ length: SHIFT }, (_, i) => [i + 1, -(i + 1)]).flat()]) {
        if (y + dy < 0 || y + dy + BAND > shotPng.height) continue
        const n = pixelmatch(A.data, crop(shotPng, x, y + dy, TILE, BAND).data, null, TILE, BAND, { threshold: 0.1 })
        if (best === null || n < best) best = n
        if (n === 0) break
      }
      res.push([`${y}:${x}`, best ?? TILE * BAND])
    }
  }
  return res
}

const claims = existsSync(CLAIMS) ? JSON.parse(readFileSync(CLAIMS, 'utf8')) : {}
const results = {}
let failed = 0

function judge(name, shot) {
  const r = tiles(read(join(BASE_DIR, `${name}.png`)), read(shot))
  const pass = r.filter(([, n]) => n <= LIMIT).map(([t]) => t)
  const claimed = claims[name] ?? []
  const lost = claimed.filter((t) => !pass.includes(t))
  if (lost.length) failed++
  results[name] = pass
  // the rows where something differs, for reading against D-77
  const rows = [...new Set(r.filter(([, n]) => n > LIMIT).map(([t]) => t.split(':')[0]))]
  console.log(
    `${lost.length ? 'FAIL' : 'ok  '}  ${name.padEnd(28)} ${String(pass.length).padStart(3)}/${r.length} tiles` +
      (lost.length ? `  LOST ${lost.join(',')}` : '') +
      (rows.length ? `  differ in rows ${rows.join(',')}` : ''),
  )
}

if (!flag('first-run')) {
  for (const [name, route, cookies, presses, opts = {}] of STATES) {
    if (only && !name.startsWith(only)) continue
    const p = await page(cookies, opts.width)
    await p.goto(base + route, { waitUntil: 'networkidle' })
    await p.evaluate(() => document.fonts.ready)
    for (const n of presses) {
      await p.getByRole('button', { name: n, exact: true }).first().click()
      await p.waitForTimeout(600)
    }
    await p.evaluate(() => window.scrollTo(0, 0))
    await p.mouse.move(0, 0)
    await p.waitForTimeout(400)
    const shot = join(out, `${name}.png`)
    await p.screenshot({ path: shot, fullPage: !opts.viewport })
    judge(name, shot)
    await p.context().close()
  }
} else {
  const p = await page({})
  await p.goto(base + '/innsikt', { waitUntil: 'networkidle' })
  await p.evaluate(() => document.fonts.ready)
  const d = p.getByRole('dialog')
  await p.waitForTimeout(1500)
  if (!(await d.count())) await p.getByRole('button', { name: 'Veiviser', exact: true }).click()
  for (let i = 0; i < WIZARD.length; i++) {
    await d.getByRole('heading', { level: 2, name: WIZARD[i] }).waitFor({ timeout: 20000 })
    await p.mouse.move(0, 0)
    await p.waitForTimeout(500)
    const name = `${30 + i}-veiviser-${i + 1}`
    const shot = join(out, `${name}.png`)
    await p.screenshot({ path: shot })
    judge(name, shot)
    if (i < WIZARD.length - 1) await d.locator('div.sticky button').last().click()
  }
  await p.context().close()
}

if (flag('write')) {
  writeFileSync(CLAIMS, JSON.stringify({ ...claims, ...results }, null, 2) + '\n')
  console.log(`claims written: ${Object.keys(results).length} states`)
}
console.log(errors.length ? `console errors: ${errors.slice(0, 3).join(' / ')}` : 'no console errors')
await b.close()
process.exit(failed || errors.length ? 1 : 0)
