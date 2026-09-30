import type { z } from 'zod'
import type { EXPORT_SCHEMA, ExportKind } from './growthData'

type Rows<K extends ExportKind> = z.infer<(typeof EXPORT_SCHEMA)[K]>
type T = (key: string, values?: Record<string, string | number>) => string
type Cell = string | number | null

/**
 * The Growth exports' rows (0142, D-183), headers first, every word through next-intl
 * (`admin.growth.g2`). Pure, so the unit test holds the columns: the board's status is the derived
 * one the page shows, the owner an address or nothing, the plan's gates one cell, the review its
 * three sections one after another.
 */
export function growthCsv<K extends ExportKind>(kind: K, data: Rows<K>, t: T): Cell[][] {
  if (kind === 'board') {
    const d = data as Rows<'board'>
    return [
      ['tier', 'rank', 'item', 'why', 'status', 'owner', 'effort', 'impact', 'score', 'kpi', 'build', 'guardrail', 'where'].map((h) => t(`csv.board.${h}`)),
      ...d.rows.map((r) => [
        r.tier_name,
        r.rank,
        r.name,
        r.why,
        t(`status.item.${r.status}`),
        r.owner?.email ?? null,
        r.effort,
        r.impact,
        r.score,
        r.kpi,
        r.build,
        r.guardrail,
        r.href,
      ]),
    ]
  }
  if (kind === 'plan') {
    const d = data as Rows<'plan'>
    return [
      ['weeks', 'status', 'foundation', 'lead', 'gates'].map((h) => t(`csv.plan.${h}`)),
      ...d.rows.map((b) => [t('plan.range', { from: b.from, to: b.to }), t(`status.plan.${b.status}`), b.foundation, b.lead, b.gates.join(' | ')]),
    ]
  }
  const d = data as Rows<'review'>
  return [
    ['section', 'n', 'item', 'status', 'note', 'where'].map((h) => t(`csv.review.${h}`)),
    ...d.coverage.map((c, i) => [t('csv.review.coverage'), i + 1, c.feature, t(`status.coverage.${c.status}`), c.note || null, c.href]),
    ...d.recommendations.map((r) => [t('csv.review.recommended'), r.n, r.title, t(`status.priority.${r.priority}`), r.body, null]),
    ...d.cuts.map((c, i) => [t('csv.review.cut'), i + 1, c, null, null, null]),
  ]
}
