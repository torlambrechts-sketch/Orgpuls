import { describe, expect, it } from 'vitest'
import no from '@/messages/no.json'
import en from '@/messages/en.json'
import source from '@/lib/i18n/survey-source.json'
import { sourceHashes, surveyCatalogue, type ModuleSource } from '@/lib/i18n/survey-catalogue'
import { buildPackage, checkImport, parseFile, standing, toJson, toXliff, type Current } from '@/lib/i18n/translation-package'

/**
 * Survey languages' translation files (D-133): every text a respondent can meet is listed with its
 * bokmål source, both formats carry it there and back unchanged, and an import is checked against
 * the source before anything is written.
 */
const MODULE: ModuleSource = {
  key: 'probe',
  version: '1.0.0',
  name: 'Probe',
  factors: [{ id: '0f0e0d0c-0b0a-4908-8706-050403020100', name: 'Vold fra barn og elever', i18n: { en: { name: 'Violence' }, 'nb.barnehage': { name: 'Vold fra barn' } } }],
  items: [
    { id: '11111111-2222-4333-8444-555555555555', code: 'PR-VO-1', kind: 'likert5', factor: '0f0e0d0c-0b0a-4908-8706-050403020100',
      text: { nb: 'Barna eller elevene', en: 'The children or pupils', 'nb.skole': 'Elevene' }, options: null },
    { id: '66666666-7777-4888-8999-aaaaaaaaaaaa', code: 'PR-T-1', kind: 'count', factor: null,
      text: { nb: 'Har du opplevd vold?', en: 'Have you experienced violence?' }, options: [{ nb: 'Ja', en: 'Yes' }, { nb: 'Nei', en: 'No' }] },
  ],
}
const catalogue = surveyCatalogue(no, en, [MODULE])
const KEY = /^(core:[a-z_]+:[0-9]+|extra:[a-z_]+(:o[0-9]+)?|module:[0-9a-f-]{36}(:v:(barnehage|skole)|:o[0-9]+)?|mfactor:[0-9a-f-]{36}(:v:(barnehage|skole))?|(ui|mail):[a-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)*)$/

describe('the survey catalogue', () => {
  it('lists every section, under keys the database takes (0086), each once', () => {
    const count = (s: string) => catalogue.filter((e) => e.section === s).length
    expect(count('core')).toBeGreaterThan(30)
    expect(count('ui')).toBe(Object.keys(source.ui).length)
    expect(count('mail')).toBe(Object.keys(source.mail).length)
    expect(catalogue.filter((e) => e.section === 'module').map((e) => e.key)).toEqual([
      'mfactor:0f0e0d0c-0b0a-4908-8706-050403020100',
      'mfactor:0f0e0d0c-0b0a-4908-8706-050403020100:v:barnehage',
      'module:11111111-2222-4333-8444-555555555555',
      'module:11111111-2222-4333-8444-555555555555:v:skole',
      'module:66666666-7777-4888-8999-aaaaaaaaaaaa',
      'module:66666666-7777-4888-8999-aaaaaaaaaaaa:o1',
      'module:66666666-7777-4888-8999-aaaaaaaaaaaa:o2',
    ])
    for (const e of catalogue) expect(e.key, e.key).toMatch(KEY)
    expect(new Set(catalogue.map((e) => e.key)).size).toBe(catalogue.length)
    expect(catalogue.filter((e) => e.sms).map((e) => e.key).every((k) => k.startsWith('mail:sms.'))).toBe(true)
  })

  it('hashes the sources as the generated file does (scripts/i18n/respondent-ui.mjs)', () => {
    expect(sourceHashes(no)).toEqual(source)
  })
})

