import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * `shoot(page, id)` (engagement-phases.md § 2.2): one screen, captured three ways.
 *
 *   1. saved to qa/screenshots/p{n}/{step}/{id}-{project}.png, for the phase report and for a
 *      person to open — the step is QA_STEP, set by `npm run qa:visual -- --step p1.2`;
 *   2. compared with qa/baselines/{project}/{id}.png at maxDiffPixelRatio 0.01, animations off;
 *   3. run through axe: a serious or critical violation fails the shot, unless it is one of the
 *      pre-existing issues recorded in qa/known-issues.json when the P0 baselines were taken
 *      (§ P0.2: "record existing issues in the report without fixing them").
 *
 * Every violation, allowed or not, is written beside the PNG as {id}-{project}.axe.json, so
 * the phase report's axe summary comes from what was measured.
 */
type Known = Record<string, string[]>
const known: Known = JSON.parse(readFileSync('qa/known-issues.json', 'utf8'))

export async function shoot(page: Page, id: string, opts: { fullPage?: boolean; mask?: ReturnType<Page['locator']>[] } = {}) {
  const info = test.info()
  const project = info.project.name
  const step = process.env.QA_STEP ?? 'adhoc'
  const phase = step.match(/^p(\d+)/)?.[0] ?? 'p0'

  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle')
  // the ht-in entry animation is .25s; wait it out so the capture is of the settled screen
  await page.waitForTimeout(400)

  const file = `qa/screenshots/${phase}/${step}/${id}-${project}.png`
  mkdirSync(dirname(file), { recursive: true })
  await page.screenshot({ path: file, fullPage: opts.fullPage ?? true, animations: 'disabled', caret: 'hide', mask: opts.mask })

  const axe = await new AxeBuilder({ page }).analyze()
  const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  writeFileSync(
    file.replace(/\.png$/, '.axe.json'),
    JSON.stringify(
      serious.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => ({ target: n.target.join(' '), summary: n.failureSummary?.split('\n').at(-1)?.trim() })) })),
      null,
      2,
    ) + '\n',
  )
  const allowed = new Set(known[id] ?? [])
  const blocking = serious.filter((v) => !allowed.has(v.id))
  expect(blocking.map((v) => `${v.id} (${v.impact}): ${v.help}`), `axe on ${id}`).toEqual([])

  await expect(page).toHaveScreenshot(`${id}.png`, { fullPage: opts.fullPage ?? true, mask: opts.mask })
}
