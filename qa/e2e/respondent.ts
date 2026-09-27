import { mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * What the respondent-flow suites check on every screen (multilingual-gap-analysis, queue item 6).
 * None of it compares pixels: a capture depends on the machine's fonts and rasteriser, so in
 * CI the screenshots are artifacts to look at, and the gates are these —
 *
 *   - the language the screen says it is in: the nearest `lang` above the survey's <main>
 *     (its own, else <html>'s) is exactly the BCP 47 tag of the language rendered;
 *   - axe: no serious or critical violation, except one recorded for that screen in
 *     qa/known-issues.json — the same rule and the same file as qa/visual/shoot.ts;
 *   - nothing scrolls sideways, and no element's content is wider than its box, or taller
 *     than a box that clips it or a control that holds it.
 */
type Known = Record<string, string[]>
const known: Known = JSON.parse(readFileSync('qa/known-issues.json', 'utf8'))

/** the survey languages the QA stack offers (the seed approves English), by the product's code */
export const FLOW_LOCALES = ['no', 'en'] as const
export type FlowLocale = (typeof FLOW_LOCALES)[number]
/** what `lang` must say: the product calls bokmål `no`, the page must call it `nb` */
export const BCP47: Record<FlowLocale, string> = { no: 'nb', en: 'en' }
/** each by its own name, as the picker shows it (lib/i18n/offered.ts LOCALE_NAMES) */
export const LOCALE_NAME: Record<FlowLocale, string> = { no: 'Norsk', en: 'English' }

/** the link scripts/qa/seed.mjs keeps for this viewport and language (QA_FLOW_TOKENS) */
export const flowToken = (project: string, locale: string) => `qa-lumio-flow-${project}-${locale}`

export async function langOf(page: Page) {
  return page.locator('main').first().evaluate((m) => m.closest('[lang]')?.getAttribute('lang') ?? null)
}

/** every box in the survey whose content does not fit it, described without its text */
export async function overflow(page: Page) {
  return page.evaluate(() => {
    const out: string[] = []
    const doc = document.documentElement
    if (doc.scrollWidth > doc.clientWidth) out.push(`the page scrolls sideways: ${doc.scrollWidth} > ${doc.clientWidth}`)
    const describe = (el: Element) => {
      const cls = (el.getAttribute('class') ?? '').split(/\s+/).slice(0, 6).join('.')
      return `<${el.tagName.toLowerCase()}${cls ? ` .${cls}` : ''}>`
    }
    for (const el of Array.from(document.querySelectorAll('main, main *'))) {
      if (!(el instanceof HTMLElement) || el.tagName === 'TEXTAREA') continue
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden' || el.clientWidth === 0) continue
      const r = el.getBoundingClientRect()
      if (r.right > window.innerWidth + 0.5 || r.left < -0.5) out.push(`${describe(el)} leaves the viewport (${Math.round(r.left)}–${Math.round(r.right)} of ${window.innerWidth})`)
      if (el.scrollWidth > el.clientWidth + 1) out.push(`${describe(el)} is wider than its box: ${el.scrollWidth} > ${el.clientWidth}`)
      const clips = style.overflowY !== 'visible' || el.tagName === 'BUTTON' || el.tagName === 'A'
      if (clips && el.scrollHeight > el.clientHeight + 1) out.push(`${describe(el)} is taller than its box: ${el.scrollHeight} > ${el.clientHeight}`)
    }
    return out
  })
}

/**
 * One screen: settled, captured to test-results (an artifact, not a baseline), then checked.
 * `lang` is null where the language is not what is being tested (the pseudo-locale).
 */
export async function checkScreen(page: Page, id: string, opts: { lang: string | null; file?: string; axe?: boolean }) {
  await page.evaluate(() => document.fonts.ready)
  // the ht-in entry animation is .25s: check the settled screen
  await page.waitForTimeout(300)
  if (opts.file) {
    mkdirSync(dirname(opts.file), { recursive: true })
    await page.screenshot({ path: opts.file, fullPage: true, animations: 'disabled', caret: 'hide' })
  }
  if (opts.lang !== null) expect(await langOf(page), `lang on ${id}`).toBe(opts.lang)
  expect(await overflow(page), `nothing overflows on ${id}`).toEqual([])
  if (opts.axe === false) return
  const axe = await new AxeBuilder({ page }).analyze()
  const allowed = new Set(known[id] ?? [])
  const blocking = axe.violations.filter((v) => (v.impact === 'serious' || v.impact === 'critical') && !allowed.has(v.id))
  expect(
    blocking.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    `axe on ${id}`,
  ).toEqual([])
}

/** console errors and uncaught exceptions, from the moment this is called */
export function watchConsole(page: Page) {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  return errors
}

/** where this run's captures go: test-results/shots/<step>/<suite>/<project>/… (CI uploads them) */
export const shotDir = (suite: string) => `test-results/shots/${process.env.QA_STEP ?? 'e2e'}/${suite}/${test.info().project.name}`
