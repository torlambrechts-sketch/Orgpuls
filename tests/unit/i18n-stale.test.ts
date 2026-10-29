import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * scripts/i18n/stale.mjs: a translation records the bokmål it was made from, and a change to the
 * bokmål lists every translation of it that did not follow, in every language and every market pack.
 */
const SCRIPT = resolve('scripts/i18n/stale.mjs')

function project(files: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), 'stale-'))
  for (const [path, value] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), JSON.stringify(value, null, 2))
  }
  return dir
}

const run = (dir: string, ...args: string[]) => {
  try {
    return { code: 0, out: execFileSync('node', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8', stdio: 'pipe' }) }
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string }
    return { code: err.status, out: `${err.stdout}${err.stderr}` }
  }
}

describe('a translation behind its bokmål', () => {
  it('is listed in every file that translates it, until its source is recorded again', () => {
    const dir = project({
      'messages/no.json': { site: { hero: 'Kartlegg arbeidsmiljøet', cta: 'Kom i gang' } },
      'messages/en.json': { site: { hero: 'Survey the work environment', cta: 'Get started' } },
      'messages/sv.json': { site: { hero: 'Kartlägg arbetsmiljön' } },
      'messages/market/gb/en.json': { site: { hero: 'Survey work-related stress' }, own: { article: 'Only the UK has this' } },
      'lib/i18n/translation-sources.json': {},
    })
    expect(run(dir, '--accept').code).toBe(0)
    expect(run(dir).code).toBe(0)

    // the bokmål changes: English, Swedish and Empvibe's own words for it are now behind
    writeFileSync(join(dir, 'messages/no.json'), JSON.stringify({ site: { hero: 'Kartlegg det psykososiale arbeidsmiljøet', cta: 'Kom i gang' } }))
    const behind = run(dir)
    expect(behind.code).toBe(1)
    for (const file of ['messages/en.json', 'messages/sv.json', 'messages/market/gb/en.json']) expect(behind.out).toContain(`${file}: 1 stale`)
    expect(behind.out).toContain('site.hero')
    expect(behind.out).not.toContain('site.cta')
    // a pack's own text, with no bokmål behind it, is its own source
    expect(behind.out).not.toContain('own.article')

    // English is updated and recorded; the others are still listed
    run(dir, '--accept', 'messages/en.json', '--keys', 'site.hero')
    const left = run(dir)
    expect(left.code).toBe(1)
    expect(left.out).not.toContain('messages/en.json')
    expect(left.out).toContain('messages/sv.json: 1 stale')

    // the fold's pull request lists them without failing
    const report = execFileSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, I18N_STALE: 'report' } })
    expect(report).toBeDefined()
  })

  it('is tracked for every text the repository translates today', () => {
    const store = JSON.parse(readFileSync('lib/i18n/translation-sources.json', 'utf8')) as Record<string, Record<string, string>>
    for (const file of ['messages/en.json', 'messages/sv.json', 'messages/de.json', 'messages/market/gb/en.json', 'messages/market/se/sv.json'])
      expect(Object.keys(store[file] ?? {}).length, file).toBeGreaterThan(100)
  })
})