describe('the files', () => {
  const current: Current[] = [
    { item: 'core:ytring:1', text: 'Mogę mówić "swobodnie" & <otwarcie>', status: 'pretested', source: 'professional', notes: 'Uzgodnione', source_hash: catalogue.find((e) => e.key === 'core:ytring:1')!.hash },
  ]
  const pkg = buildPackage('pl', catalogue, current, '2026-09-27T12:00:00Z')

  it('JSON and XLIFF 2.0 carry every entry there and back', () => {
    for (const text of [toJson(pkg), toXliff(pkg)]) {
      const back = parseFile(text)
      expect(back.locale).toBe('pl')
      expect(back.entries).toHaveLength(catalogue.length)
      const e = back.entries.find((x) => x.key === 'core:ytring:1')!
      expect(e).toMatchObject({ target: current[0]!.text, status: 'pretested', origin: 'professional', notes: 'Uzgodnione', source_hash: current[0]!.source_hash })
      expect(back.entries.find((x) => x.key === 'ui:respond.keys.title')!.target).toBe('')
    }
  })

  it('XLIFF says the step as the segment state, and refuses inline markup a tool added', () => {
    const x = toXliff(pkg)
    expect(x).toContain('<segment state="reviewed">')
    expect(() => parseFile(x.replace('Uzgodnione', 'x').replace('&amp; &lt;otwarcie&gt;', '<ph id="1"/>'))).toThrow(/inline/)
    expect(() => parseFile('<xliff version="1.2"></xliff>')).toThrow(/not_xliff2/)
    expect(() => parseFile('{"format":"other"}')).toThrow(/not_a_package/)
  })
})

describe('checking an import', () => {
  const file = (entries: Parameters<typeof checkImport>[0]['entries']) => ({ format: 'json' as const, locale: 'pl', entries })
  const hash = (k: string) => catalogue.find((e) => e.key === k)!.hash

  it('takes a good translation, and says what it keeps out and why', () => {
    const r = checkImport(
      file([
        { key: 'ui:respond.keys.title', target: '{count, plural, one {Napisałeś komentarz} few {Napisałeś # komentarze} many {Napisałeś # komentarzy} other {Napisałeś # komentarza}}', status: 'in_review' },
        { key: 'ui:respond.keys.open', target: '{count, plural, one {Otwórz rozmowę} other {Otwórz rozmowę {n}}}' },
        { key: 'mail:invitasjon.subject', target: '{organisation}: ankieta {round}' },
        { key: 'mail:invitasjon.cta', target: 'Odpowiedz {' },
        { key: 'core:ytring:1', target: 'Mogę mówić swobodnie', status: 'approved' },
        { key: 'core:ytring:2', target: 'Liczy się moje zdanie', source_hash: 'f'.repeat(64) },
        { key: 'core:ytring:3', target: '' },
        { key: 'nope:1', target: 'x' },
      ]),
      catalogue,
      [],
      'professional',
    )
    expect(r.rows.map((x) => [x.key, x.status, x.source])).toEqual([
      ['ui:respond.keys.title', 'in_review', 'professional'],
      ['core:ytring:1', 'pretested', 'professional'],
      ['core:ytring:2', 'draft', 'professional'],
    ])
    expect(r.problems.map((p) => `${p.key} ${p.level} ${p.code}`)).toEqual([
      'ui:respond.keys.open error plural',
      'mail:invitasjon.subject error placeholders',
      'mail:invitasjon.cta error syntax',
      'core:ytring:1 warning approved_capped',
      'core:ytring:2 warning stale',
      'nope:1 error unknown_key',
    ])
    expect(r.untranslated).toBe(1)
  })

  it('leaves out what the database already holds, and reads a translation by its source', () => {
    const k = 'core:ytring:1'
    const held: Current = { item: k, text: 'Mogę', status: 'draft', source: 'professional', notes: null, source_hash: hash(k) }
    expect(checkImport(file([{ key: k, target: 'Mogę' }]), catalogue, [held], 'professional')).toMatchObject({ rows: [], unchanged: 1 })
    const ui = catalogue.find((e) => e.key === 'ui:respond.language')!
    expect(standing(ui, { item: ui.key, text: 'Język', status: 'approved', source: 'professional', notes: null, source_hash: ui.hash })).toBe('approved')
    expect(standing(ui, { item: ui.key, text: 'Język', status: 'approved', source: 'professional', notes: null, source_hash: 'a'.repeat(64) })).toBe('stale')
    expect(standing(ui, undefined)).toBe('none')
  })
})
