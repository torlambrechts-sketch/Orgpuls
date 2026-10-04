/**
 * Admin screen states for the work-package screenshots, against the LOCAL QA stack only: signs the fixture's local
 * admin in (TOTP), then for each state runs its SQL, opens the page at each width, plays its steps and captures the
 * full page with the HTTP status, horizontal overflow and console errors. The QA server must be running
 * (`node scripts/qa/serve.mjs`, port QA_PORT, default 3100).
 *
 *   node scripts/qa/admin-shots.mjs states.json docs/crm-enrichment/screens/phase-1
 *
 * A state: { name, path, widths?: [1440, 390], sql?, each?, eachAfter?, after?, scrollTo?, steps?: [...] } where a
 * step is one of { click: 'Button name' }, { clickSel: 'css' }, { open: 'css' }, { fill: 'css', value },
 * { select: 'css', value }, { upload: 'css', name, content }, { drag: 'css', to: 'css' }, each with optional
 * { wait: 'css', pause: ms }. `sql` runs once before the state, `after` once after it; `each`/`eachAfter` around
 * every width. report.json in the output folder lists every capture.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { closeAdmin, DEFAULT_DB, LOCAL_ADMIN, openAdmin, psqlEnv } from '../seed/sentral-fixture.mjs'
import { acquireAdminLock, releaseAdminLock, totp } from '../verify/admin-session.mjs'

const [statesArg, outDir] = process.argv.slice(2)
if (!statesArg || !outDir) {
  console.error('usage: node scripts/qa/admin-shots.mjs <states.json> <output folder>')
  process.exit(2)
}
const states = JSON.parse(statesArg.trim().startsWith('[') ? statesArg : readFileSync(statesArg, 'utf8'))
const base = `http://127.0.0.1:${process.env.QA_PORT ?? 3100}`
const sql = (q) => q && execFileSync('psql', [DEFAULT_DB, '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { env: psqlEnv() })

async function run(pg, step) {
  if (step.open) {
    const el = pg.locator(step.open).first()
    await el.scrollIntoViewIfNeeded()
    await el.click()
  } else if (step.fill) await pg.locator(step.fill).first().fill(step.value)
  else if (step.select) await pg.locator(step.select).first().selectOption(step.value)
  else if (step.upload) await pg.locator(step.upload).first().setInputFiles({ name: step.name, mimeType: 'text/csv', buffer: Buffer.from(step.content) })
  else if (step.drag) await pg.locator(step.drag).first().dragTo(pg.locator(step.to).first())
  else if (step.click) await pg.getByRole('button', { name: step.click, exact: true }).first().click()
  else if (step.clickSel) await pg.locator(step.clickSel).first().click()
  if (step.wait) await pg.waitForSelector(step.wait, { timeout: 15000 })
  await pg.waitForTimeout(step.pause ?? 300)
}

await acquireAdminLock()
const browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' })
const report = []
try {
  openAdmin(DEFAULT_DB)
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const p = await ctx.newPage()
  await p.goto(`${base}/admin/login`, { waitUntil: 'networkidle' })
  await p.fill('input[name=email]', LOCAL_ADMIN.email)
  await p.fill('input[name=password]', LOCAL_ADMIN.password)
  await Promise.all([p.waitForURL('**/admin/mfa', { timeout: 20000 }), p.click('button[type=submit]')])
  await p.locator('main button').first().click()
  await p.waitForSelector('code', { timeout: 20000 })
  const secret = (await p.textContent('code')).trim()
  let ok = false
  for (let i = 0; i < 2 && !ok; i++) {
    await p.fill('input[name=code]', totp(secret))
    await p.click('form button[type=submit]')
    ok = await p.waitForURL((u) => u.pathname === '/admin', { timeout: 15000 }).then(() => true, () => false)
    if (!ok) await p.waitForTimeout(31000 - (Date.now() % 30000))
  }
  if (!ok) throw new Error('admin-shots: sign-in failed')
  const storageState = await ctx.storageState()
  await ctx.close()

  mkdirSync(outDir, { recursive: true })
  for (const st of states) {
    sql(st.sql)
    for (const width of st.widths ?? [1440, 390]) {
      sql(st.each)
      const c = await browser.newContext({ viewport: { width, height: 900 }, storageState })
      const pg = await c.newPage()
      const errors = []
      pg.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)))
      pg.on('pageerror', (e) => errors.push(String(e).split('\n')[0]))
      const res = await pg.goto(base + st.path, { waitUntil: 'networkidle' })
      let failed = null
      for (const step of st.steps ?? []) {
        try {
          await run(pg, step)
        } catch (e) {
          failed = `${JSON.stringify(step).slice(0, 120)}: ${String(e).split('\n')[0]}`
          break
        }
      }
      if (st.scrollTo) await pg.locator(st.scrollTo).first().scrollIntoViewIfNeeded().catch(() => {})
      const overflowPx = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      const file = `${st.name}-${width}.png`
      await pg.screenshot({ path: `${outDir}/${file}`, fullPage: true })
      report.push({ width, state: st.name, status: res?.status() ?? 0, overflowPx, errors, file, ...(failed ? { failed } : {}) })
      await c.close()
      sql(st.eachAfter)
    }
    sql(st.after)
  }
} finally {
  try {
    closeAdmin(DEFAULT_DB)
  } catch (e) {
    console.error(`admin-shots: the local admin was not retired: ${String(e).split('\n')[0]}`)
  }
  await browser.close()
  releaseAdminLock()
  writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2) + '\n')
}
console.log(report.map((r) => `${r.state} ${r.width} ${r.status} overflow=${r.overflowPx} errors=${r.errors.length}${r.failed ? ` FAILED ${r.failed}` : ''}`).join('\n'))
