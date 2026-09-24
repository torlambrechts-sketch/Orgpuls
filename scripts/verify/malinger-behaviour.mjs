/**
 * Målinger's behaviour, checked in a browser (design 3, P5, D-74): the year rail, the four
 * tabs and their addresses, Historikk's filters and sort, the links into Resultater and
 * Måleoppsett, the old /arshjulet address, the keyboard and the phone. Signs in with
 * ORGPULS_DEV_EMAIL / ORGPULS_DEV_PASSWORD (environment, used once, never printed) against
 * :3000 with the design fixture seeded, as a daglig leder. It writes nothing:
 * "Start neste puls nå" is proved by supabase/tests/start_pulse_invariants.sql, and the
 * fixture has a puls open, so the card says why it cannot start one.
 *
 *   node scripts/verify/malinger-behaviour.mjs
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

const rail = () => p.getByRole('region', { name: 'Årshjulet' })
const months = () => rail().locator('button[aria-pressed]')
const detail = () => rail().locator('.bg-bg .text-\\[14px\\]').first().innerText()
const tab = (name) => p.getByRole('navigation', { name: /^Målinger:/ }).getByRole('link', { name: new RegExp(`^${name}`) })
const q = () => new URL(p.url()).searchParams

await p.goto(base + '/malinger', { waitUntil: 'networkidle' })
ok('Kommende is the default tab', (await tab('Kommende').getAttribute('aria-current')) === 'page')
ok('the rail draws twelve months', (await months().count()) === 12)
ok('the current month is pressed, with the latest grunnlinje', (await detail()) === 'Grunnlinje 2026', await detail())
ok(
  'its line reads the real rate and index',
  await rail().getByText('28 av 34 svarte (82 %) · indeks 61 · −3 fra 2025').isVisible(),
)
await months().nth(2).click()
ok('pressing March shows the puls it measured', (await detail()) === 'Puls mars 2026' && q().get('maned') === '3')
ok(
  '… with a link to its result',
  (await rail().getByRole('link', { name: 'Se resultatet' }).getAttribute('href')).includes('maling='),
)
await months().nth(11).focus()
await p.keyboard.press('Enter')
ok(
  'December by keyboard: the planned puls, and its setup',
  (await detail()).startsWith('Puls desember') &&
    (await rail().getByRole('link', { name: 'Se oppsett' }).getAttribute('href')).startsWith('/maleoppsett?runde='),
)
await rail().getByRole('link', { name: '2025', exact: true }).click()
await p.waitForURL(/ar=2025/)
await p.waitForLoadState('networkidle')
ok(
  'another year is another set of rounds',
  (await rail()
    .getByText(/målinger i 2025/)
    .count()) === 1,
)

await p.goto(base + '/malinger', { waitUntil: 'networkidle' })
ok('Kommende lists the rounds not closed, the open one first', (await p.getByText('Pågår', { exact: true }).count()) >= 1)
ok(
  'the open puls says when it closes',
  await p
    .getByText(/lukkes \d+\. \w+/)
    .first()
    .isVisible(),
)
ok(
  'the latest result has its line, and a way to the history',
  await p.getByText(/^Siste gjennomførte: Grunnlinje 2026/).isVisible(),
)
ok(
  'with a round open, the card says why no puls can start',
  await p.getByText('En runde er åpen nå. Neste puls kan startes når den er lukket.').isVisible(),
)
await p.getByRole('link', { name: 'Vis i årshjulet' }).nth(1).click()
await p
  .waitForFunction(
    () => document.querySelectorAll('section button[aria-pressed="true"]')[0]?.textContent?.startsWith('Des'),
    null,
    { timeout: 10000 },
  )
  .catch(() => {})
ok('"Vis i årshjulet" presses that month on the rail', (await detail()).startsWith('Puls desember'), await detail())

await tab('Historikk').click()
await p.waitForURL(/fane=historikk/)
await p.waitForLoadState('networkidle')
const hist = () => p.locator('main .rounded-note .grid.items-center')
ok('Historikk lists every closed round', (await hist().count()) === 7)
ok('a puls is read against the puls before, on what both measured', await p.getByText('−3 fra forrige puls').isVisible())
await p.getByRole('button', { name: 'Pulser', exact: true }).click()
ok('Pulser: three', (await hist().count()) === 3)
await p.getByRole('button', { name: '2025', exact: true }).click()
ok('Pulser in 2025: two', (await hist().count()) === 2)
await p.getByRole('button', { name: 'Alle', exact: true }).first().click()
await p.getByRole('button', { name: 'Alle', exact: true }).nth(1).click()
await p.getByLabel('Sorter målinger').selectOption('indeks')
ok('"Lavest indeks" puts Puls mai 2025 (47) first', (await hist().first().innerText()).startsWith('Puls mai 2025'))
ok(
  '"Sammenlign med 2026" opens Resultater with the comparison',
  (await p.getByRole('link', { name: 'Sammenlign med 2026' }).first().getAttribute('href')).includes('&mot='),
)

await tab('Årshjul').click()
await p.waitForURL(/fane=arshjul/)
await p.waitForLoadState('networkidle')
ok(
  "Årshjul is a tab, its title an h2 under the page's h1",
  (await p.getByRole('heading', { level: 2, name: 'Årshjul og automatikk' }).count()) === 1,
)
await p.goto(base + '/arshjulet', { waitUntil: 'networkidle' })
ok('the old /arshjulet address lands on the tab', q().get('fane') === 'arshjul' && new URL(p.url()).pathname === '/malinger')
await tab('Spørsmålssett').click()
await p.waitForURL(/fane=sporsmal/)
await p.waitForLoadState('networkidle')
ok('Spørsmålssett shows the eleven factors', (await p.getByText(/^3 påstander$/).count()) === 11)

await p.setViewportSize({ width: 390, height: 844 })
for (const path of ['/malinger', '/malinger?fane=historikk', '/malinger?fane=arshjul', '/malinger?fane=sporsmal']) {
  await p.goto(base + path, { waitUntil: 'networkidle' })
  ok(
    `phone ${path}: no horizontal scroll`,
    await p.evaluate(() => document.documentElement.scrollWidth <= 390),
    String(await p.evaluate(() => document.documentElement.scrollWidth)),
  )
}
ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' / '))
await b.close()
process.exit(failed ? 1 : 0)
