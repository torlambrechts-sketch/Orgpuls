import type { Band } from '@/components/ui/Risk'

/**
 * Where a factor sits on Avansert's priority map (D-244). Pure, so it is tested on its own
 * (tests/unit/innsikt.test.ts).
 */

export interface QuadPoint {
  key: string
  label: string
  index: number
  band: Band
  /** the dot, in per cent of the map: where the factor is */
  x: number
  y: number
  /** the label's height, moved off its neighbours; the dot never moves */
  ly: number
  /** the label reads leftwards from a dot near the right edge (bundle 3040) */
  left: boolean
}

/**
 * Labels that would sit on top of one another, or on another dot, move to the nearest free height.
 * Only the label moves: the dot stays where the factor is. The width of a label is estimated from
 * its length at the map's 12px bold, against a map about 700px wide and 380px tall.
 */
export function spread(points: Omit<QuadPoint, 'ly' | 'left'>[]): QuadPoint[] {
  const GAP = 6.5
  const DOT_X = (11 / 700) * 100
  const DOT_Y = (11 / 380) * 100
  const span = (p: { x: number; label: string; index: number }, left: boolean): [number, number] => {
    const w = ((`${p.label} ${p.index}`.length * 7 + 18) / 700) * 100
    return left ? [p.x - w, p.x - 1] : [p.x + 1, p.x + w]
  }
  const placed: QuadPoint[] = []
  for (const p of [...points].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const left = p.x > 78
    const [a, b] = span(p, left)
    const clash = (y: number) =>
      placed.some((q) => {
        const [c, d] = span(q, q.left)
        return a < d && c < b && Math.abs(q.ly - y) < GAP
      }) || points.some((q) => q !== p && q.x + DOT_X > a && q.x - DOT_X < b && Math.abs(q.y - y) < DOT_Y + GAP / 2)
    // the nearest free height, either way, inside the map
    let ly = p.y
    for (let step = 0; step <= 90; step++) {
      const y = p.y + (step % 2 ? 1 : -1) * Math.ceil(step / 2)
      if (y < 4 || y > 96) continue
      if (!clash(y)) {
        ly = y
        break
      }
    }
    placed.push({ ...p, ly, left })
  }
  return placed
}

export function place(index: number, r: number): { x: number; y: number } {
  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  const x = Math.min(98, Math.max(2, ((index - 30) / 55) * 100))
  const y = r >= 0.45 ? 12 + clamp((0.7 - r) / 0.25) * 32 : 58 + clamp((0.45 - r) / 0.23) * 34
  return { x, y }
}
