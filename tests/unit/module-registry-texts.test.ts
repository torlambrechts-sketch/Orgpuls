import { describe, expect, it } from 'vitest'
import { sourceHash } from '@/lib/i18n/survey-catalogue'
import { translatorFrom } from '@/lib/modules/registry-texts'
import { contentLang, registryTexts } from '@/lib/i18n/locales'

/**
 * A module's statements, options and factor names for a Swedish leader (D-262): the registry's
 * approved Swedish, matched on the bokmål it was translated from; English for everything else.
 */
describe('module texts in a registry language', () => {
  const nb = 'Når det blir dårlig tid, går sikkerheten fortsatt foran fremdriften'
  const tr = translatorFrom([
    { text: 'När det blir ont om tid går säkerheten fortfarande före tidsplanen', source_hash: sourceHash(nb) },
    { text: 'Översatt från en äldre text', source_hash: sourceHash('En påstand som er endret siden') },
    { text: 'Utan källa', source_hash: null },
    { text: '   ', source_hash: sourceHash('Tom') },
  ])

  it('shows the translation of the bokmål the module still says', () => {
    expect(tr(nb)).toBe('När det blir ont om tid går säkerheten fortfarande före tidsplanen')
  })

  it('shows nothing for a statement whose bokmål has changed since, or for one never translated', () => {
    expect(tr('En påstand som er endret')).toBeNull()
    expect(tr('Aldri oversatt')).toBeNull()
  })

  it('never lays a row without its source, or an empty one', () => {
    expect(tr('Utan källa')).toBeNull()
    expect(tr('Tom')).toBeNull()
    expect(tr('')).toBeNull()
  })

  it('is asked only for a language whose survey texts live in the registry; English stands behind it', () => {
    expect(registryTexts('sv')).toBe(true)
    expect(registryTexts('no')).toBe(false)
    expect(contentLang('sv')).toBe('en')
    expect(contentLang('no')).toBe('no')
  })
})
