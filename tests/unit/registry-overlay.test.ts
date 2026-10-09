import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { registryOverlay, registryPath } from '@/lib/i18n/registry-overlay'
import { sourceHash, surveyCatalogue } from '@/lib/i18n/survey-catalogue'

/**
 * The registry's instrument texts in the leader's views (0216, D-253): each id lands on the path
 * it was translated from, and only while that path still says what it was translated from.
 */
const no = JSON.parse(readFileSync('messages/no.json', 'utf8')) as Record<string, unknown>
const en = JSON.parse(readFileSync('messages/en.json', 'utf8')) as Record<string, unknown>
const at = (tree: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), tree)

describe('registry ids and catalogue paths', () => {
  it('maps the five kinds of instrument text', () => {
    expect(registryPath('core:ytring:2')).toBe('factor.ytring.s2')
    expect(registryPath('extra:anbefaling')).toBe('extra.anbefaling.text')
    expect(registryPath('extra:krenkende:o3')).toBe('extra.krenkende.o3')
    expect(registryPath('ui:factor.mengde')).toBe('factor.mengde.label')
    expect(registryPath('ui:extra.vold')).toBe('extra.vold.label')
  })

  it('maps nothing else: page strings, mail, modules', () => {
    for (const id of ['ui:respond.intro', 'mail:invitasjon.subject', 'module:0f0e0d0c-0b0a-4908-8706-050403020100',
                      'mfactor:0f0e0d0c-0b0a-4908-8706-050403020100', 'ui:factor.ytring.extra', 'core:ytring'])
      expect(registryPath(id), id).toBeNull()
  })

  it('lands every core, extra and label text of the catalogue on the bokmål it was made from', () => {
    const entries = surveyCatalogue(no, en, []).filter(
      (e) => e.section === 'core' || e.section === 'extra' || /^ui:(factor|extra)\./.test(e.key),
    )
    expect(entries.filter((e) => e.section === 'core').length).toBe(33)
    for (const e of entries) {
      const path = registryPath(e.key)
      expect(path, e.key).not.toBeNull()
      expect(at(no, path!), e.key).toBe(e.source)
    }
  })
})

describe('the overlay', () => {
  const statement = at(no, 'factor.ytring.s1') as string
  const label = at(no, 'factor.ytring.label') as string

  it('lays a text whose source is the bokmål at its path', () => {
    expect(registryOverlay(no, {
      'core:ytring:1': { t: 'Jag kan säga ifrån', h: sourceHash(statement) },
      'ui:factor.ytring': { t: 'Yttrandeklimat', h: sourceHash(label) },
    })).toEqual({ 'factor.ytring.s1': 'Jag kan säga ifrån', 'factor.ytring.label': 'Yttrandeklimat' })
  })

  it('leaves out a text translated from a bokmål that has since changed, or with no source', () => {
    expect(registryOverlay(no, {
      'core:ytring:1': { t: 'Gammal', h: sourceHash(`${statement} (før)`) },
      'core:ytring:2': { t: 'Utan källa', h: null },
    })).toEqual({})
  })

  it('leaves out ids bokmål has no string for, and empty texts', () => {
    expect(registryOverlay(no, {
      'core:ytring:9': { t: 'Finns inte', h: sourceHash('x') },
      'ui:respond.intro': { t: 'Sida', h: sourceHash('x') },
      'ui:factor.ytring': { t: '  ', h: sourceHash(label) },
    })).toEqual({})
  })
})
