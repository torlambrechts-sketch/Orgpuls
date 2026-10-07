import { describe, expect, it } from 'vitest'
import { place, spread } from '@/lib/innsikt/map'
import { parseInnsiktMode } from '@/lib/innsikt/mode'

describe('Innsikt view (D-244)', () => {
  it('follows the shell until a person chooses', () => {
    expect(parseInnsiktMode(undefined, 'full')).toBe('avansert')
    expect(parseInnsiktMode(undefined, 'enkel')).toBe('enkel')
    expect(parseInnsiktMode('enkel', 'full')).toBe('enkel')
    expect(parseInnsiktMode('avansert', 'enkel')).toBe('avansert')
    expect(parseInnsiktMode('something', 'full')).toBe('avansert')
  })
})

describe('the priority map', () => {
  it("places factors as the design does: the bundle's Ytringsklima 41 at r .62", () => {
    const p = place(41, 0.62)
    expect(p.x).toBeCloseTo(20, 0)
    expect(p.y).toBeCloseTo(22.2, 1)
  })

  it('puts a factor that moves little with the whole in the lower half', () => {
    expect(place(70, 0.1).y).toBeGreaterThan(50)
    expect(place(70, 0.6).y).toBeLessThan(50)
  })

  it('keeps every dot inside the map', () => {
    for (const [i, r] of [
      [5, -1],
      [100, 1],
      [30, 0.45],
    ] as const) {
      const p = place(i, r)
      expect(p.x).toBeGreaterThanOrEqual(2)
      expect(p.x).toBeLessThanOrEqual(98)
      expect(p.y).toBeGreaterThanOrEqual(12)
      expect(p.y).toBeLessThanOrEqual(92)
    }
  })

  it('moves labels apart and never the dots', () => {
    const pts = [
      { key: 'a', label: 'Motstridende krav', index: 52, band: 'middels' as const, x: 40, y: 92 },
      { key: 'b', label: 'Kontakt', index: 57, band: 'middels' as const, x: 49, y: 92 },
      { key: 'c', label: 'Emosjonelle krav', index: 58, band: 'middels' as const, x: 51, y: 92 },
    ]
    const out = spread(pts)
    for (const p of pts) {
      const o = out.find((x) => x.key === p.key)!
      expect([o.x, o.y]).toEqual([p.x, p.y])
      expect(o.ly).toBeGreaterThanOrEqual(4)
      expect(o.ly).toBeLessThanOrEqual(96)
    }
    const ly = out.map((o) => o.ly).sort((a, b) => a - b)
    expect(ly[1]! - ly[0]!).toBeGreaterThanOrEqual(6.5)
    expect(ly[2]! - ly[1]!).toBeGreaterThanOrEqual(6.5)
  })

  it('reads a label leftwards near the right edge', () => {
    const [o] = spread([{ key: 'm', label: 'Mening', index: 78, band: 'lav', x: 87, y: 34 }])
    expect(o!.left).toBe(true)
    expect(o!.ly).toBe(34)
  })
})
