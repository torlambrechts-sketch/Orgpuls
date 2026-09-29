import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { applyOverrides } from '@/lib/i18n/override-tree'
import { buildPlatformPackage, checkPlatformImport, isQuestionnairePath, overrideStanding, platformCatalogue, shownText, type Override } from '@/lib/i18n/platform-package'
import { parseFile, toJson, type Package } from '@/lib/i18n/translation-package'
import en from '@/messages/en.json'
import no from '@/messages/no.json'

/**
 * Bokmål and English in admin › Translations (0101, D-152): the catalogue splits the questions from
 * the pages, a package round-trips through the same file format as the survey languages, and an
 * import can change what a string says, never its placeholders or the catalogue's shape.
 */
const cat = platformCatalogue(no as never, en as never)
const byPath = new Map(cat.map((e) => [e.path, e]))
const none = new Map<string, Override>()
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

describe('the platform catalogue', () => {
  it('holds every bokmål string once, the questions apart from the pages', () => {
    expect(cat.length).toBeGreaterThan(5000)
    expect(new Set(cat.map((e) => e.key)).size).toBe(cat.length)
    expect(isQuestionnairePath('factor.ytring.s1')).toBe(true)
    expect(isQuestionnairePath('extra.anbefaling.text')).toBe(true)
    expect(isQuestionnairePath('factor.ytring.label')).toBe(false)
    expect(byPath.get('respond.next')?.view).toBe('pages')
    expect(byPath.get('respond.next')?.en).toBe('Next')
  })

  it('shows an override only once approved', () => {
    const e = byPath.get('respond.next')!
    expect(shownText(e, 'en', new Map([['respond.next', { key: 'respond.next', text: 'Continue', status: 'draft', source: 'professional', notes: null, source_hash: null }]]))).toBe('Next')
    expect(shownText(e, 'en', new Map([['respond.next', { key: 'respond.next', text: 'Continue', status: 'approved', source: 'professional', notes: null, source_hash: null }]]))).toBe('Continue')
  })
})

describe('a bokmål or English page package', () => {
  const pages = cat.filter((e) => e.view === 'pages' && e.ns === 'respond')
  const pkg = buildPlatformPackage('en', pages, none, none, none, '2026-09-28T00:00:00Z')
  const file = parseFile(toJson(pkg as unknown as Package))

  it('round-trips, and an untouched file writes nothing', () => {
    expect(file.locale).toBe('en')
    expect(file.entries.length).toBe(pages.length)
    const checked = checkPlatformImport(file, 'en', cat, none, none, 'professional')
    expect(checked.rows).toEqual([])
    expect(checked.unchanged).toBe(pages.length)
  })

  it('writes a changed text as a draft, from the bokmål it translates', () => {
    const edited = { ...file, entries: file.entries.map((e) => (e.key === 'msg:respond.next' ? { ...e, target: 'Continue' } : e)) }
    const checked = checkPlatformImport(edited, 'en', cat, none, none, 'machine')
    // with the file text it replaces (0109): the override stands only while the file still says that
    expect(checked.rows).toEqual([
      { key: 'respond.next', text: 'Continue', source: 'machine', status: 'draft', notes: null, source_hash: sha(byPath.get('respond.next')!.no), file_hash: sha(byPath.get('respond.next')!.en!) },
    ])
    expect(checked.problems).toEqual([])
  })

  it('refuses a lost placeholder, a broken message, a question and an unknown key', () => {
    const withPlaceholder = cat.find((e) => e.view === 'pages' && /\{[a-z]+\}/.test(e.no) && !/[{}].*[{}].*[{}]/.test(e.no))!
    const checked = checkPlatformImport(
      {
        format: 'json',
        locale: 'en',
        entries: [
          { key: withPlaceholder.key, target: 'No placeholder here' },
          { key: 'msg:respond.next', target: 'Broken {' },
          { key: 'msg:factor.ytring.s1', target: 'A question' },
          { key: 'msg:nope.nothing', target: 'x' },
          { key: 'core:ytring:1', target: 'another tab' },
        ],
      },
      'en',
      cat,
      none,
      none,
      'professional',
    )
    expect(checked.rows).toEqual([])
    expect(checked.problems.map((p) => p.code).sort()).toEqual(['placeholders', 'questionnaire', 'syntax', 'unknown_key'])
    expect(checked.outside).toBe(1)
  })

  it('puts the file text back by removing the override, and caps «approved» at pretested', () => {
    const own = new Map<string, Override>([['respond.next', { key: 'respond.next', text: 'Continue', status: 'approved', source: 'professional', notes: null, source_hash: null }]])
    const back = checkPlatformImport({ format: 'json', locale: 'en', entries: [{ key: 'msg:respond.next', target: 'Next' }] }, 'en', cat, own, none, 'professional')
    expect(back.rows).toEqual([{ key: 'respond.next', remove: true }])
    const capped = checkPlatformImport({ format: 'json', locale: 'en', entries: [{ key: 'msg:respond.next', target: 'Onward', status: 'approved' }] }, 'en', cat, none, none, 'professional')
    expect(capped.rows[0]).toMatchObject({ status: 'pretested' })
    expect(capped.problems.map((p) => p.code)).toEqual(['approved_capped'])
  })

  it('warns when the bokmål changed after the export', () => {
    const stale = checkPlatformImport({ format: 'json', locale: 'en', entries: [{ key: 'msg:respond.next', target: 'Onward', source_hash: 'a'.repeat(64) }] }, 'en', cat, none, none, 'professional')
    expect(stale.problems.map((p) => p.code)).toEqual(['stale'])
    expect(stale.rows.length).toBe(1)
  })
})

