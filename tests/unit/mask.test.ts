import { describe, expect, it } from 'vitest'
import { unmask } from '@/lib/text/mask'

// the markers public.open_answers and public.conversations mask with (0095, D-145)
describe('unmask', () => {
  const labels = { n: 'navn', a: 'avdeling', s: 'sted' }

  it('draws each marker as the word for what was removed', () => {
    expect(unmask('⟦n⟧ og ⟦n⟧ møter på ⟦a⟧ i ⟦s⟧', labels)).toBe('[navn] og [navn] møter på [avdeling] i [sted]')
  })

  it('leaves a text without markers as it is', () => {
    expect(unmask('Mindre overtid før jul.', labels)).toBe('Mindre overtid før jul.')
  })

  it('does not read other brackets as markers', () => {
    expect(unmask('⟦x⟧ [n] ⟦nn⟧', labels)).toBe('⟦x⟧ [n] ⟦nn⟧')
  })
})
