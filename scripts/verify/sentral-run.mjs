/**
 * The admin's pixel gate (Sentral, docs/implementation/growth-admin.md § 4; D-181): each view of
 * design revision 3 that the admin serves, shot full-page at 1440 the way sentral-baseline.mjs
 * rendered the design, and compared with its render tile by tile.
 *
 * Tiles are 100 × 100 px. Each is searched a little up and down (`--shift`, default 40 px), as
 * v3-run.mjs does, because a block pushed by a taller block above it is still the same block.
 *
 * A tile passes at the gate's agreed tolerance, 0.1 %, taken of the tile: 10 differing pixels in
 * 10 000 (pixelmatch at threshold 0.1, as v3-run). v3-run allows each tile 0.1 % of a whole
 * 1440 × 900 screen, 1 296 pixels; at 100 × 100 that is 13 % of a tile, and a stub page passes
 * nearly every tile of a full design with it — the first run passed all 126 tiles of the 90-day
 * plan's render against a page that showed only its head (D-181). `--limit 1296` gives v3-run's
 * budget back, for comparison.
 *
 * A tile that differs because the data or a true status differs from the design's sample is not a
 * failure of the build, and it is not hidden either: `scripts/verify/sentral-claims.json` names,
 * per view, the tiles that match ("y:x"). A claimed tile that stops matching fails the run.
 * `--write` records the current passes as the claims; use it only after reading why each
 * unclaimed row differs (audit rule 7), and write the reason into the deviation entry.
 *
 * Views come from sentral-routes.mjs (the plan's table). A view whose route has no page yet is
 * skipped with a line saying so. Console errors and page errors are collected and reported, and
 * fail the run.
 *
 * `--width 390` is the phone check: no diff (the design is drawn for the desktop), but every view
 * is shot at 390 and a page that scrolls sideways is reported and fails the run.
 *
 * It signs in as the local admin that scripts/seed/sentral-fixture.mjs writes: it clears that
 * admin's TOTP factors in the LOCAL database (refusing any other), enrols a new one on /admin/mfa
 * and answers with a code computed from the key the enrolment shows. Nothing is printed of it.
 * Run the fixture first, and serve the app against the local stack (scripts/qa/env.mjs).
 *
 *   node scripts/verify/sentral-run.mjs [--base http://localhost:3400] [--only Growth] [--write]
 *   node scripts/verify/sentral-run.mjs --width 390 [--only CRM_Consent]
 *   options: --out dir (shots, default /tmp/sentral-run) · --shift px · --limit px · --db local-url
 */
import { createHmac } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { chromium } from 'playwright-core'
import { DEFAULT_DB, LOCAL_ADMIN, resetAdminMfa } from '../seed/sentral-fixture.mjs'
import { baselineFile, routeExists, VIEW_ROUTES } from './sentral-routes.mjs'

const argv = process.argv.slice(2)
const flag = (n) => argv.includes(`--${n}`)
const arg = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d)
const base = arg('base', 'http://localhost:3400')
const width = Number(arg('width', 1440))
const out = arg('out', '/tmp/sentral-run')
const only = arg('only', null)
const db = arg('db', DEFAULT_DB)
const SHIFT = Number(arg('shift', 40))
const CLAIMS = 'scripts/verify/sentral-claims.json'
const TILE = 100
const LIMIT = Number(arg('limit', Math.floor(TILE * TILE * 0.001)))
mkdirSync(out, { recursive: true })

/** RFC 6238 with SHA-1, 30 s steps, 6 digits — what the admin's authenticator enrolment issues */
function totp(secret, at = Date.now()) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = secret
    .replace(/=+$/, '')
    .toUpperCase()
    .split('')
    .map((c) => A.indexOf(c).toString(2).padStart(5, '0'))
    .join('')
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)))
  const ctr = Buffer.alloc(8)
  ctr.writeBigUInt64BE(BigInt(Math.floor(at / 30000)))
  const h = createHmac('sha1', key).update(ctr).digest()
  const o = h[19] & 15
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0')
}

const views = VIEW_ROUTES.filter((v) => !only || v.name.startsWith(only) || v.area === only)
const executablePath = [
  process.env.PLAYWRIGHT_BROWSERS_PATH && `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium`,
  '/opt/pw-browsers/chromium',
].find((p) => p && existsSync(p))
const b = await chromium.launch({ args: ['--no-sandbox'], ...(executablePath ? { executablePath } : {}) })
const errors = []
const listen = (p, where) => {
  p.on('console', (m) => m.type() === 'error' && errors.push(`${where}: ${m.text()}`))
  p.on('pageerror', (e) => errors.push(`${where}: ${String(e).split('\n')[0]}`))
}

