/**
 * The public site's product pictures (D-84): real screens of the running app, signed in
 * to the design fixture's organisation, Nordvik Anlegg AS. Nothing in them is drawn: each
 * one is a crop of a page as a daglig leder sees it, so every figure in it is the
 * fixture's own (index 61, 28 av 34) and the page's caption says whose data it is.
 *
 * Each shot is a region of one route: the union of a few anchors, found by the words the
 * page shows, padded so the cards keep their edges. It is captured at twice the pixel
 * density and written as WebP to assets/produkt/<id>.webp, where the site imports it.
 *
 * Run it after a screen changes, against a server on the fixture (a reseed first keeps
 * the relative dates fresh):
 *
 *   node scripts/marketing/product-shots.mjs                 # every shot
 *   node scripts/marketing/product-shots.mjs varmekart tiltak
 *   node scripts/marketing/product-shots.mjs --base http://localhost:3000
 *
 * Signs in with ORGPULS_DEV_EMAIL / ORGPULS_DEV_PASSWORD from the environment, used once
 * and never printed.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { chromium } from 'playwright-core'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : fallback
}
const base = arg('base', 'http://localhost:3000')
const out = 'assets/produkt'
const only = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'))

/** The nearest ancestor that is a card: it has a border and a rounded corner. */
const card = (text) => ({ text, up: "contains(@class,'border') and contains(@class,'rounded')" })
/** The nearest rounded ancestor, for a panel drawn by its fill alone (the board's columns). */
const panel = (text) => ({ text, up: "contains(@class,'rounded')" })
const at = (text) => ({ text, up: null })

/**
 * `anchors` are unioned; `pad` is added round them; `maxHeight` cuts a long list off
 * where a reader has seen enough of it; `hide` removes one element, by its words, first. Widths are CSS pixels at the given viewport.
 */
const SHOTS = [
  {
    id: 'oversikt',
    route: '/innsikt',
    width: 1440,
    anchors: [at('Nordvik Anlegg · Arbeidsmiljøet'), card('Slik står det til på hvert område')],
    pad: 20,
  },
  { id: 'resultater', route: '/resultater', width: 1440, anchors: [card('Gruppe × faktor'), card('Fiks først')], pad: 12 },
  // the heatmap alone, for a half-width card on the start page, where both would be too small to read
  { id: 'varmekart', route: '/resultater', width: 1440, anchors: [card('Gruppe × faktor')], pad: 12, maxHeight: 400 },
  {
    id: 'kommentarer',
    route: '/kommentarer',
    width: 1440,
    anchors: [card('Temaer'), card('Alle kommentarer')],
    pad: 20,
    maxHeight: 560,
  },
  { id: 'samtaler', route: '/kommentarer', width: 1440, anchors: [card('Alle kommentarer')], pad: 12, maxHeight: 304 },
  {
    id: 'tiltak',
    route: '/tiltak',
    width: 1440,
    anchors: [at('Fra funn til effekt'), panel('Ny måling viser om det virket'), panel('Foreslått ut fra skår')],
    pad: 12,
  },
  { id: 'arshjul', route: '/malinger', width: 1440, anchors: [card('Årshjulet')], pad: 20 },
  {
    id: 'sporsmal',
    route: '/forhandsvis',
    width: 390,
    anchors: [card('Hopp over')],
    pad: 14,
    // the leader's preview is the respondent's own flow plus this banner; without it, the
    // picture is what an employee sees
    hide: 'Forhåndsvisning — ingenting du velger her blir sendt.',
  },
  { id: 'rapport', route: '/rapport', width: 1440, anchors: [at('3. Kartlegging'), at('Anerkjennelse og mening')], pad: 24 },
]

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const p = await ctx.newPage()

await p.goto(`${base}/logg-inn`, { waitUntil: 'networkidle' })
await p.getByLabel(/e-post|email/i).fill(process.env.ORGPULS_DEV_EMAIL ?? '')
await p.getByLabel(/passord|password/i).fill(process.env.ORGPULS_DEV_PASSWORD ?? '')
await Promise.all([
  p.waitForURL((u) => !u.pathname.startsWith('/logg-inn')),
  p.getByRole('button', { name: /logg inn|sign in/i }).click(),
])

mkdirSync(out, { recursive: true })
let failed = 0
for (const s of SHOTS.filter((s) => !only.length || only.includes(s.id))) {
  await p.setViewportSize({ width: s.width, height: 900 })
  await p.goto(base + s.route, { waitUntil: 'networkidle' })
  await p.mouse.move(0, 0)
  await p.waitForTimeout(700)
  if (s.hide)
    await p
      .getByText(s.hide)
      .first()
      .evaluate((el) => el.remove())

  const boxes = []
  for (const a of s.anchors) {
    const el = p.getByText(a.text, { exact: false }).first()
    const target = a.up ? el.locator(`xpath=ancestor::*[${a.up}][1]`) : el
    const box = await target.boundingBox({ timeout: 5000 }).catch(() => null)
    if (!box) {
      console.error(`${s.id}: anchor not found: ${a.text}`)
      failed++
      continue
    }
    boxes.push(box)
  }
  if (boxes.length !== s.anchors.length) continue

  // boundingBox is relative to the viewport; the clip wants page coordinates
  const scrollY = await p.evaluate(() => window.scrollY)
  const x0 = Math.max(0, Math.min(...boxes.map((r) => r.x)) - s.pad)
  const y0 = Math.max(0, Math.min(...boxes.map((r) => r.y)) + scrollY - s.pad)
  const x1 = Math.min(s.width, Math.max(...boxes.map((r) => r.x + r.width)) + s.pad)
  let y1 = Math.max(...boxes.map((r) => r.y + r.height)) + scrollY + s.pad
  if (s.maxHeight) y1 = Math.min(y1, y0 + s.maxHeight)
  const clip = { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) }

  const png = await p.screenshot({ clip, fullPage: true })
  const file = join(out, `${s.id}.webp`)
  const info = await sharp(png).webp({ quality: 84 }).toFile(file)
  console.log(`${file} ${info.width}x${info.height} ${Math.round(info.size / 1024)} kB`)
}

await b.close()
process.exit(failed ? 1 : 0)
