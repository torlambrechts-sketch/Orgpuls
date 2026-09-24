/**
 * Resultater's behaviour, checked in a browser (design 3, P3, D-72): the default cell, the
 * withheld rows, selecting by pointer and keyboard, the URL keeping the cell, "Sammenlign
 * med", the five views, a puls, and the phone. Signs in with ORGPULS_DEV_EMAIL /
 * ORGPULS_DEV_PASSWORD (environment, used once, never printed) against :3000 with the design
 * fixture seeded, as a daglig leder.
 *
 * With --adopt it WRITES: one playbook suggestion becomes a measure. Reseed afterwards.
 *
 *   node scripts/verify/resultater-behaviour.mjs [--adopt]
 */
import { chromium } from 'playwright-core'
const base = 'http://localhost:3000'
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
})
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addCookies([{ name: 'op_view', value: 'full', url: base }])
const p = await ctx.newPage()
const errors = []
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
p.on('pageerror', (e) => errors.push(String(e)))
let failed = 0
const ok = (name, cond, detail = '') => {
  if (!cond) failed++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
await p.goto(base + '/logg-inn', { waitUntil: 'networkidle' })
await p.getByLabel(/e-post|email/i).fill(process.env.ORGPULS_DEV_EMAIL)
await p.getByLabel(/passord|password/i).fill(process.env.ORGPULS_DEV_PASSWORD)
await Promise.all([
  p.waitForURL((u) => !u.pathname.startsWith('/logg-inn')),
  p.getByRole('button', { name: /logg inn|sign in/i }).click(),
])

const drill = () => p.locator('h2.font-display').first().innerText()
const pressed = () => p.locator('[role=tabpanel] button[aria-pressed=true]').first().getAttribute('aria-label')
const q = () => new URL(p.url()).searchParams

await p.goto(base + '/resultater', { waitUntil: 'networkidle' })
ok('the latest grunnlinje is in view', (await p.getByRole('heading', { level: 1 }).innerText()) === 'Grunnlinje 2026')
ok(
  'it opens on the lowest released cell: Verksted × Ytringsklima',
  (await pressed()) === 'Verksted, Ytringsklima: 28',
  String(await pressed()),
)
ok('the drill-down follows it', (await drill()) === 'Ytringsklima')
ok(
  'Administrasjon (3) and Drift (protected) are drawn and cannot be pressed',
  (await p.locator('[role=tabpanel] [role=img]').count()) === 22,
  String(await p.locator('[role=tabpanel] [role=img]').count()),
)
ok('no quote under a group (D2)', (await p.locator('text=/^«/').count()) === 0)
ok(
  "the statements are the instrument's own",
  await p.getByText('Jeg kan si fra om kritikkverdige forhold uten å frykte konsekvenser').isVisible(),
)

await p.getByRole('button', { name: 'Prosjekt, Arbeidsmengde: 31' }).click()
ok('pressing a cell moves the drill-down', (await drill()) === 'Arbeidsmengde')
ok('… and the suggestions', await p.getByRole('heading', { name: 'Forslag basert på resultatene · Prosjekt' }).isVisible())
ok('… and the URL', q().get('gruppe') === 'Prosjekt' && q().get('faktor') === 'mengde', p.url())
await p.reload({ waitUntil: 'networkidle' })
ok('a reload keeps the cell', (await pressed()) === 'Prosjekt, Arbeidsmengde: 31')

await p.getByRole('button', { name: /^Hele virksomheten, Mening/ }).focus()
await p.keyboard.press('Enter')
ok('Enter selects a focused cell (keyboard)', (await drill()) === 'Mening og anerkjennelse')
ok('the whole organisation shows a comment', (await p.locator('text=/^«/').count()) === 1)
ok('focus is visible on a cell', await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'))

// Sammenlign med
await p.getByRole('link', { name: '2025', exact: true }).nth(1).click()
await p.waitForURL(/mot=/)
await p.waitForLoadState('networkidle')
ok(
  '"Sammenlign med 2025" puts a change in every cell released both years (Verksted was withheld in 2025)',
  (await p.locator('[role=tabpanel] button[aria-pressed] span').count()) === 22,
  String(await p.locator('[role=tabpanel] button[aria-pressed] span').count()),
)
ok(
  'the header reads the span',
  await p
    .getByText(/−3 2025→2026/)
    .first()
    .isVisible(),
)
await p.getByRole('link', { name: 'Ingen', exact: true }).click()
await p.waitForURL((u) => !u.search.includes('mot='))
await p.waitForLoadState('networkidle')

// the views
await p.getByRole('tab', { name: 'Prioritet' }).click()
const seg = () => p.locator('div:has(> div > h2.font-display) > div > span.uppercase').first().innerText()
ok('Prioritet opens on the whole organisation', (await seg()).toLowerCase() === 'hele virksomheten', await seg())
ok('… with Ytringsklima to fix first', await p.getByRole('button', { name: /^Ytringsklima: skår 41/ }).isVisible())
await p.getByRole('tab', { name: 'Segmentprofil' }).click()
ok(
  'Segmentprofil opens on a released group, withheld ones disabled',
  (await p.locator('[role=tabpanel] button[disabled]').count()) === 2 &&
    (await p.locator('[role=tabpanel] button[aria-pressed=true]').count()) >= 1,
)
await p.getByRole('tab', { name: 'Sammenlign' }).click()
ok('Sammenlign reads the year before', await p.getByText('Grunnlinje 2026 mot Grunnlinje 2025').isVisible())
await p.getByRole('tab', { name: 'Utvikling' }).click()
ok(
  'Utvikling draws every closed round and the one running',
  (await p
    .locator('[role=tabpanel]')
    .getByText(/^(Grunnlinje|Puls|Pågår)$/)
    .count()) === 8,
  String(
    await p
      .locator('[role=tabpanel]')
      .getByText(/^(Grunnlinje|Puls|Pågår)$/)
      .count(),
  ),
)
ok('?visning is mirrored', q().get('visning') === 'utvikling')

// a puls
await p.getByRole('link', { name: 'Mar 26', exact: true }).click()
await p
  .getByRole('heading', { level: 1, name: 'Puls mars 2026' })
  .waitFor({ timeout: 10000 })
  .catch(() => {})
ok('a puls opens its own view', (await p.getByRole('heading', { level: 1 }).innerText()) === 'Puls mars 2026')
ok('… with the mean of what it measured, labelled so', await p.getByText('Snitt av faktorene som ble målt').isVisible())
ok('… and no "Sammenlign med"', (await p.getByText('Sammenlign med', { exact: true }).count()) === 0)

if (process.argv.includes('--adopt')) {
  await p.goto(base + '/resultater', { waitUntil: 'networkidle' })
  const btn = p.getByRole('button', { name: 'Legg i plan' }).first()
  await btn.click()
  await p.waitForTimeout(2000)
  ok('"Legg i plan" says so', await p.getByRole('status').first().isVisible())
  await p.reload({ waitUntil: 'networkidle' })
  ok('… and it is still in the plan after a reload', (await p.getByRole('button', { name: 'I planen ✓' }).count()) >= 1)
}

await p.setViewportSize({ width: 390, height: 844 })
await p.goto(base + '/resultater', { waitUntil: 'networkidle' })
ok(
  'phone: no horizontal scroll',
  await p.evaluate(() => document.documentElement.scrollWidth <= 390),
  String(await p.evaluate(() => document.documentElement.scrollWidth)),
)
ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' / '))
await b.close()
process.exit(failed ? 1 : 0)