/** Signs the local admin in, second factor included, and returns the session for every shot */
async function signIn() {
  resetAdminMfa(db)
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
  const p = await ctx.newPage()
  listen(p, 'sign-in')
  await p.goto(`${base}/admin/login`, { waitUntil: 'networkidle' })
  await p.fill('input[name=email]', LOCAL_ADMIN.email)
  await p.fill('input[name=password]', LOCAL_ADMIN.password)
  await Promise.all([p.waitForURL('**/admin/mfa', { timeout: 20000 }), p.click('button[type=submit]')])
  await p.locator('main button').first().click()
  await p.waitForSelector('code', { timeout: 20000 })
  const secret = (await p.textContent('code')).trim()
  for (let attempt = 0; attempt < 2; attempt++) {
    await p.fill('input[name=code]', totp(secret))
    await p.click('form button[type=submit]')
    const ok = await p
      .waitForURL((u) => u.pathname === '/admin', { timeout: 15000 })
      .then(() => true)
      .catch(() => false)
    if (ok) {
      const state = await ctx.storageState()
      await ctx.close()
      return state
    }
    // a code read at the end of its 30 s window: wait for the next one
    await p.waitForTimeout(31000 - (Date.now() % 30000))
  }
  throw new Error('sentral-run: the admin did not get past /admin/mfa')
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
  for (let y = 0; y + TILE <= basePng.height; y += TILE) {
    for (let x = 0; x + TILE <= w; x += TILE) {
      const A = crop(basePng, x, y, TILE, TILE)
      let best = null
      for (const dy of [0, ...Array.from({ length: SHIFT }, (_, i) => [i + 1, -(i + 1)]).flat()]) {
        if (y + dy < 0 || y + dy + TILE > shotPng.height) continue
        const n = pixelmatch(A.data, crop(shotPng, x, y + dy, TILE, TILE).data, null, TILE, TILE, { threshold: 0.1 })
        if (best === null || n < best) best = n
        if (n === 0) break
      }
      res.push([`${y}:${x}`, best ?? TILE * TILE])
    }
  }
  return res
}

const claims = existsSync(CLAIMS) ? JSON.parse(readFileSync(CLAIMS, 'utf8')) : {}
const results = {}
let failed = 0

function judge(name, shot) {
  const r = tiles(read(baselineFile(name)), read(shot))
  const pass = r.filter(([, n]) => n <= LIMIT).map(([t]) => t)
  const claimed = claims[name] ?? []
  const lost = claimed.filter((t) => !pass.includes(t))
  if (lost.length) failed++
  results[name] = pass
  const rows = [...new Set(r.filter(([, n]) => n > LIMIT).map(([t]) => t.split(':')[0]))]
  console.log(
    `${lost.length ? 'FAIL' : 'ok  '}  ${name.padEnd(30)} ${String(pass.length).padStart(4)}/${r.length} tiles` +
      (claimed.length ? `  ${claimed.length} claimed` : '  no claims yet') +
      (lost.length ? `  LOST ${lost.join(',')}` : '') +
      (rows.length ? `  differ in rows ${rows.join(',')}` : ''),
  )
}

const state = await signIn()
console.log(width === 1440 ? `sentral-run at 1440 · ${TILE} × ${TILE} tiles · ${LIMIT} px a tile · ±${SHIFT} px` : `sentral-run at ${width}: horizontal overflow only`)
for (const v of views) {
  if (!routeExists(v.route)) {
    console.log(`skip  ${v.name.padEnd(30)} ${v.route} is not built yet`)
    continue
  }
  if (width === 1440 && !existsSync(baselineFile(v.name))) {
    console.log(`skip  ${v.name.padEnd(30)} no render at ${baselineFile(v.name)}`)
    continue
  }
  const ctx = await b.newContext({ viewport: { width, height: 900 }, storageState: state })
  const p = await ctx.newPage()
  listen(p, v.route)
  const res = await p.goto(base + v.route, { waitUntil: 'networkidle' })
  if (!res || !res.ok() || new URL(p.url()).pathname !== v.route) {
    failed++
    console.log(`FAIL  ${v.name.padEnd(30)} ${v.route} answered ${res?.status() ?? 'nothing'} at ${new URL(p.url()).pathname}`)
    await ctx.close()
    continue
  }
  await p.evaluate(() => document.fonts.ready)
  await p.mouse.move(0, 0)
  await p.waitForTimeout(500)
  await p.evaluate(() => window.scrollTo(0, 0))
  const shot = join(out, `${v.name}-${width}.png`)
  await p.screenshot({ path: shot, fullPage: true })
  if (width === 1440) judge(v.name, shot)
  else {
    const { scroll, client } = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
    const over = scroll > client
    if (over) failed++
    console.log(`${over ? 'FAIL' : 'ok  '}  ${v.name.padEnd(30)} ${width} px: ${over ? `scrolls sideways (${scroll} > ${client})` : 'no horizontal overflow'}`)
  }
  await ctx.close()
}

if (flag('write') && width === 1440) {
  writeFileSync(CLAIMS, JSON.stringify({ ...claims, ...results }, null, 2) + '\n')
  console.log(`claims written: ${Object.keys(results).length} views`)
}
console.log(errors.length ? `console errors (${errors.length}): ${errors.slice(0, 5).join(' / ')}` : 'no console errors')
await b.close()
process.exit(failed || errors.length ? 1 : 0)
