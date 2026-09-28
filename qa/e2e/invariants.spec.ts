import { readFileSync, existsSync } from 'node:fs'
import { expect, test } from './fixtures'

/**
 * I3 (engagement-phases.md § 2.7): a respondent page sends no analytics or log event that
 * carries a token, a respondent id, an IP or a user agent.
 *
 * Every request the page makes is captured. None may leave this origin, none may go to the
 * site's beacon (/api/wv) or Vercel's analytics (/_vercel), and no request other than the
 * page's own address may carry the token, in its URL or its body. Then the server's own
 * output (scripts/qa/serve.mjs keeps it in test-results/qa-server.log) must not contain the
 * token, the browser's user agent or an address the request came from.
 *
 * The other six invariants are SQL: tests/invariants/invariants.sql.
 */
const TOKEN = 'qa-lumio-salg-000001'
const UA = 'OrgpulsInvariantProbe/1.0 (I3)'

test.describe('I3 @invariants @respondent', () => {
  test.use({ userAgent: UA })
  test('the respondent page sends nothing that names the respondent', async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin
    const logBefore = existsSync('test-results/qa-server.log') ? readFileSync('test-results/qa-server.log', 'utf8').length : 0
    const seen: { url: string; body: string }[] = []
    page.on('request', (r) => seen.push({ url: r.url(), body: r.postData() ?? '' }))

    await page.goto(`/s/${TOKEN}`)
    // the flow opens on «Før du starter» (P1-4, D-150): start it, then skip through as before
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Hopp over' })).toBeVisible()
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Hopp over' }).click()
    await page.waitForLoadState('networkidle')

    const foreign = seen.filter((r) => new URL(r.url).origin !== origin)
    expect(foreign.map((r) => r.url), 'no request leaves this origin').toEqual([])
    const analytics = seen.filter((r) => /\/api\/wv\b|\/_vercel\//.test(new URL(r.url).pathname))
    expect(analytics.map((r) => r.url), 'no analytics or beacon call').toEqual([])
    const carrying = seen.filter((r) => {
      const u = new URL(r.url)
      const isPage = u.pathname === `/s/${TOKEN}`
      return (!isPage && r.url.includes(TOKEN)) || r.body.includes(TOKEN)
    })
    expect(carrying.map((r) => r.url), 'no request but the page itself carries the token').toEqual([])

    const log = existsSync('test-results/qa-server.log') ? readFileSync('test-results/qa-server.log', 'utf8').slice(logBefore) : ''
    for (const needle of [TOKEN, UA, '127.0.0.1', '::1']) {
      expect(log.includes(needle), `the server log does not contain ${needle}`).toBe(false)
    }
  })
})
