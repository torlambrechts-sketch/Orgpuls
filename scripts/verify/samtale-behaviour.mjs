/**
 * A respondent's conversation, end to end in a browser (D-78): a comment written in the
 * survey gives its author a private link on the done screen; the link opens the thread with
 * the key in the fragment only; a leader replies in Kommentarer without learning who wrote
 * it; the author reads the reply and answers back; a leader asks for direct contact and
 * the author is offered an e-mail to them, which the leader can withdraw (D-82); and a
 * wrong key is refused like an unknown one. Also the phone width and the console.
 *
 * It WRITES, through the app only: five responses to the fixture's open puls in one group
 * (a leader sees a thread once its group has k respondents), a leader's reply, a
 * follow-up, and a contact request that is then withdrawn. Reseed afterwards (`node scripts/seed/design-fixture.mjs`).
 *
 * SAMTALE_TOKENS holds five invitation tokens of one group in the open puls, comma-
 * separated. The fixture's tokens are `fixture.<round>.<employee>` (design-fixture.mjs).
 * The leader signs in with ORGPULS_DEV_EMAIL / ORGPULS_DEV_PASSWORD. Nothing is printed.
 *
 *   SAMTALE_TOKENS=… node scripts/verify/samtale-behaviour.mjs [--shots dir]
 */
