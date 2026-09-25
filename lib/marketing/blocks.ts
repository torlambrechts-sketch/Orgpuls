import { z } from 'zod'
import { SHOT_IDS } from './shot-ids'

/**
 * The content blocks the public pages are written in. An article or a landing page is an
 * array of these in /messages, read with `t.raw` and parsed here, so a typo in a message
 * file fails the build's render of that page instead of rendering half of it.
 *
 * Text may carry two inline marks, and only two: `**bold**` and `[label](href)`. There is
 * no HTML in a message, so there is nothing to sanitise.
 */
export const Block = z.discriminatedUnion('t', [
  z.object({ t: z.literal('h2'), text: z.string() }),
  z.object({ t: z.literal('h3'), text: z.string() }),
  z.object({ t: z.literal('p'), text: z.string() }),
  z.object({ t: z.literal('ul'), items: z.array(z.string()).min(1) }),
  z.object({ t: z.literal('ol'), items: z.array(z.string()).min(1) }),
  /** a quotation from the law or a regulation, with where it is from */
  z.object({ t: z.literal('quote'), text: z.string(), cite: z.string() }),
  /** paragraphs of the law, one line each: the reference and what it asks */
  z.object({ t: z.literal('law'), items: z.array(z.object({ ref: z.string(), text: z.string() })).min(1) }),
  /** a highlighted aside: a tip, a rule of thumb, or how Orgpuls handles the point */
  z.object({ t: z.literal('box'), title: z.string(), text: z.string() }),
  /** cards in a row, each with a heading and a sentence or two */
  z.object({ t: z.literal('cards'), items: z.array(z.object({ title: z.string(), text: z.string() })).min(1) }),
  z.object({ t: z.literal('table'), head: z.array(z.string()).min(2), rows: z.array(z.array(z.string())).min(1) }),
  /** cards that are links to other pages of the site, by internal path */
  z.object({
    t: z.literal('links'),
    items: z.array(z.object({ title: z.string(), text: z.string(), href: z.string().regex(/^\/[a-z0-9/#-]*$/) })).min(1),
  }),
  /** the three plans, exactly as the start page shows them (components/marketing/Plans) */
  z.object({ t: z.literal('plans') }),
  /** a picture of the product, by id (lib/marketing/shot-ids); its words are `seo.shots.<id>` */
  z.object({ t: z.literal('shot'), id: z.enum(SHOT_IDS) }),
])
export type Block = z.infer<typeof Block>

export const Blocks = z.array(Block)

export const FaqItems = z.array(z.object({ q: z.string(), a: z.string() }))
export type FaqItem = z.infer<typeof FaqItems>[number]

/** Strips the two inline marks, for a meta description, JSON-LD or a word count. */
export const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

/** Every word a reader reads in the blocks, for an honest reading time. */
export function wordCount(blocks: Block[]): number {
  const text = blocks
    .flatMap((b) => {
      switch (b.t) {
        case 'ul':
        case 'ol':
          return b.items
        case 'quote':
          return [b.text]
        case 'law':
          return b.items.map((i) => `${i.ref} ${i.text}`)
        case 'box':
          return [b.title, b.text]
        case 'cards':
        case 'links':
          return b.items.map((i) => `${i.title} ${i.text}`)
        case 'plans':
        case 'shot':
          return []
        case 'table':
          return [...b.head, ...b.rows.flat()]
        default:
          return [b.text]
      }
    })
    .map(plain)
    .join(' ')
  return text.split(/\s+/).filter(Boolean).length
}
