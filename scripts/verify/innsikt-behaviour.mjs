/**
 * Innsikt's behaviour, checked in a browser (D-244): which view a person starts in, the «Visning»
 * switch and that it is remembered, what each view links to, the keyboard, and the phone. Signs in
 * with ORGPULS_DEV_EMAIL / ORGPULS_DEV_PASSWORD (environment, used once, never printed) against
 * :3000 with the design fixture seeded. It writes nothing but the visit day (0210) and cookies.
 *
 *   node scripts/verify/innsikt-behaviour.mjs
 */
import { chromium } from 'playwright-core'
const base = 'http://localhost:3000'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
const errors = []; p.on('console', (m) => m.type() === 'error' && errors.push(m.text())); p.on('pageerror', (e) => errors.push(String(e)))
let failed = 0
const ok = (name, cond, detail = '') => { if (!cond) failed++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }
await p.goto(base + '/logg-inn', { waitUntil: 'networkidle' })
await p.getByLabel(/e-post|email/i).fill(process.env.ORGPULS_DEV_EMAIL)
await p.getByLabel(/passord|password/i).fill(process.env.ORGPULS_DEV_PASSWORD)
await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/logg-inn')), p.getByRole('button', { name: /logg inn|sign in/i }).click()])

const h1 = () => p.getByRole('heading', { level: 1 }).innerText()
const pressed = () => p.locator('[role=group][aria-label="Visning av Innsikt"] button[aria-pressed=true]').innerText()
const cookie = async (name) => (await ctx.cookies()).find((c) => c.name === name)?.value

// design 3's rule decides the first view (D-247): the fixture's daglig leder, 34 employees, opens on Enkel
await p.goto(base + '/innsikt', { waitUntil: 'networkidle' })
ok('a small organisation\'s daglig leder opens on Enkel', (await pressed()) === 'Enkel')
ok('the header offers no Enkel/Full switch', (await p.locator('header [role=group] button', { hasText: /^Full$/ }).count()) === 0)
ok('Enkel greets by name', /^God (morgen|dag|kveld)/.test(await h1()), await h1())
ok('Enkel has its five figures', (await p.locator('main .grid > div .text-\\[11px\\]').count()) >= 4)
for (const name of ['Siden sist', 'Venter på deg', 'Dette går bra', 'Her kan dere bli bedre']) {
  ok(`Enkel shows «${name}»`, await p.getByRole('heading', { level: 2, name }).isVisible())
}
ok('«Se hele resultatet» goes to Resultater', (await p.getByRole('link', { name: 'Se hele resultatet' }).getAttribute('href')) === '/resultater')

await ctx.addCookies([{ name: 'op_innsikt', value: 'avansert', url: base }])
await p.goto(base + '/innsikt', { waitUntil: 'networkidle' })
ok('a chosen Avansert opens on Avansert', (await pressed()) === 'Avansert')
ok('Avansert heads with the question', (await h1()) === 'Hvor dere bør bruke tiden')
const compare = await p.getByRole('link', { name: /^Sammenlign med/ }).getAttribute('href').catch(() => null)
ok('«Sammenlign med» opens Resultater with the two rounds', !!compare && /^\/resultater\?maling=[0-9a-f-]{36}&mot=[0-9a-f-]{36}$/.test(compare), String(compare))
ok('the table groups the factors by risk', (await p.getByText(/^Prioritert · \d+$/).count()) === 1)

// the switch, and that it is kept
await p.getByRole('group', { name: 'Visning av Innsikt' }).getByRole('button', { name: 'Enkel' }).click()
await p.waitForFunction(() => document.querySelector('[role=group][aria-label="Visning av Innsikt"] button[aria-pressed=true]')?.textContent === 'Enkel')
ok('the switch changes the view', /^God /.test(await h1()))
ok('and remembers it', (await cookie('op_innsikt')) === 'enkel')
await p.reload({ waitUntil: 'networkidle' })
ok('a reload keeps the chosen view', (await pressed()) === 'Enkel')

// keyboard: the switch is reachable and shows focus
await p.locator('[role=group][aria-label="Visning av Innsikt"] button').first().focus()
await p.keyboard.press('Tab')
ok('Tab reaches «Avansert» with a visible focus ring', await p.evaluate(() => {
  const e = document.activeElement
  return e?.textContent === 'Avansert' && getComputedStyle(e).outlineStyle !== 'none'
}))
await p.keyboard.press('Enter')
await p.waitForFunction(() => document.querySelector('[role=group][aria-label="Visning av Innsikt"] button[aria-pressed=true]')?.textContent === 'Avansert')
ok('Enter on it switches', (await h1()) === 'Hvor dere bør bruke tiden')

// the phone
await p.setViewportSize({ width: 375, height: 800 })
for (const v of ['avansert', 'enkel']) {
  await ctx.addCookies([{ name: 'op_innsikt', value: v, url: base }])
  await p.goto(base + '/innsikt', { waitUntil: 'networkidle' })
  const w = await p.evaluate(() => document.documentElement.scrollWidth)
  ok(`${v} does not scroll sideways at 375px`, w <= 375, String(w))
}
await ctx.addCookies([{ name: 'op_innsikt', value: '', url: base }])

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
await b.close()
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
