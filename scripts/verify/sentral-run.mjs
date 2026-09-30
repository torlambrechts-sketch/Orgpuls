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
 * skipped with a line saying so — and that fails the run when the view has recorded claims, since
 * a claim nobody checked is not kept. A run that compares no view at all (an `--only` that matches
 * nothing, every route skipped) fails too. Console errors and page errors are collected and
 * reported, and fail the run. The verdict is sentral-judge.mjs's `verdict`, tested on its own.
 * Paths resolve from the repository's root, so the run means the same from any directory.
 *
 * `--width 390` is the phone check: no diff (the design is drawn for the desktop), but every view
 * is shot at 390 and a page that scrolls sideways is reported and fails the run. Below the shell's
 * `xl` (1280, so `--width 390` and `--width 1024`) it also checks the shell: the sub-bar shows the
 * page you are on inside its visible part (it scrolls sideways, and would otherwise open at its
 * left end with the seventh page off-screen), and, once per run, the menu sheet keeps Tab and
 * Shift+Tab inside itself and gives focus back to the menu button on Escape.
 *
 * It signs in as the local admin that scripts/seed/sentral-fixture.mjs writes, and holds it only
 * for the run: it activates that admin and clears its TOTP factors in the LOCAL database (refusing
 * any other), enrols a new factor on /admin/mfa and answers with a code computed from the key the
 * enrolment shows; nothing is printed of it. When the run ends, however it ends, the admin is made
 * inactive again and the factor deleted, so between runs the fixture's known password opens
 * nothing. Run the fixture first, and serve the app against the local stack (scripts/qa/env.mjs),
 * bound to this machine only (`next start -H 127.0.0.1 -p 3400`). `--base` must be localhost or
 * 127.0.0.1: the run types the local admin's password into the page it names.
 *
 *   node scripts/verify/sentral-run.mjs [--base http://localhost:3400] [--only Growth] [--write]
 *   node scripts/verify/sentral-run.mjs --width 390 [--only CRM_Consent]
 *   options: --out dir (shots, default /tmp/sentral-run) · --shift px · --limit px · --db local-url
 */
import { createHmac } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { chromium } from 'playwright-core'
import { closeAdmin, DEFAULT_DB, LOCAL_ADMIN, openAdmin } from '../seed/sentral-fixture.mjs'
import { assertLocalBase, judgeView, TILE, tiles, verdict } from './sentral-judge.mjs'
import { baselineFile, REPO, routeExists, VIEW_ROUTES } from './sentral-routes.mjs'

const argv = process.argv.slice(2)
const flag = (n) => argv.includes(`--${n}`)
const arg = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d)
const base = arg('base', 'http://localhost:3400')
const width = Number(arg('width', 1440))
const out = arg('out', '/tmp/sentral-run')
const only = arg('only', null)
const db = arg('db', DEFAULT_DB)
const SHIFT = Number(arg('shift', 40))
const CLAIMS = join(REPO, 'scripts', 'verify', 'sentral-claims.json')
const LIMIT = Number(arg('limit', Math.floor(TILE * TILE * 0.001)))
try {
  assertLocalBase(base)
} catch (e) {
  console.error(e.message)
  process.exit(2)
}
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
  openAdmin(db)
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

const claims = existsSync(CLAIMS) ? JSON.parse(readFileSync(CLAIMS, 'utf8')) : {}
const results = {}
const checked = []
const skipped = []
const failures = []

function judge(name, shot) {
  const r = tiles(read(baselineFile(name)), read(shot), { shift: SHIFT })
  const claimed = claims[name] ?? []
  const { pass, lost, rows } = judgeView(claimed, r, LIMIT)
  if (lost.length) failures.push(`${name} lost ${lost.length} claimed tiles`)
  results[name] = pass
  console.log(
    `${lost.length ? 'FAIL' : 'ok  '}  ${name.padEnd(30)} ${String(pass.length).padStart(4)}/${r.length} tiles` +
      (claimed.length ? `  ${claimed.length} claimed` : '  no claims yet') +
      (lost.length ? `  LOST ${lost.join(',')}` : '') +
      (rows.length ? `  differ in rows ${rows.join(',')}` : ''),
  )
}

const skip = (v, why) => {
  skipped.push({ name: v.name, why })
  const claimed = (claims[v.name] ?? []).length
  console.log(`${claimed ? 'FAIL' : 'skip'}  ${v.name.padEnd(30)} ${why}${claimed ? ` — and it has ${claimed} claimed tiles` : ''}`)
}

/** below this the shell has the menu sheet and a sub-bar that scrolls (AdminShell, `xl`) */
const XL = 1280

/**
 * The page you are on, in the sub-bar: whether its link lies inside the bar's visible part and the
 * window. Null when the page is not in the bar (below xl the area's «More» pages live in the sheet).
 */
const subBarCurrent = (p) =>
  p.evaluate(() => {
    const a = [...document.querySelectorAll('header ~ div nav a[aria-current="page"]')].find((e) => e.offsetParent)
    if (!a) return null
    const nav = a.closest('nav')
    const r = a.getBoundingClientRect()
    const n = nav.getBoundingClientRect()
    const inside = r.left >= n.left - 1 && r.right <= n.right + 1 && r.left >= -1 && r.right <= window.innerWidth + 1
    return { text: a.textContent.trim(), left: Math.round(r.left), right: Math.round(r.right), inside }
  })

