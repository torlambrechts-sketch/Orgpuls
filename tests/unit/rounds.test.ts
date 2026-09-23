import { describe, expect, it } from 'vitest'
import { numberPulses, roundStates } from '@/lib/rounds/read'
import { roundTitle } from '@/lib/rounds/title'

// ordered by closes_at descending, the way getRounds reads them — the wheel's planned
// rounds have future closing dates and so come first, which is what broke the old rule
const rows = [
  { id: 'g27', status: 'planlagt', opensAt: '2027-09-07T07:00:00Z' },
  { id: 'p27a', status: 'planlagt', opensAt: '2027-03-02T08:00:00Z' },
  { id: 'p26d', status: 'planlagt', opensAt: '2026-12-01T08:00:00Z' },
  { id: 'p26o', status: 'apen', opensAt: '2026-09-20T00:00:00Z' },
  { id: 'g26', status: 'lukket', opensAt: '2026-09-07T05:00:00Z' },
  { id: 'p26j', status: 'lukket', opensAt: '2026-06-02T07:00:00Z' },
  { id: 'g25', status: 'lukket', opensAt: '2025-08-21T05:00:00Z' },
]

describe('roundStates', () => {
  const s = roundStates(rows)

  it('calls the latest CLOSED round "Lukket", not the first row', () => {
    expect(s.get('g26')).toBe('lukket')
    expect(s.get('g27')).not.toBe('lukket')
  })

  it('archives every earlier closed round', () => {
    expect(s.get('p26j')).toBe('arkivert')
    expect(s.get('g25')).toBe('arkivert')
  })

  it('marks the planned round that opens first as next, the rest as planned', () => {
    expect(s.get('p26d')).toBe('neste')
    expect(s.get('p27a')).toBe('planlagt')
    expect(s.get('g27')).toBe('planlagt')
  })

  it('keeps an open round open', () => {
    expect(s.get('p26o')).toBe('apen')
  })

  it('has no "Lukket" at all when nothing has closed', () => {
    const only = roundStates([{ id: 'x', status: 'planlagt', opensAt: null }])
    expect([...only.values()]).toEqual(['neste'])
  })
})

describe('numberPulses', () => {
  const pulses = [
    { id: 'c', kind: 'puls', year: 2026, opensAt: '2026-12-01T08:00:00Z' },
    { id: 'a', kind: 'puls', year: 2026, opensAt: '2026-03-03T08:00:00Z' },
    { id: 'g', kind: 'grunnlinje', year: 2026, opensAt: '2026-09-07T05:00:00Z' },
    { id: 'b', kind: 'puls', year: 2026, opensAt: '2026-06-02T07:00:00Z' },
    { id: 'z', kind: 'puls', year: 2027, opensAt: '2027-03-02T08:00:00Z' },
  ]
  const n = numberPulses(pulses)

  it('numbers pulses within their year in the order they open', () => {
    expect([n.get('a'), n.get('b'), n.get('c')]).toEqual([1, 2, 3])
  })

  it('starts again at 1 each year', () => {
    expect(n.get('z')).toBe(1)
  })

  it('does not number a grunnlinje', () => {
    expect(n.has('g')).toBe(false)
  })
})

describe('roundTitle', () => {
  const t = (key: string, v?: Record<string, string | number>) =>
    key === 'malinger.pulseTitle'
      ? `${v?.kind} ${v?.n} · ${v?.year}`
      : key === 'malinger.roundTitle'
        ? `${v?.kind} ${v?.year}`
        : key.endsWith('.puls')
          ? 'Puls'
          : 'Grunnlinje'

  it('names a numbered puls the design way', () => {
    expect(roundTitle(t, { kind: 'puls', year: 2025, pulseNo: 2 })).toBe('Puls 2 · 2025')
  })

  it('falls back to the plain form rather than inventing a number', () => {
    expect(roundTitle(t, { kind: 'puls', year: 2025, pulseNo: null })).toBe('Puls 2025')
  })

  it('leaves a grunnlinje as it was', () => {
    expect(roundTitle(t, { kind: 'grunnlinje', year: 2026, pulseNo: null })).toBe('Grunnlinje 2026')
  })
})
