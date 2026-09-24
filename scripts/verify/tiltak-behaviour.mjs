/**
 * Tiltak's behaviour, checked in a browser (design 3, P6, D-75): the Tavle and Liste tabs,
 * the department filter, the card chosen and its address, the detail panel, "Velg som
 * fokus" and "Flytt til …" as real writes, the target a measure aims for, the plan, the
 * keyboard and the phone. Signs in with ORGPULS_DEV_EMAIL / ORGPULS_DEV_PASSWORD
 * (environment, used once, never printed) against :3000 with the design fixture seeded, as
 * a daglig leder.
 *
 * It WRITES: one finding is chosen as focus, that measure is moved on a step, and a target
 * is set. Reseed the fixture afterwards (`node scripts/seed/design-fixture.mjs`), which is
 * the only way rows come back to the design's scenario.
 *
 *   node scripts/verify/tiltak-behaviour.mjs
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

const tab = (name) => p.getByRole('navigation', { name: /^Tiltak:/ }).getByRole('link', { name: new RegExp(`^${name}`) })
const col = (name) => p.getByRole('region', { name, exact: true })
const cards = (name) => col(name).locator('button[aria-pressed]')
const heading = () => p.getByRole('heading', { level: 2 }).first().innerText()
const q = () => new URL(p.url()).searchParams

await p.goto(base + '/tiltak', { waitUntil: 'networkidle' })
ok('Tavle is the default tab', (await tab('Tavle').getAttribute('aria-current')) === 'page')
ok('Tavle counts the measures being worked on: four', (await tab('Tavle').innerText()).includes('4'))
ok('Liste counts every measure: seven', (await tab('Liste').innerText()).includes('7'))
const counts = await Promise.all(['Funn', 'Valgt fokus', 'Tiltak pågår', 'Effekt målt'].map((c) => cards(c).count()))
ok('four columns: 3 findings, 1 focus, 2 running, 1 measured', counts.join() === '3,1,2,1', counts.join())
ok('the late running measure is chosen first', (await heading()) === 'Ytringsklima' && !!q().get('kort'))
ok('its deadline says it lapsed', await p.getByText('Frist gikk ut i går').first().isVisible())
ok('its target is the one set on it', (await p.getByText('Mål', { exact: true }).locator('..').innerText()).includes('33'))
ok('planned rounds are its measurement points', (await p.getByText(/^Puls \d+\. \w+$/).count()) >= 1)
ok(
  'a claim the product cannot keep is not on the page',
  (await p.getByText('Når målet er nådd i to målinger på rad').count()) === 0,
)

await cards('Tiltak pågår').nth(1).click()
ok('pressing a card opens it, and the address follows', (await heading()) === 'Arbeidsmengde')
const kort = q().get('kort')
await p.reload({ waitUntil: 'networkidle' })
ok('the address reopens the same card', (await heading()) === 'Arbeidsmengde' && q().get('kort') === kort)

await p.getByRole('button', { name: 'Verksted', exact: true }).click()
const verksted = await Promise.all(['Funn', 'Tiltak pågår'].map((c) => cards(c).count()))
ok('Verksted: only what concerns Verksted or everyone', verksted[1] === 1, verksted.join())
await p.getByRole('button', { name: 'Alle', exact: true }).click()
ok('Alle brings every card back', (await cards('Tiltak pågår').count()) === 2)

// the plan's rows are buttons: choosing one opens its card too
await p.locator('button[aria-pressed]', { hasText: 'Fadderordning' }).last().click()
ok('a plan row opens its card', (await heading()) === 'Støtte fra leder')

// keyboard: tab to a Funn card and press it
const first = cards('Funn').first()
await first.focus()
await p.keyboard.press('Enter')
const finding = await heading()
ok(
  'a finding opens by keyboard',
  ['Motstridende krav', 'Emosjonelle krav', 'Kontakt og kommunikasjon', 'Rolleklarhet'].includes(finding),
  finding,
)
ok(
  'focus is visible on it',
  await first.evaluate((el) => getComputedStyle(el).outlineStyle !== 'none' || el.matches(':focus-visible')),
)

// writes: choose the finding as focus, then move it on
await p.getByRole('button', { name: 'Velg som fokus' }).last().click()
await p.waitForFunction(() => new URL(location.href).searchParams.get('kort')?.includes('funn:') === false, null, {
  timeout: 15000,
})
await p.waitForLoadState('networkidle')
ok('"Velg som fokus" makes it a measure in Valgt fokus', (await cards('Valgt fokus').count()) === 2)
ok('… and keeps it open', (await heading()) === finding)
await p.getByRole('button', { name: 'Flytt til «Pågår»' }).click()
await p
  .waitForFunction(
    () => document.querySelectorAll('section[aria-label="Tiltak pågår"] button[aria-pressed]').length === 3,
    null,
    {
      timeout: 15000,
    },
  )
  .catch(() => {})
ok('"Flytt til «Pågår»" moves it to Tiltak pågår', (await cards('Tiltak pågår').count()) === 3)

await tab('Liste').click()
await p.waitForURL(/fane=liste/)
await p.waitForLoadState('networkidle')
ok('Liste is a tab with its own address', (await tab('Liste').getAttribute('aria-current')) === 'page')
await p.getByRole('button', { name: 'Rediger' }).first().click()
const target = p.getByLabel('Mål (indeks 0–100)').first()
ok('a measure has a target field', await target.isVisible())
ok('it holds the target set', (await target.inputValue()) === '33', await target.inputValue())
await target.fill('101')
ok('above 100 is refused by the field', !(await target.evaluate((el) => el.checkValidity())))
await target.fill('35')
await p.getByRole('button', { name: 'Ferdig' }).first().click()
await p.waitForLoadState('networkidle')
await p.goto(base + '/tiltak', { waitUntil: 'networkidle' })
await cards('Tiltak pågår').first().click()
ok('the Tavle reads the new target', (await p.getByText('Mål', { exact: true }).locator('..').innerText()).includes('35'))

await p.setViewportSize({ width: 390, height: 844 })
for (const path of ['/tiltak', '/tiltak?fane=liste']) {
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
