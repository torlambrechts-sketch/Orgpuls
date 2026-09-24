/**
 * Oversikt's behaviour, checked in a browser (design 3, P2, D-71): the default view, the
 * checklist's writes, the inline reply, the links into Full, the side layout's width, and
 * the phone. Signs in with ORGPULS_DEV_EMAIL / ORGPULS_DEV_PASSWORD (environment, used once,
 * never printed) against :3000 with the design fixture seeded.
 *
 * It WRITES to the organisation it signs into: one measure is checked and unchecked again,
 * and with --reply one anonymous reply is sent. Run it against the fixture, and reseed after
 * a --reply run.
 *
 *   node scripts/verify/oversikt-behaviour.mjs [--reply]
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
const navNames = () => p.evaluate(() => [...document.querySelectorAll('header nav a')].filter((a) => a.offsetParent).map((a) => a.innerText.trim()))

await p.goto(base + '/innsikt', { waitUntil: 'networkidle' })
ok('a small organisation\'s daglig leder starts in Enkel', JSON.stringify(await navNames()) === '["Oversikt","Oppsett"]', JSON.stringify(await navNames()))
ok('Oversikt heads with the sentence', await p.getByRole('heading', { level: 1 }).innerText().then((s) => s.startsWith('Folk trives med')))
ok('three measures to do', (await p.getByRole('checkbox').count()) === 3)
ok('two comments waiting, the oldest', (await p.getByPlaceholder('Svar anonymt …').count()) === 2)

// the checklist writes, stays struck through for the visit, and undoes
const name = await p.getByRole('checkbox').nth(1).getAttribute('aria-label')
const box = p.getByRole('checkbox', { name })
await box.click(); await p.waitForTimeout(1500)
ok('checking marks it done, and the row stays', (await box.getAttribute('aria-checked')) === 'true')
await box.focus(); await p.keyboard.press('Space'); await p.waitForTimeout(1500)
ok('Space unchecks it (keyboard)', (await box.getAttribute('aria-checked')) === 'false')
await p.keyboard.press('Space'); await p.waitForTimeout(1500)
ok('Space checks it again', (await box.getAttribute('aria-checked')) === 'true')
await p.goto(base + '/tiltak', { waitUntil: 'networkidle' })
ok('Tiltak sees it carried out', (await p.getByText(/Gjennomført/).count()) > 0)
await p.goto(base + '/innsikt', { waitUntil: 'networkidle' })
ok('on the next visit it has left the list', (await p.getByRole('checkbox', { name }).count()) === 0 && (await p.getByRole('checkbox').count()) === 2)

if (process.argv.includes('--reply')) {
  const first = p.getByPlaceholder('Svar anonymt …').first()
  await first.fill('Takk, vi ser på det i neste ledermøte.')
  await first.press('Enter'); await p.waitForTimeout(2000)
  ok('a reply is sent', await p.getByText('Sendt. Svaret ligger under Kommentarer.').isVisible())
  await p.goto(base + '/innsikt', { waitUntil: 'networkidle' })
  ok('the answered comment leaves: "Alle 9"', await p.getByRole('link', { name: 'Alle 9 →' }).isVisible())
}

// into Full
await p.getByRole('link', { name: 'Se alle tall →' }).click(); await p.waitForURL('**/resultater'); await p.waitForLoadState('networkidle')
ok('"Se alle tall" opens Resultater in Full', (await navNames()).length === 6)
await p.getByRole('button', { name: 'Enkel', exact: true }).click(); await p.waitForURL('**/innsikt'); await p.waitForLoadState('networkidle')

// side layout width
await p.getByRole('button', { name: 'Bytt til sidemeny og full bredde' }).click(); await p.waitForTimeout(500)
ok('Oversikt is 1040px beside the rail', await p.evaluate(() => Math.round(document.querySelector('main').getBoundingClientRect().width)) === 1040, String(await p.evaluate(() => Math.round(document.querySelector('main').getBoundingClientRect().width))))
await p.getByRole('button', { name: 'Bytt til toppmeny' }).click(); await p.waitForTimeout(500)
ok('880px in the top layout', await p.evaluate(() => Math.round(document.querySelector('main').getBoundingClientRect().width)) === 880)

// phone
await p.setViewportSize({ width: 390, height: 844 }); await p.reload({ waitUntil: 'networkidle' })
ok('phone: no horizontal scroll (the design overflows to 444px)', await p.evaluate(() => document.documentElement.scrollWidth <= 390), String(await p.evaluate(() => document.documentElement.scrollWidth)))
ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' / '))
await b.close()
process.exit(failed ? 1 : 0)