describe('laying overrides over a catalogue', () => {
  it('replaces a string at its path and nothing else', () => {
    const tree = { a: { b: 'one', c: { d: 'two' } } }
    expect(applyOverrides(tree, { 'a.b': 'uno', 'a.c': 'branch', 'a.x': 'new', 'a.c.d.e': 'deep' })).toEqual({ a: { b: 'uno', c: { d: 'two' } } })
    expect(tree.a.b).toBe('one')
  })

  it('lays an override only while the file still says what it replaced (0109, X-090)', () => {
    const tree = { a: { b: 'one', c: 'two', d: 'three' } }
    const flat = {
      'a.b': { text: 'uno', file: sha('one') },
      // folded back: the file now says the override's text, the file shows it
      'a.c': { text: 'dos', file: sha('the text before the fold') },
      // written before 0109: no basis, applied as before
      'a.d': { text: 'tres', file: null },
    }
    expect(applyOverrides(tree, flat)).toEqual({ a: { b: 'uno', c: 'two', d: 'tres' } })
  })

  it('shows, checks and exports against the live override only', () => {
    const e = byPath.get('respond.next')!
    const live = new Map<string, Override>([['respond.next', { key: 'respond.next', text: 'Onwards', status: 'approved', source: 'professional', notes: null, source_hash: null, file_hash: sha(e.en!) }]])
    const gone = new Map<string, Override>([['respond.next', { ...live.get('respond.next')!, file_hash: sha('an older English') }]])
    expect(shownText(e, 'en', live)).toBe('Onwards')
    expect(shownText(e, 'en', gone)).toBe(e.en)
    expect(overrideStanding(e, 'en', live)).toBe('live')
    expect(overrideStanding(e, 'en', gone)).toBe('superseded')
    expect(overrideStanding(e, 'en', new Map([['respond.next', { ...gone.get('respond.next')!, text: e.en! }]]))).toBe('folded')
    // against a superseded override, the file's own text is unchanged, not a removal
    const same = checkPlatformImport({ format: 'json', locale: 'en', entries: [{ key: 'msg:respond.next', target: e.en! }] }, 'en', cat, gone, none, 'professional')
    expect(same.rows).toEqual([])
    expect(same.unchanged).toBe(1)
  })
})
