import en from '../../messages/en.json'
import no from '../../messages/no.json'
import { expect, test } from './fixtures'
import { BCP47, checkScreen, FLOW_LOCALES, flowToken, LOCALE_NAME, shotDir, watchConsole, type FlowLocale } from './respondent'

/**
 * The respondent flow, end to end, per viewport and per offered language (multilingual-gap-
 * analysis, queue item 6). It runs on `mobile` (390), `small` (360) and `tiny` (320), in CI and
 * with `npm run e2e -- --grep @flow`.
 *
 * Each run opens its own link (scripts/qa/seed.mjs QA_FLOW_TOKENS, whose owners have no language
 * of their own, so the survey opens in bokmål), for English switches with the picker on the
 * first screen, starts from the page of promises, answers every question on every page, writes one
 * comment, and submits. It is a real response:
 * the link is spent, which is why `npm run e2e` applies the seed before and after.
 *
 * On every screen: the language `lang` says, axe, and nothing overflowing (./respondent.ts). And
 * the contract the product promises (I6, D-127): the language lives in the address only — the
 * server action's body, the one thing a submission sends, carries no `lang` or `locale` key at
 * any depth.
 */
const CATALOGUE = { no: no.respond, en: en.respond }

/** every key in a parsed body, at any depth */
function keysOf(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(keysOf)
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => [k, ...keysOf(x)])
  return []
}

for (const locale of FLOW_LOCALES) {
  test(`respondent flow in ${locale} @respondent @flow`, async ({ page }) => {
    const project = test.info().project.name
    const m = CATALOGUE[locale as FlowLocale]
    const lang = BCP47[locale]
    const dir = `${shotDir('respondent-flow')}/${locale}`
    const errors = watchConsole(page)
    const actions: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.headers()['next-action']) actions.push(r.postData() ?? '')
    })

    await page.goto(`/s/${flowToken(project, locale)}`)
    // the page before the first question: the promises and «Start» (P1-4, D-150)
    await expect(page.getByRole('button', { name: no.respond.start, exact: true }), 'the link opens the survey (a spent link means the seed was not applied)').toBeVisible()

    // the picker offers exactly the languages this suite covers, each by its own name
    const picker = page.getByRole('navigation', { name: no.respond.language })
    await expect(picker.getByRole('link')).toHaveText(FLOW_LOCALES.map((l) => LOCALE_NAME[l]))
    if (locale !== 'no') {
      await picker.getByRole('link', { name: LOCALE_NAME[locale] }).click()
      await expect(page).toHaveURL(new RegExp(`\\?lang=${locale}$`))
      await expect(page.getByRole('navigation', { name: m.language }).getByRole('link', { name: LOCALE_NAME[locale] })).toHaveAttribute('aria-current', 'true')
    }

    await checkScreen(page, 'r-intro', { lang, file: `${dir}/intro.png` })
    await expect(page.locator('main li'), 'the four promises').toHaveCount(4)
    await page.getByRole('button', { name: m.start, exact: true }).click()

    // a page per factor, every other question on its own (D-150): the progress counts pages
    const progress = page.locator('main').getByText(/^\d+ \/ \d+$/)
    const next = page.getByRole('button', { name: m.next, exact: true })
    const submit = page.getByRole('button', { name: m.submit, exact: true })
    await expect(next).toBeVisible()
    const total = Number((await progress.textContent())!.split('/')[1])
    expect(total, 'the survey has pages').toBeGreaterThan(1)

    let commented = false
    // axe and a capture once per kind of screen (statement, count, background question, free
    // text …), which is what axe's findings depend on; lang and overflow on every screen
    const kinds = new Set<string>()
    for (let n = 1; n <= total; n++) {
      await expect(progress).toHaveText(`${n} / ${total}`)
      const kind = await page
        .locator('main')
        .evaluate((el) => ['button[aria-pressed]', 'button[aria-expanded]', 'textarea'].map((s) => el.querySelectorAll(s).length).join('-'))
      const fresh = !kinds.has(kind)
      kinds.add(kind)
      await checkScreen(page, 'r-question', { lang, axe: fresh, file: fresh ? `${dir}/q${String(n).padStart(2, '0')}-${kind}.png` : undefined })

      // every question on the page, each a fieldset with its legend
      const questions = page.locator('main fieldset')
      const onPage = await questions.count()
      expect(onPage, 'a page asks something').toBeGreaterThan(0)
      for (let q = 0; q < onPage; q++) {
        const fieldset = questions.nth(q)
        await expect(fieldset.locator('legend')).not.toBeEmpty()
        const choices = fieldset.locator('button[aria-pressed]')
        const count = await choices.count()
        if (count > 0) {
          const choice = choices.nth(Math.min(3, count - 1))
          await choice.click()
          await expect(choice).toHaveAttribute('aria-pressed', 'true')
        } else {
          await fieldset.locator('textarea').fill('E2E: fritekst fra testen.')
        }

        // one comment, on the first statement that takes one: its screen, and the done screen's key
        const toggle = fieldset.locator('button[aria-expanded]')
        if (!commented && (await toggle.count()) > 0) {
          await toggle.click()
          await expect(page.getByRole('textbox', { name: m.commentPrompt })).toBeVisible()
          await page.getByRole('textbox', { name: m.commentPrompt }).fill('E2E: en kommentar fra testen.')
          await checkScreen(page, 'r-comment', { lang, file: `${dir}/comment.png` })
          commented = true
        }
      }

      if (n < total) {
        await expect(submit).toHaveCount(0)
        await next.click()
      } else {
        await expect(submit, 'the last question submits').toBeVisible()
        await checkScreen(page, 'r-submit', { lang, file: `${dir}/submit.png` })
        await submit.click()
      }
    }

    // the done screen: it came back ok (no alert), in the same language
    await expect(page.locator('main').getByText('✓', { exact: true })).toBeVisible()
    await expect(page.locator('main').getByRole('alert')).toHaveCount(0)
    await expect(progress).toHaveCount(0)
    await checkScreen(page, 'r-done', { lang, file: `${dir}/done.png` })
    expect(commented, 'a comment was written').toBe(true)

    // the contract: one submission, and nothing in it names a language
    expect(actions, 'one server action was posted').toHaveLength(1)
    const body = actions[0]!
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      parsed = null
    }
    expect(parsed, 'the server action body is JSON (React encodeReply of plain values)').not.toBeNull()
    const keys = keysOf(parsed)
    expect(keys, 'the body is the submission').toEqual(expect.arrayContaining(['token', 'answers', 'extra']))
    expect(keys.filter((k) => /^(lang|locale|language)$/i.test(k)), 'no key names a language').toEqual([])
    expect(body).not.toMatch(/"(lang|locale|language)"\s*:/i)

    expect(errors, 'no console error').toEqual([])
  })
}
