/**
 * Citation numbers for one page: in the order each source is first cited, so the reader meets
 * 1, 2, 3 in reading order and the source list is numbered the same way (§ B3 CitedText).
 */
export const CITE_TOKEN = /\{\{cite:([a-z0-9_]+)\}\}/g

export function citeOrder(texts: string[]): string[] {
  const order: string[] = []
  for (const text of texts) {
    for (const m of text.matchAll(CITE_TOKEN)) if (m[1] && !order.includes(m[1])) order.push(m[1])
  }
  return order
}

export type Segment = { text: string } | { cites: string[] }

/** A text split into runs of words and runs of adjacent citations ("…2024.{{a}}{{b}}" → [text, [a, b]]). */
export function splitCites(text: string): Segment[] {
  const out: Segment[] = []
  let last = 0
  for (const m of text.matchAll(CITE_TOKEN)) {
    const at = m.index ?? 0
    if (at > last) out.push({ text: text.slice(last, at) })
    const prev = out.at(-1)
    if (prev && 'cites' in prev && at === last) prev.cites.push(m[1] ?? '')
    else out.push({ cites: [m[1] ?? ''] })
    last = at + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

/** The same text with its citation tokens removed, for JSON-LD, meta descriptions and the like. */
export const stripCites = (text: string) => text.replace(CITE_TOKEN, '')