/** The menu sheet, by keyboard: focus goes in, Tab and Shift+Tab wrap inside it, Escape gives focus back */
async function sheetKeys(p) {
  const menu = p.locator('header button[aria-expanded]').first()
  await menu.click()
  await p.waitForSelector('[role=dialog][aria-modal=true]')
  const inSheet = () => p.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))
  const where = () => p.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 40) ?? '')
  const count = await p.locator('[role=dialog] a[href], [role=dialog] button:not([disabled])').count()
  const bad = []
  if (!(await inSheet())) bad.push('focus did not go into the sheet')
  const first = await where()
  for (let i = 0; i < count; i++) {
    await p.keyboard.press('Tab')
    if (!(await inSheet())) {
      bad.push(`Tab ${i + 1} of ${count} left the sheet`)
      break
    }
  }
  if (!bad.length && (await where()) !== first) bad.push(`Tab ${count} times did not come back to «${first}»`)
  await p.keyboard.press('Shift+Tab')
  if (!(await inSheet())) bad.push('Shift+Tab from the first item left the sheet')
  const last = await p.evaluate(() => {
    const items = [...document.querySelectorAll('[role=dialog] a[href], [role=dialog] button:not([disabled])')]
    return document.activeElement === items[items.length - 1]
  })
  if (!last) bad.push('Shift+Tab from the first item did not reach the last')
  await p.keyboard.press('Escape')
  await p.waitForSelector('[role=dialog][aria-modal=true]', { state: 'detached' })
  const back = await p.evaluate(() => document.activeElement?.getAttribute('aria-expanded') === 'false' && !!document.activeElement.closest('header'))
  if (!back) bad.push('Escape did not give focus back to the menu button')
  return { count, bad }
}

let sheetChecked = false
try {
  const state = await signIn()
  console.log(width === 1440 ? `sentral-run at 1440 · ${TILE} × ${TILE} tiles · ${LIMIT} px a tile · ±${SHIFT} px` : `sentral-run at ${width}: horizontal overflow${width < XL ? ', the sub-bar’s current page and the menu sheet’s keys' : ' only'}`)
  for (const v of views) {
    if (!routeExists(v.route)) {
      skip(v, `${v.route} is not built yet`)
      continue
    }
    if (width === 1440 && !existsSync(baselineFile(v.name))) {
      skip(v, `no render at ${baselineFile(v.name)}`)
      continue
    }
    const ctx = await b.newContext({ viewport: { width, height: 900 }, storageState: state })
    const p = await ctx.newPage()
    listen(p, v.route)
    const res = await p.goto(base + v.route, { waitUntil: 'networkidle' })
    if (!res || !res.ok() || new URL(p.url()).pathname !== v.route) {
      failures.push(`${v.name}: ${v.route} did not answer`)
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
    checked.push(v.name)
    if (width === 1440) judge(v.name, shot)
    else {
      const { scroll, client } = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
      const over = scroll > client
      if (over) failures.push(`${v.name} scrolls sideways at ${width}`)
      console.log(`${over ? 'FAIL' : 'ok  '}  ${v.name.padEnd(30)} ${width} px: ${over ? `scrolls sideways (${scroll} > ${client})` : 'no horizontal overflow'}`)
      if (width < XL) {
        const cur = await subBarCurrent(p)
        if (cur && !cur.inside) failures.push(`${v.name}: the sub-bar hides the current page at ${width}`)
        console.log(
          `${cur && !cur.inside ? 'FAIL' : 'ok  '}  ${v.name.padEnd(30)} sub-bar: ` +
            (cur ? `«${cur.text}» at ${cur.left}–${cur.right} ${cur.inside ? 'in view' : 'OUT OF VIEW'}` : 'the page is not in the sub-bar'),
        )
        if (!sheetChecked) {
          sheetChecked = true
          const { count, bad } = await sheetKeys(p)
          for (const x of bad) failures.push(`menu sheet: ${x}`)
          console.log(`${bad.length ? 'FAIL' : 'ok  '}  ${'menu sheet'.padEnd(30)} ${bad.length ? bad.join(' · ') : `Tab and Shift+Tab wrap inside its ${count} items; Escape returns focus`}`)
        }
      }
    }
    await ctx.close()
  }

  if (flag('write') && width === 1440) {
    writeFileSync(CLAIMS, JSON.stringify({ ...claims, ...results }, null, 2) + '\n')
    console.log(`claims written: ${Object.keys(results).length} views`)
  }
} finally {
  // however the run ended: the admin opens nothing again until the next run opens it
  try {
    closeAdmin(db)
  } catch (e) {
    failures.push(`the local admin was not closed after the run: ${e.message}`)
  }
  await b.close()
}
console.log(errors.length ? `console errors (${errors.length}): ${errors.slice(0, 5).join(' / ')}` : 'no console errors')
const { ok, reasons } = verdict({ claims, checked, skipped, failures, errors, known: VIEW_ROUTES.map((v) => v.name) })
console.log(ok ? `pass: ${checked.length} of ${views.length} views compared` : `FAIL: ${reasons.join(' · ')}`)
process.exit(ok ? 0 : 1)
