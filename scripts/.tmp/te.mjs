import { chromium } from 'playwright-core'
const B = 'http://localhost:3000', SP = process.env.SP, tag = process.argv[2]
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
p.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await p.goto(B + '/logg-inn')
await p.fill('input[type=email]', process.env.ORGPULS_DEV_EMAIL)
await p.fill('input[type=password]', process.env.ORGPULS_DEV_PASSWORD)
await p.click('button[type=submit]'); await p.waitForTimeout(3000)
await p.goto(B + '/innsikt'); await p.waitForTimeout(800)
console.log(tag, 'banner:', await p.locator('[role=status]').first().innerText().catch(() => 'none'))
await p.screenshot({ path: `${SP}/adm/te-${tag}-innsikt.png` })
await p.goto(B + '/oppsett?fane=betaling'); await p.waitForTimeout(800)
console.log(tag, 'pill/body:', (await p.locator('#billing-trial').locator('..').innerText()).slice(0, 400).replace(/\n/g, ' | '))
await p.screenshot({ path: `${SP}/adm/te-${tag}-betaling.png`, fullPage: true })
if (tag === 'readonly') {
  await p.goto(B + '/malinger'); await p.waitForTimeout(800)
  const btn = p.getByRole('button', { name: 'Start neste puls nå' })
  if (await btn.count()) {
    await btn.click(); await p.waitForTimeout(500)
    await p.getByRole('button', { name: 'Send pulsen nå' }).click(); await p.waitForTimeout(2500)
    console.log(tag, 'start pulse:', await p.locator('text=/fristen for å bekrefte|En runde er|Bare daglig/').first().innerText().catch(() => 'no message'))
  } else console.log(tag, 'no start button (a round is open)')
}
await browser.close()
