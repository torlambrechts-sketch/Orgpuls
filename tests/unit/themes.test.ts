import { describe, expect, it } from 'vitest'
import { themeTone } from '@/lib/conversations/rules'

describe('themeTone — a theme named from how its answers fall, never from its text', () => {
  it('two thirds at the low end is Negativ', () => {
    expect(themeTone({ low: 4, mid: 1, high: 1 })).toBe('negativ')
    expect(themeTone({ low: 2, mid: 1, high: 0 })).toBe('negativ') // exactly two thirds
  })
  it('two thirds at the high end is Positiv', () => {
    expect(themeTone({ low: 0, mid: 1, high: 5 })).toBe('positiv')
  })
  it('two thirds in the middle is Nøytral', () => {
    expect(themeTone({ low: 1, mid: 4, high: 1 })).toBe('noytral')
  })
  it('anything short of two thirds anywhere is Blandet', () => {
    expect(themeTone({ low: 3, mid: 0, high: 3 })).toBe('blandet')
    expect(themeTone({ low: 5, mid: 3, high: 0 })).toBe('blandet') // 5 of 8 is under two thirds
  })
  it('a theme with no readable answers is Blandet, not a guess', () => {
    expect(themeTone({ low: 0, mid: 0, high: 0 })).toBe('blandet')
  })
})
