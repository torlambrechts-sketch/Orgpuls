/**
 * Captures the v3 design baselines (the design of 24 September, `Orgpuls.dc_2`) from the
 * prototype itself, the way the first twelve were captured: headless Chromium, --no-sandbox,
 * a 1440 x 900 viewport, full page, each state from a cold load.
 *
 * The prototype has no router, so every state is reached the way a person reaches it: by
 * pressing the buttons the design draws. A step names a button by its visible text; a tab
 * whose label carries a count ("Historikk 7") is named without it. A press goes to the
 * topmost button with that text, which is what a click at that spot would hit — the
 * footer repeats most nav labels, and the wizard is drawn over the page.
 *
 * The wizard is a fixed overlay, so its nine steps are captured at the viewport, not full
 * page: a full-page capture stretches the viewport and re-centres a fixed element, which
 * would be comparing a layout nobody sees.
 *
 * It needs the prototype served over HTTP with its runtime (React 18 UMD and Babel
 * standalone) where support.js expects it — see docs/DEVIATIONS.md D-67 for the serving
 * root. It writes PNGs and prints their names; it reads no credential.
 *
 *   node scripts/verify/baseline-v3.mjs --url http://localhost:8765/Orgpuls_v3_Offline_Source.html \
 *     --out design-reference/orgpuls/baselines-v3
 */
import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}
const url = arg('url')
const outDir = arg('out', 'design-reference/orgpuls/baselines-v3')
const only = arg('only', null)
if (!url) {
  console.error('give --url to the served offline source')
  process.exit(2)
}
mkdirSync(outDir, { recursive: true })

const executablePath = ['/opt/pw-browsers/chromium', `${process.env.PLAYWRIGHT_BROWSERS_PATH ?? ''}/chromium`]
  .find((p) => p && existsSync(p))
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(executablePath ? { executablePath } : {}) })

/** Press the topmost visible button whose text (less a trailing count) is `name`. */
async function press(page, name) {
  const hit = await page.evaluate((n) => {
    const label = (b) => b.innerText.trim().replace(/\s+/g, ' ')
    const bare = (s) => s.replace(/\s+\d+$/, '')
    const topmost = (b) => {
      const r = b.getBoundingClientRect()
      if (!r.width || !r.height) return false
      b.scrollIntoView({ block: 'center' })
      const q = b.getBoundingClientRect()
      const e = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2)
      return !!e && (e === b || b.contains(e))
    }
    const b = [...document.querySelectorAll('button')].find((x) => (label(x) === n || bare(label(x)) === n) && topmost(x))
    if (b) b.click()
    return !!b
  }, name)
  if (!hit) throw new Error(`no button "${name}"`)
  await page.waitForTimeout(600)
}

async function role(page, value) {
  await page.locator('select').filter({ hasText: 'Daglig leder' }).first().selectOption({ label: value })
  await page.waitForTimeout(600)
}

async function title(page, t) {
  await page.locator(`[title="${t}"]`).first().click()
  await page.waitForTimeout(600)
}

const full = (steps) => [['press', 'Full'], ...steps]
const WIZARD = ['Velkommen', 'Virksomheten', 'Ansatte', 'Grupper og terskel', 'Verneombud', 'Hva dere måler',
  'Rytme og oppfølging', 'Første utsending', 'Klart']

/** [file, steps, options] — every state the design draws that a screen must reproduce. */
const STATES = [
  ['01-oversikt-enkel', []],
  ['02-innsikt-full', full([])],
  ['03-malinger-kommende', full([['press', 'Målinger']])],
  ['04-malinger-historikk', full([['press', 'Målinger'], ['press', 'Historikk']])],
  ['05-malinger-arshjul', full([['press', 'Målinger'], ['press', 'Årshjul']])],
  ['06-malinger-sporsmalssett', full([['press', 'Målinger'], ['press', 'Spørsmålssett']])],
  ['07-resultater-varmekart', full([['press', 'Resultater']])],
  ['08-resultater-prioritet', full([['press', 'Resultater'], ['press', 'Prioritet']])],
  ['09-resultater-segmentprofil', full([['press', 'Resultater'], ['press', 'Segmentprofil']])],
  ['10-resultater-sammenlign', full([['press', 'Resultater'], ['press', 'Sammenlign']])],
  ['11-resultater-utvikling', full([['press', 'Resultater'], ['press', 'Utvikling']])],
  ['12-kommentarer', full([['press', 'Kommentarer']])],
  ['13-tiltak-tavle', full([['press', 'Tiltak']])],
  ['14-tiltak-liste', full([['press', 'Tiltak'], ['press', 'Liste']])],
  ['15-oppsett-selskap', full([['press', 'Oppsett']])],
  ['16-innsikt-verneombud', full([['role', 'Verneombud']])],
  ['17-innsikt-avdelingsleder', full([['role', 'Avdelingsleder']])],
  ['18-side-innsikt', full([['title', 'Bytt til sidemeny og full bredde']])],
  ['19-side-resultater', full([['title', 'Bytt til sidemeny og full bredde'], ['press', 'Resultater']])],
  ['20-side-sammentrukket', full([['title', 'Bytt til sidemeny og full bredde'], ['title', 'Trekk sammen menyen']])],
  ['21-hjelp', [['press', 'Hjelp']]],
  ['22-oversikt-telefon', [], { width: 390 }],
  ['23-panel-hjelp', full([['press', 'Hjelp']]), { viewport: true }],
  ['24-panel-grunnlag', full([['press', 'Hjelp'], ['press', 'Grunnlag og lov']]), { viewport: true }],
  ['25-panel-tuva', full([['press', 'Hjelp'], ['press', 'Tuva']]), { viewport: true }],
  ...WIZARD.map((step, i) => [
    `${String(30 + i)}-veiviser-${i + 1}`,
    [['press', 'Veiviser'], ...Array.from({ length: i }, (_, j) => ['press', j === 0 ? 'Kom i gang' : j === 7 ? 'Planlegg utsendingen' : 'Neste'])],
    { viewport: true, expect: step },
  ]),
]

let failed = 0
for (const [file, steps, opts = {}] of STATES) {
  if (only && !file.includes(only)) continue
  const context = await browser.newContext({ viewport: { width: opts.width ?? 1440, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  try {
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(1500)
    for (const [kind, value] of steps) {
      if (kind === 'press') await press(page, value)
      else if (kind === 'role') await role(page, value)
      else if (kind === 'title') await title(page, value)
    }
    if (opts.expect) {
      const seen = await page.getByText(opts.expect, { exact: true }).count()
      if (!seen) throw new Error(`the wizard is not on "${opts.expect}"`)
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(outDir, `${file}.png`), fullPage: !opts.viewport })
    console.log(file + (errors.length ? `  (page errors: ${errors.length})` : ''))
  } catch (e) {
    failed++
    console.error(`${file}: ${e.message}`)
  }
  await context.close()
}
await browser.close()
process.exit(failed ? 1 : 0)
