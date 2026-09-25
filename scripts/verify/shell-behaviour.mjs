/**
 * The shell's behaviour, checked in a browser (design 3, P1, D-70): what the pixel gate
 * cannot see.
 *
 * Signs in with ORGPULS_DEV_EMAIL / ORGPULS_DEV_PASSWORD (read from the environment, used
 * once, never printed) against a running app on :3000 with the design fixture seeded, then
 * walks the layout toggle, the rail, Enkel/Full, the keyboard order and focus rings, the help
 * panel by keyboard, and a phone-width load in the side layout. Prints PASS/FAIL per check.
 *
 *   node scripts/verify/shell-behaviour.mjs
 */
import { chromium } from 'playwright-core'
const base = 'http://localhost:3000'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
const errors = []; p.on('console', (m) => m.type() === 'error' && errors.push(m.text())); p.on('pageerror', (e) => errors.push(String(e)))
const ok = (name, cond, detail = '') => console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
await p.goto(base + '/logg-inn', { waitUntil: 'networkidle' })
await p.getByLabel(/e-post|email/i).fill(process.env.ORGPULS_DEV_EMAIL)
await p.getByLabel(/passord|password/i).fill(process.env.ORGPULS_DEV_PASSWORD)
await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/logg-inn')), p.getByRole('button', { name: /logg inn|sign in/i }).click()])
// the shell's checks are about Full; a small organisation's daglig leder now starts in Enkel (D-71)
await ctx.addCookies([{ name: 'op_view', value: 'full', url: base }])
const railWidth = () => p.evaluate(() => { const a = document.querySelector('aside'); return a && getComputedStyle(a).display !== 'none' ? Math.round(a.getBoundingClientRect().width) : 0 })
const navNames = () => p.evaluate(() => [...document.querySelectorAll('header nav a')].filter((a) => a.offsetParent).map((a) => a.innerText.replace(/\s+/g, ' ').trim()))

await p.goto(base + '/tiltak', { waitUntil: 'networkidle' })
ok('top layout: five nav entries, Kommentarer carries 10', JSON.stringify(await navNames()) === JSON.stringify(['Innsikt', 'Målinger', 'Resultater', 'Kommentarer 10 10 venter på svar', 'Tiltak']), JSON.stringify(await navNames()))
ok('Tiltak is the current page', (await p.locator('header nav a[aria-current="page"]').innerText()) === 'Tiltak')
await p.getByRole('button', { name: 'Bytt til sidemeny og full bredde' }).click(); await p.waitForTimeout(400)
ok('layout toggle draws the rail at 220px', (await railWidth()) === 220, String(await railWidth()))
ok('page column goes full width', await p.evaluate(() => getComputedStyle(document.querySelector('main')).maxWidth) === 'none', await p.evaluate(() => getComputedStyle(document.querySelector('main')).maxWidth))
ok('side bar title is the screen', (await p.evaluate(() => [...document.querySelectorAll('header span')].find((s) => s.className.includes('text-[17px]'))?.innerText)) === 'Tiltak')
await p.reload({ waitUntil: 'networkidle' })
ok('side layout survives a reload (cookie)', (await railWidth()) === 220)
await p.getByRole('button', { name: 'Trekk sammen menyen' }).click(); await p.waitForTimeout(400)
ok('rail narrows to 62px', (await railWidth()) === 62, String(await railWidth()))
await p.reload({ waitUntil: 'networkidle' })
ok('narrow rail survives a reload', (await railWidth()) === 62)
ok('narrow rail keeps link names', (await p.locator('aside nav a').first().getAttribute('aria-label')) === 'Innsikt')
await p.getByRole('button', { name: 'Utvid menyen' }).click()
await p.getByRole('button', { name: 'Bytt til toppmeny' }).click(); await p.waitForTimeout(400)
ok('back to the top layout', (await railWidth()) === 0 && await p.evaluate(() => getComputedStyle(document.querySelector('main')).maxWidth) === '1180px')

