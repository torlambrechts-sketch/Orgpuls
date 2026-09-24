/**
 * The Veiviser's behaviour, checked in a browser (design 3, P7, D-76): it opens by itself
 * on the first run, holds focus, "Fortsett senere" and Escape keep the step for the next
 * session, "Hopp over" puts it aside, Oversikt's "Veiviser" and Oppsett's "Kjør
 * veiviseren" open it, and each step writes through its own action — people pasted in,
 * the threshold (5 and 8 only), the verneombud, the rhythm, and a first grunnlinje on the
 * Tuesday chosen. Signs in with ORGPULS_DEV_EMAIL / ORGPULS_DEV_PASSWORD (environment,
 * used once, never printed) against :3000, as the fixture's daglig leder.
 *
 * It needs the fixture's first-run state, and it WRITES. Before:
 *   node scripts/seed/design-fixture.mjs --first-run   (applied to the database)
 * After, to bring the design's scenario back:
 *   node scripts/seed/design-fixture.mjs               (applied to the database)
 *
 *   node scripts/verify/veiviser-behaviour.mjs
 */
import { chromium } from 'playwright-core'
const base = 'http://localhost:3000'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const errors = []
let failed = 0
const ok = (name, cond, detail = '') => {
  if (!cond) failed++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

/** a fresh browser session, signed in */
async function session(width = 1440) {
  const ctx = await b.newContext({ viewport: { width, height: 900 } })
  const p = await ctx.newPage()
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  p.on('pageerror', (e) => errors.push(String(e)))
  await p.goto(base + '/logg-inn', { waitUntil: 'networkidle' })
  await p.getByLabel(/e-post|email/i).fill(process.env.ORGPULS_DEV_EMAIL)
  await p.getByLabel(/passord|password/i).fill(process.env.ORGPULS_DEV_PASSWORD)
  await Promise.all([
    p.waitForURL((u) => !u.pathname.startsWith('/logg-inn')),
    p.getByRole('button', { name: /logg inn|sign in/i }).click(),
  ])
  return p
}
const dialog = (p) => p.getByRole('dialog', { name: 'Velkommen' }).or(p.getByRole('dialog'))
const title = (p) => p.getByRole('dialog').getByRole('heading', { level: 2 }).innerText()
const opened = async (p) => {
  await p.waitForTimeout(1500)
  return (await p.getByRole('dialog').count()) === 1
}
const press = async (p, name) => {
  const before = await title(p)
  await p.getByRole('dialog').getByRole('button', { name, exact: true }).click()
  await p
    .waitForFunction((t) => document.querySelector('[role=dialog] h2')?.textContent !== t, before, { timeout: 20000 })
    .catch(() => {})
}

// A ---------------------------------------------------------------- first run, and later
let p = await session()
await p.goto(base + '/innsikt', { waitUntil: 'networkidle' })
ok(
  'first run: it opens by itself, as a modal dialog',
  (await opened(p)) && (await dialog(p).getAttribute('aria-modal')) === 'true',
)
ok('focus starts on the step title', await p.evaluate(() => document.activeElement?.tagName === 'H2'))
for (let i = 0; i < 30; i++) await p.keyboard.press('Tab')
ok('Tab stays inside it', await p.evaluate(() => !!document.activeElement?.closest('[role=dialog]')))
await press(p, 'Kom i gang')
ok('"Kom i gang" goes to Virksomheten', (await title(p)) === 'Virksomheten')
await p.keyboard.press('Escape')
await p.waitForTimeout(800)
ok('Escape is "Fortsett senere": it closes', (await p.getByRole('dialog').count()) === 0)
await p.reload({ waitUntil: 'networkidle' })
ok('and does not open again in the same session', !(await opened(p)))
await p.getByRole('button', { name: 'Veiviser', exact: true }).click()
await p.getByRole('dialog').getByRole('heading', { level: 2 }).waitFor()
ok('Oversikt\'s "Veiviser" reopens it where it was left', (await title(p)) === 'Virksomheten')
await p.context().close()

// B ------------------------------------------------------------ a new session, then aside
p = await session()
await p.goto(base + '/innsikt', { waitUntil: 'networkidle' })
ok('a new session opens it again, at the same step', (await opened(p)) && (await title(p)) === 'Virksomheten')
await p
  .getByRole('dialog')
  .getByRole('navigation')
  .getByRole('button', { name: /Velkommen/ })
  .click()
await p.waitForTimeout(600)
ok('a done step can be revisited from the list', (await title(p)) === 'Velkommen')
ok(
  'a step not reached yet cannot',
  await p.getByRole('dialog').getByRole('navigation').getByRole('button', { name: /Klart/ }).isDisabled(),
)
await p.getByRole('dialog').getByRole('button', { name: 'Hopp over', exact: true }).click()
await p.waitForTimeout(1000)
ok('"Hopp over" closes it', (await p.getByRole('dialog').count()) === 0)
await p.context().close()
p = await session()
await p.goto(base + '/innsikt', { waitUntil: 'networkidle' })
ok('put aside, it does not open by itself in the next session', !(await opened(p)))

// C ------------------------------------------------------------------- every step, writing
await p.goto(base + '/oppsett', { waitUntil: 'networkidle' })
await p.getByRole('button', { name: 'Kjør veiviseren', exact: true }).click()
await p.getByRole('dialog').getByRole('heading', { level: 2 }).waitFor()
ok('Oppsett\'s "Kjør veiviseren" opens it', (await title(p)) === 'Velkommen')
await press(p, 'Kom i gang')

const d = p.getByRole('dialog')
await d.getByRole('button', { name: 'Hent fra Brønnøysund', exact: true }).click()
await d
  .getByRole('alert')
  .waitFor({ timeout: 15000 })
  .catch(() => {})
ok(
  "the fixture's number is not a real undertaking, and the wizard says so",
  /Enhetsregisteret|Brønnøysund svarer ikke/.test(
    await d
      .getByRole('alert')
      .innerText()
      .catch(() => ''),
  ),
)
await press(p, 'Neste')

ok('Ansatte counts who is in the register', await d.getByText(/^Vi trenger navn.*34 ansatte ligger inne fra før/).isVisible())
await d.getByRole('button', { name: /^Lim inn/ }).click()
await d.getByLabel('Ansatte, én per linje').fill('Wenche Veiviser, wenche@veiviser.example, Drift')
await press(p, 'Neste')
ok('pasted people are imported before it moves on', (await title(p)) === 'Grupper og terskel')
await press(p, 'Tilbake')
ok('… and counted', await d.getByText(/35 ansatte ligger inne fra før/).isVisible())
await press(p, 'Neste')

const chips = await d.getByRole('button', { name: / svar$/ }).allInnerTexts()
ok('the threshold offers 5 and 8, never below k', chips.join(',') === '5 svar,8 svar', chips.join(','))
await d.getByRole('button', { name: '8 svar' }).click()
ok(
  'at 8 it names the groups that would be withheld',
  await d.getByText('Administrasjon har færre enn 8. De vises bare som del av helheten.').isVisible(),
)
await d.getByRole('button', { name: '5 svar' }).click()
ok('at 5 every group is large enough', await d.getByText('Alle grupper er store nok til å vises hver for seg.').isVisible())
await press(p, 'Neste')

// the label wraps the select, so its name carries the chosen option too: address them in order
const [vo, tv] = [d.locator('select').nth(0), d.locator('select').nth(1)]
ok(
  'the verneombud is a person in the register, preselected',
  (await vo.evaluate((s) => s.selectedOptions[0]?.textContent)) === 'Kari Nordbø' &&
    (await d.locator('label').first().innerText()).startsWith('Verneombud'),
)
ok(
  'and cannot also be the tillitsvalgt (one duty per person)',
  !(await tv.locator('option').allInnerTexts()).includes('Kari Nordbø'),
)
ok('with 34 employees, the law names AMU', await d.getByText(/Dere skal også ha arbeidsmiljøutvalg/).isVisible())
await press(p, 'Neste')

ok('Hva dere måler lists the eleven areas', (await d.locator('span.rounded-pill.border').count()) >= 11)
await press(p, 'Neste')

await d.getByRole('button', { name: /^Hvert halvår/ }).click()
ok('"Hvert halvår": two send-outs a year', await d.getByText(/Året · 2 utsendinger i året/).isVisible())
await d.getByRole('button', { name: /^Hvert kvartal/ }).click()
ok('"Hvert kvartal": four, with July left out', await d.getByText(/Året · 4 utsendinger i året/).isVisible())
ok('July reads Ferie', await d.getByRole('button', { name: 'juli: Ferie' }).isVisible())
await press(p, 'Neste')

const days = d.getByRole('button', { name: /^Tirsdag / })
ok('three Tuesdays to choose from', (await days.count()) === 3)
const chosen = await days.nth(1).innerText()
await days.nth(1).click()
await press(p, 'Planlegg utsendingen')
ok('"Planlegg utsendingen" plans it, and Klart says when', await d.getByText(`${chosen} kl. 09.00`).isVisible(), chosen)
ok('Klart counts the pasted person', await d.getByText('35 lagt inn').isVisible())

await d.getByRole('button', { name: 'Til oversikten', exact: true }).click()
await p.waitForURL(/\/innsikt/)
await p.waitForTimeout(800)
ok('"Til oversikten" closes it on Oversikt', (await p.getByRole('dialog').count()) === 0)
await p.goto(base + '/malinger', { waitUntil: 'networkidle' })
ok('Målinger lists the planned grunnlinje', await p.getByText('Planlagt', { exact: true }).first().isVisible())
await p.goto(base + '/oppsett', { waitUntil: 'networkidle' })
await p.getByRole('button', { name: 'Kjør veiviseren', exact: true }).click()
await p.getByRole('dialog').getByRole('heading', { level: 2 }).waitFor()
ok('run again once finished, it starts from the beginning', (await title(p)) === 'Velkommen')
await p.keyboard.press('Escape')
await p.context().close()

// D ------------------------------------------------------------------------------ phone
p = await session(390)
await p.goto(base + '/oppsett', { waitUntil: 'networkidle' })
await p.getByRole('button', { name: 'Kjør veiviseren', exact: true }).click()
await p.getByRole('dialog').getByRole('heading', { level: 2 }).waitFor()
await press(p, 'Kom i gang')
ok(
  'phone: no horizontal scroll, the step list folded away, "Fortsett senere" in the footer',
  (await p.evaluate(() => document.documentElement.scrollWidth <= 390)) &&
    !(await p.getByRole('dialog').getByRole('navigation').isVisible()) &&
    (await p.getByRole('dialog').getByRole('button', { name: 'Fortsett senere' }).last().isVisible()),
)
await p.context().close()

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' / '))
await b.close()
process.exit(failed ? 1 : 0)
