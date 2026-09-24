/**
 * Kommentarer's behaviour, checked in a browser (design 3, P4, D-73): the counts, the
 * filters and the URL, a deep link from Resultater's drill-down, no group anywhere (D2),
 * the keyboard, and the phone. Signs in with ORGPULS_DEV_EMAIL / ORGPULS_DEV_PASSWORD
 * (environment, used once, never printed) against :3000 with the design fixture seeded, as
 * a daglig leder.
 *
 * With --reply it WRITES one anonymous reply. Reseed afterwards.
 *
 *   node scripts/verify/kommentarer-behaviour.mjs [--reply]
 */
import { chromium } from 'playwright-core'
const base = 'http://localhost:3000'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
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

const cards = () => p.locator('.rounded-tile.bg-bg')
const q = () => new URL(p.url()).searchParams
const tab = () =>
  p.getByRole('navigation', { name: 'Resultater, kommentarer og tiltak' }).getByRole('link', { name: /^Kommentarer/ })
const GROUPS = ['Drift', 'Prosjekt', 'Verksted', 'Administrasjon', 'Gruppe skjult']

await p.goto(base + '/kommentarer', { waitUntil: 'networkidle' })
ok("the tab is current under Resultater's frame", (await tab().getAttribute('aria-current')) === 'page')
ok(
  'every comment, the waiting ones first',
  (await cards().count()) === 18 &&
    (await cards()
      .first()
      .getByText(/^Venter/)
      .count()) === 1,
)
ok(
  'the counts: Alle 18, Ubesvart 10, Besvart 8',
  (await p.getByRole('button', { name: 'Alle · 18' }).isVisible()) &&
    (await p.getByRole('button', { name: 'Ubesvart · 10' }).isVisible()) &&
    (await p.getByRole('button', { name: 'Besvart · 8' }).isVisible()),
)
ok('the tab badge agrees with Ubesvart', (await tab().innerText()).includes('10'))
const text = await p.locator('.animate-ht-in').first().innerText()
ok(
  'no group is named anywhere on the screen (D2)',
  !GROUPS.some((g) => text.includes(g)),
  GROUPS.filter((g) => text.includes(g)).join(','),
)
ok('a reply field on every waiting comment', (await p.getByPlaceholder('Svar anonymt …').count()) === 10)

await p
  .getByRole('button', { name: /^Ytringsklima/ })
  .first()
  .click()
ok(
  'a theme filters the list',
  (await cards().count()) === 5 && (await p.getByRole('heading', { name: 'Ytringsklima' }).count()) === 1,
)
ok('… and is in the URL', q().get('faktor') === 'ytring')
await p.getByRole('button', { name: /^Besvart · / }).click()
ok('status narrows it further', (await cards().count()) === (await p.getByText('Du svarte:').count()))
await p.reload({ waitUntil: 'networkidle' })
ok(
  'a reload keeps both',
  (await p.getByRole('button', { name: /^Besvart · / }).getAttribute('aria-pressed')) === 'true' &&
    q().get('faktor') === 'ytring',
)
await p.getByRole('link', { name: 'Se tallene og forslagene →' }).click()
await p.waitForURL('**/resultater**')
await p.waitForLoadState('networkidle')
ok(
  '"Se tallene og forslagene" opens the factor for the whole organisation',
  (await p.locator('h2.font-display').first().innerText()) === 'Ytringsklima',
)

// the drill-down's link comes back with the round and the factor
await p
  .getByRole('link', { name: /kommentarer? om dette/ })
  .first()
  .click()
await p.waitForURL('**/kommentarer**')
await p.waitForLoadState('networkidle')
ok(
  "Resultater's link opens the round and the factor",
  q().get('faktor') === 'ytring' && !!q().get('maling') && (await cards().count()) >= 1,
)

await p.goto(base + '/kommentarer', { waitUntil: 'networkidle' })
await p.getByRole('button', { name: /^Grunnlinje 2024 · / }).focus()
await p.keyboard.press('Enter')
ok('a round by keyboard', (await cards().count()) === 2 && q().get('maling') !== null)
ok('focus is visible on a chip', await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'))

if (process.argv.includes('--reply')) {
  await p.goto(base + '/kommentarer?status=ubesvart', { waitUntil: 'networkidle' })
  const field = p.getByPlaceholder('Svar anonymt …').first()
  await field.fill('Takk, vi tar det opp på neste ledermøte.')
  await field.press('Enter')
  await p.waitForTimeout(2500)
  ok('a reply moves the comment to Besvart', await p.getByRole('button', { name: 'Ubesvart · 9' }).isVisible())
  await p.goto(base + '/kommentarer?status=besvart', { waitUntil: 'networkidle' })
  ok(
    '… with "Du svarte:" read back from the thread',
    (await p.getByText('Takk, vi tar det opp på neste ledermøte.').count()) === 1,
  )
}

await p.setViewportSize({ width: 390, height: 844 })
await p.goto(base + '/kommentarer', { waitUntil: 'networkidle' })
ok(
  'phone: no horizontal scroll',
  await p.evaluate(() => document.documentElement.scrollWidth <= 390),
  String(await p.evaluate(() => document.documentElement.scrollWidth)),
)
ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' / '))
await b.close()
process.exit(failed ? 1 : 0)
