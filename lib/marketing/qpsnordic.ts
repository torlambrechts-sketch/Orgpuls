import { z } from 'zod'
import raw from '@/scripts/maler/qpsnordic34.json'

/**
 * QPSNordic 34+, the short version of the General Nordic Questionnaire, verbatim from the STAMI
 * manual's appendix 2 (X-107). One file holds it – scripts/maler/qpsnordic34.json – and both the
 * template's Word and Excel files (scripts/maler/build.py) and the template's page (the `qps`
 * block, components/marketing/QpsItems) are drawn from it, so the page cannot show a wording the
 * file does not carry. Parsed here, not cast: the file is data a build reads.
 */
const Item = z.object({
  n: z.number().int().positive(),
  /** the item's number in the full QPSNordic; empty for the three the short version adds */
  qps: z.string(),
  scale: z.string(),
  /** a question several items share («Hvordan er klimaet …?»), or the definition before the stress item */
  lead: z.string().optional(),
  text: z.string(),
})

export const Qps = z.object({
  source: z.string(),
  intro: z.array(z.string()).min(1),
  background: z.array(z.object({ id: z.string(), text: z.string(), options: z.array(z.string()) })).min(1),
  /** the five answer options of each scale, in the order they score 1–5 */
  scales: z.record(z.string(), z.array(z.string()).length(5)),
  items: z.array(Item).min(1),
})

export type QpsItem = z.infer<typeof Item>

export const QPS = Qps.parse(raw)

/** The items in the manual's order, cut where the answer scale changes: the scale's five options, then its items */
export function qpsGroups(): { key: string; scale: string[]; items: QpsItem[] }[] {
  const groups: { key: string; scale: string[]; items: QpsItem[] }[] = []
  for (const item of QPS.items) {
    const scale = QPS.scales[item.scale]
    if (!scale) throw new Error(`QPSNordic 34+: item ${item.n} names a scale the file does not hold: ${item.scale}`)
    const last = groups[groups.length - 1]
    if (last && last.key === item.scale) last.items.push(item)
    else groups.push({ key: item.scale, scale, items: [item] })
  }
  return groups
}