import { chromium } from 'playwright-core'
const base = 'http://localhost:3000'
const tokens = (process.env.SAMTALE_TOKENS ?? '').split(',').filter(Boolean)
if (tokens.length < 5) {
  console.error('SAMTALE_TOKENS needs five tokens of one group')
  process.exit(2)
}
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const errors = []
let failed = 0
const ok = (name, cond, detail = '') => {
  if (!cond) failed++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
// `--shots <dir>` also keeps the done screen and the thread as PNGs, for reading by eye
const shots = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null
const COMMENT = 'Vi får ofte beskjed for sent om endringer i planen.'

async function page(width = 1440) {
  const ctx = await b.newContext({ viewport: { width, height: 900 } })
  const p = await ctx.newPage()
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  p.on('pageerror', (e) => errors.push(String(e)))
  return p
}

/** answers nothing but the comment: every question is skipped, the last one sends */
async function respond(p, token, comment) {
  const seen = []
  p.on('request', (r) => seen.push(r.url()))
  await p.goto(`${base}/s/${token}`, { waitUntil: 'networkidle' })
  if (comment) {
    await p
      .getByRole('button', { name: /Vil du si mer/i })
      .first()
      .click()
    await p.getByRole('textbox').first().fill(comment)
  }
  for (let i = 0; i < 60; i++) {
    const send = p.getByRole('button', { name: /^Send inn$/ })
    if (await send.count()) {
      await send.click()
      break
    }
    await p.getByRole('button', { name: /^Hopp over$/ }).click()
  }
  await p.getByText(/Takk/).first().waitFor({ timeout: 15000 })
  return seen
}

// 1 --------------------------------------------------------------- the author's link
const author = await page(390)
await respond(author, tokens[0], COMMENT)
const link = author.getByRole('link', { name: 'Åpne samtalen' })
ok('the done screen gives the author a link to the conversation', (await link.count()) === 1)
const href = (await link.getAttribute('href')) ?? ''
ok('the key is in the fragment, not the path', /^\/s\/samtale#[0-9a-f]{64}$/.test(href))
if (shots) await author.screenshot({ path: `${shots}/samtale-done.png`, fullPage: true })
ok('and the screen says it cannot be sent again', await author.getByText(/vi kan ikke sende den på nytt/).isVisible())
ok('phone: the done screen does not scroll sideways', await author.evaluate(() => document.documentElement.scrollWidth <= 390))

const thread = await page(390)
const requests = []
thread.on('request', (r) => requests.push(r.url()))
await thread.goto(base + href, { waitUntil: 'networkidle' })
await thread.getByRole('heading', { name: 'Samtalen din' }).waitFor({ timeout: 15000 })
ok('the link opens the thread, with the comment', await thread.getByText(COMMENT).isVisible())
ok('and says nobody has answered yet', await thread.getByText(/Ingen har svart ennå/).isVisible())
ok(
  'the server was never sent the key in a URL',
  requests.every((u) => !u.includes(href.split('#')[1])),
)

// 2 ------------------------------------------------------- k respondents in the group
for (const tk of tokens.slice(1, 5)) {
  const p = await page()
  await respond(p, tk, null)
  await p.context().close()
}

// 3 -------------------------------------------------------------- the leader answers
const leader = await page()
await leader.goto(base + '/logg-inn', { waitUntil: 'networkidle' })
await leader.getByLabel(/e-post|email/i).fill(process.env.ORGPULS_DEV_EMAIL)
await leader.getByLabel(/passord|password/i).fill(process.env.ORGPULS_DEV_PASSWORD)
await Promise.all([
  leader.waitForURL((u) => !u.pathname.startsWith('/logg-inn')),
  leader.getByRole('button', { name: /logg inn|sign in/i }).click(),
])
await leader.goto(base + '/kommentarer?status=ubesvart', { waitUntil: 'networkidle' })
// the smallest block that holds both the comment and its reply field
const card = leader
  .locator('article, li, div')
  .filter({ hasText: COMMENT })
  .filter({ has: leader.getByPlaceholder('Svar anonymt …') })
  .last()
ok('with k respondents in its group, the leader sees the comment', (await card.count()) > 0)
const field = card.getByPlaceholder('Svar anonymt …')
await field.fill('Takk. Vi legger fram endringer tirsdagen før fra nå av.')
await field.press('Enter')
await leader.waitForTimeout(2500)

// 4 ------------------------------------------------------------ the author reads, answers
await thread.reload({ waitUntil: 'networkidle' })
await thread.getByRole('heading', { name: 'Samtalen din' }).waitFor({ timeout: 15000 })
ok(
  'the author reads the reply, from "Ledelsen"',
  await thread.getByText('Takk. Vi legger fram endringer tirsdagen før fra nå av.').isVisible(),
)
ok('and no name travels with it', (await thread.getByText('Ledelsen', { exact: true }).count()) === 1)
await thread.getByLabel('Svar ledelsen').fill('Det hadde hjulpet mye, takk.')
await thread.getByRole('button', { name: 'Send', exact: true }).click()
await thread.getByText('Sendt.').waitFor({ timeout: 15000 })
ok('the author answers back', await thread.getByText('Det hadde hjulpet mye, takk.').isVisible())
if (shots) await thread.screenshot({ path: `${shots}/samtale-thread.png`, fullPage: true })
ok('phone: the thread does not scroll sideways', await thread.evaluate(() => document.documentElement.scrollWidth <= 390))
await leader.goto(base + '/kommentarer?status=alle', { waitUntil: 'networkidle' })
ok('the leader sees the answer in Kommentarer', (await leader.getByText('Det hadde hjulpet mye, takk.').count()) > 0)

// 4b ------------------------------------------------- direct contact, the author's choice
const kcard = leader
  .locator('article, li, div')
  .filter({ hasText: COMMENT })
  .filter({ has: leader.getByRole('button', { name: 'Be om direkte kontakt' }) })
  .last()
await kcard.getByRole('button', { name: 'Be om direkte kontakt' }).click()
ok('asking first explains what the employee is offered', await kcard.getByText(/bare hvis den ansatte selv velger det/).isVisible())
await kcard.getByRole('button', { name: 'Send forespørsel' }).click()
await leader.getByText(/Du har bedt om direkte kontakt/).first().waitFor({ timeout: 15000 })
ok('the leader sees the request as theirs', await leader.getByText(/Du har bedt om direkte kontakt/).first().isVisible())
await thread.reload({ waitUntil: 'networkidle' })
await thread.getByRole('heading', { name: 'Samtalen din' }).waitFor({ timeout: 15000 })
const offer = thread.getByRole('link', { name: /^Skriv e-post til / })
const mailto = (await offer.getAttribute('href').catch(() => '')) ?? ''
ok(
  "the author is offered an e-mail to that leader's own address",
  mailto.startsWith(`mailto:${process.env.ORGPULS_DEV_EMAIL}?subject=`),
  mailto.split('?')[0].replace(/[^:]+@/, '…@'),
)
ok('and told it is their choice, and that nobody learns whether they send it', await thread.getByText(/Det er helt ditt valg/).isVisible())
if (shots) await thread.screenshot({ path: `${shots}/samtale-kontakt.png`, fullPage: true })
ok('phone: the offer does not scroll sideways', await thread.evaluate(() => document.documentElement.scrollWidth <= 390))
await leader.getByRole('button', { name: 'Trekk tilbake' }).first().click()
await leader.waitForTimeout(2000)
await thread.reload({ waitUntil: 'networkidle' })
await thread.getByRole('heading', { name: 'Samtalen din' }).waitFor({ timeout: 15000 })
ok('withdrawn, the author is no longer offered it', (await thread.getByRole('link', { name: /^Skriv e-post til / }).count()) === 0)

// 5 ----------------------------------------------------------------- keys that are not
const wrong = await page()
await wrong.goto(`${base}/s/samtale#${'0'.repeat(64)}`, { waitUntil: 'networkidle' })
ok('an unknown key is refused', await wrong.getByRole('heading', { name: 'Lenken er ikke gyldig' }).isVisible())
await wrong.goto(`${base}/s/samtale#ikke-en-nokkel`, { waitUntil: 'networkidle' })
await wrong.reload({ waitUntil: 'networkidle' })
ok('a malformed one the same way', await wrong.getByRole('heading', { name: 'Lenken er ikke gyldig' }).isVisible())

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' / '))
await b.close()
process.exit(failed ? 1 : 0)
