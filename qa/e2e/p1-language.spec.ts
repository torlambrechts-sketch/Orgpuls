import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import en from '../../messages/en.json'
import no from '../../messages/no.json'
import hashes from '../../lib/i18n/respondent-ui.json'
import {
  groupsOf,
  offeredFor,
  personalLink,
  renderNotice,
  smsLead,
  type MailCatalogue,
  type NoticeJob,
} from '../../supabase/functions/_shared/mail'
import { smsContent, smsLength } from '../../supabase/functions/_shared/sms'
import { shoot } from '../visual/shoot'
import { expect, test } from './fixtures'

/**
 * Engagement phase 1 — respondent language (engagement-phases.md, D-127).
 *
 * The QA stack offers bokmål and English: the seed approves every English item and the
 * respondent pages' strings, and holds three Polish qa-fixture items, too few to offer Polish.
 * Drift's first link belongs to Piotr, whose language is Polish, so he meets bokmål with the
 * picker; Drift's second belongs to Eva, whose language is English.
 */
test.describe('respondent language @respondent @p1.2', () => {
  test('r-intro-picker', async ({ page }) => {
    await page.goto('/s/qa-lumio-drift-000001')
    const picker = page.getByRole('navigation', { name: 'Språk' })
    // only the offered languages, each by its own name: Polish is incomplete
    await expect(picker.getByRole('link')).toHaveText(['Norsk', 'English'])
    await expect(picker.getByRole('link', { name: 'Norsk' })).toHaveAttribute('aria-current', 'true')
    // the picker costs no height: the first question's button is still on screen
    await expect(page.getByRole('button', { name: 'Neste' })).toBeInViewport()
    await shoot(page, 'r-intro-picker')
  })

  test('r-question-en', async ({ page }) => {
    await page.goto('/s/qa-lumio-drift-000002')
    await expect(page.locator('main')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('navigation', { name: 'Language' }).getByRole('link', { name: 'English' })).toHaveAttribute('aria-current', 'true')
    // the scale labels are translated with the statement
    await expect(page.getByRole('button', { name: 'Strongly agree' })).toBeVisible()
    await page.getByRole('button', { name: 'Slightly agree' }).click()
    await shoot(page, 'r-question-en')
  })

  test('r-switch-midway', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', 'mobile only (§ P1 visual table)')
    await page.goto('/s/qa-lumio-drift-000001')
    const progress = page.getByText(/^\d+ \/ \d+$/)
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: 'Litt enig' }).click()
      await page.getByRole('button', { name: 'Neste' }).click()
    }
    await expect(progress).toHaveText(/^5 \//)
    await page.getByRole('navigation', { name: 'Språk' }).getByRole('link', { name: 'English' }).click()
    await expect(page).toHaveURL(/\?lang=en$/)
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible()
    // the same place in the survey: answers 1–4 are the flow's state, and it was not reset
    await expect(progress).toHaveText(/^5 \//)
    await shoot(page, 'r-switch-midway')
  })
})

/**
 * P1.3: the invitation as the dispatcher renders it, for Eva (English, offered) and Piotr
 * (Polish, not offered: bokmål). The e-mails are captured on the desktop project; the SMS is
 * written as text with its segment count beside the capture (§ 2.3).
 */
const cat = { no: no.mail, en: en.mail } as unknown as MailCatalogue
const TOKEN = 'q'.repeat(64)
const APP = 'http://localhost:3100'
const job = (lang: string): NoticeJob => ({
  id: 'qa',
  kind: 'invitasjon',
  audience: null,
  channel: 'email',
  sms_text: null,
  lang: 'no',
  org: 'Lumio AS',
  k: 5,
  round: { kind: 'grunnlinje', year: 2026, pulse: null, opens_at: null, closes_at: '2026-10-05T07:00:00Z' },
  recipients: [{ email: 'eva.lunde@lumio.example', phone: '+4740001011', name: lang === 'en' ? 'Eva Lunde' : 'Piotr Nowak', lang, member: false }],
  token: TOKEN,
  locales: { en: { missing: 0, ui: [hashes.en] }, pl: { missing: 30, ui: [] }, lt: { missing: 33, ui: [] } },
})

test.describe('invitations @public @p1.3', () => {
  for (const [id, lang] of [['nb', 'pl'], ['en', 'en']] as const) {
    test(`email-invite-${id}`, async ({ page }) => {
      const j = job(lang)
      const offered = offeredFor(cat, j, { flags: '*', hashes })
      const g = groupsOf(j, offered)[0]!
      expect(g.lang).toBe(id === 'en' ? 'en' : 'no')
      const mail = renderNotice(cat, j, g, APP)
      await page.setContent(mail.html)
      // the respondent link is printed, not a button (D-65): the whole of it, in the mail's language
      await expect(page.getByText(id === 'en' ? en.mail.invitasjon.cta : no.mail.invitasjon.cta, { exact: true })).toBeVisible()
      await expect(page.getByText(personalLink(APP, TOKEN, g.lang, offered), { exact: true })).toBeVisible()
      await expect(page.getByText(id === 'en' ? /automatic e-mail/ : /automatisk e-post/)).toBeVisible()
      await shoot(page, `email-invite-${id}`)
    })

    test(`sms-invite-${id}`, async () => {
      const j = job(lang)
      const offered = offeredFor(cat, j, { flags: '*', hashes })
      const g = groupsOf(j, offered)[0]!
      const link = personalLink(APP, TOKEN, g.lang, offered)
      const content = smsContent(smsLead(cat, j, g.lang), link)
      const len = smsLength(content)
      expect(content.endsWith(link)).toBe(true)
      expect(len.parts).toBeLessThanOrEqual(2)
      const step = process.env.QA_STEP ?? 'adhoc'
      const file = /^p\d+\.\d+$/.test(step) ? `qa/screenshots/p1/${step}/sms-invite-${id}.txt` : `test-results/shots/${step}/sms-invite-${id}.txt`
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, `${content}\n\n-- ${len.chars} characters, ${len.parts} segment(s), ${len.unicode ? 'UCS-2' : 'GSM-7'}\n`)
    })
  }
})