await p.getByRole('button', { name: 'Enkel', exact: true }).click(); await p.waitForURL('**/innsikt'); await p.waitForLoadState('networkidle')
ok('Enkel on Tiltak goes to Innsikt', new URL(p.url()).pathname === '/innsikt')
ok('Enkel nav is Oversikt alone', JSON.stringify(await navNames()) === JSON.stringify(['Oversikt']), JSON.stringify(await navNames()))
await p.reload({ waitUntil: 'networkidle' })
ok('Enkel survives a reload', (await navNames()).length === 1)
await p.getByRole('button', { name: 'Full', exact: true }).click(); await p.waitForTimeout(800)
ok('Full brings the five back', (await navNames()).length === 5)

// Oppsett is reached from the account menu (D-81), and Enkel keeps you there
await p.getByRole('button', { name: /^Konto/ }).click()
await Promise.all([p.waitForURL('**/oppsett'), p.getByRole('link', { name: 'Oppsett', exact: true }).click()])
ok('Oppsett opens from the account menu', new URL(p.url()).pathname === '/oppsett')
ok('on Oppsett, no nav entry is current and the menu marks the page', (await p.locator('header nav a[aria-current="page"]').count()) === 0)
await p.getByRole('button', { name: 'Enkel', exact: true }).click(); await p.waitForTimeout(1000)
ok('switching to Enkel on Oppsett stays on Oppsett', new URL(p.url()).pathname === '/oppsett')
await p.getByRole('button', { name: 'Full', exact: true }).click(); await p.waitForTimeout(800)

// keyboard
await p.goto(base + '/innsikt', { waitUntil: 'networkidle' })
await p.keyboard.press('Tab')
const order = []
for (let i = 0; i < 12; i++) {
  order.push(await p.evaluate(() => { const e = document.activeElement; return (e.getAttribute('aria-label') || e.innerText || e.tagName).replace(/\s+/g, ' ').trim().slice(0, 28) + (getComputedStyle(e).outlineStyle !== 'none' ? '*' : '') }))
  await p.keyboard.press('Tab')
}
console.log('      tab order (* = visible focus ring):', order.join(' | '))
ok('every stop shows a focus ring', order.every((o) => o.endsWith('*')))
await p.getByRole('button', { name: 'Hjelp, grunnlag og assistent' }).focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(300)
ok('Enter on Hjelp opens the panel', await p.getByText('Les mer om dette').isVisible())
await p.getByRole('button', { name: 'Tuva', exact: true }).focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(300)
ok('Enter on the Tuva tab switches mode', await p.locator('header').getByText('Kom i gang', { exact: true }).isVisible())
await p.getByRole('button', { name: 'Lukk' }).click(); await p.waitForTimeout(300)
await p.getByRole('button', { name: 'Hjelp, grunnlag og assistent' }).click(); await p.waitForTimeout(300)
ok('Hjelp reopens the tab last chosen', await p.locator('header').getByText('Kom i gang', { exact: true }).isVisible())
await p.goto(base + '/tiltak', { waitUntil: 'networkidle' })
ok('the panel belongs to its page', !(await p.locator('header').getByText('Kom i gang', { exact: true }).isVisible()))

// phone, with the side layout chosen
await ctx.addCookies([{ name: 'op_layout', value: 'side', url: base }])
await p.setViewportSize({ width: 390, height: 844 }); await p.goto(base + '/innsikt', { waitUntil: 'networkidle' })
ok('phone: no rail even in the side layout', (await railWidth()) === 0)
ok('phone: the top nav is there', (await navNames()).length === 5, JSON.stringify(await navNames()))
ok('phone: no layout toggle', !(await p.getByRole('button', { name: 'Bytt til toppmeny' }).isVisible()))
ok('phone: no horizontal scroll', await p.evaluate(() => document.documentElement.scrollWidth <= 390), String(await p.evaluate(() => document.documentElement.scrollWidth)))
ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' / '))
await b.close()
