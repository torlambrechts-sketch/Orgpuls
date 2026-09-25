import type { Route } from 'next'
import Link from 'next/link'
import type { Block } from '@/lib/marketing/blocks'
import { LawRef } from './LawRef'
import { Plans } from './Plans'
import { ProductShot } from './ProductShot'
import { Rich } from './Rich'
import { H2, Section } from './Section'

/**
 * One renderer per block kind, in the start page's faces and surfaces at the public site's
 * type scale (D-86). Nothing here knows which page it is on.
 *
 * Two ways to lay them out:
 * - `Blocks`, one reading column, for an article.
 * - `BlockSections`, for a landing or site page: each `h2` opens a full-width band
 *   (docs/landingsside-gjennomgang.md 4.2). The heading takes 5 of 12 columns and the text
 *   the other 7: at the guide's H2 size a Norwegian compound ("Dokumentasjonen") needs more
 *   than 4 columns, and 7 keeps the text near 70 characters a line. A band with a picture of the product is 6/6, the picture changing side from
 *   one such band to the next. Cards and link cards take the whole width under the band's
 *   text.
 */
export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} heading />
      ))}
    </div>
  )
}

type Group = { heading: string | null; blocks: Block[] }

/** How many bands `BlockSections` draws for these blocks, so what follows can keep alternating. */
export const sectionCount = (blocks: Block[]) =>
  blocks.filter((b) => b.t === 'h2').length + (blocks.length && blocks[0]?.t !== 'h2' ? 1 : 0)

const WIDE = new Set<Block['t']>(['cards', 'links', 'plans'])

export function BlockSections({ blocks, firstTone = 'surface' }: { blocks: Block[]; firstTone?: 'base' | 'surface' }) {
  const groups: Group[] = []
  for (const b of blocks) {
    if (b.t === 'h2') groups.push({ heading: b.text, blocks: [] })
    else if (groups.length) groups.at(-1)!.blocks.push(b)
    else groups.push({ heading: null, blocks: [b] })
  }

  let pictures = 0
  return (
    <>
      {groups.map((g, i) => {
        const tone = (i % 2 === 0) === (firstTone === 'surface') ? 'surface' : 'base'
        const id = `del-${i + 1}`
        const shots = g.blocks.filter((b) => b.t === 'shot')
        const wide = g.blocks.filter((b) => WIDE.has(b.t))
        const text = g.blocks.filter((b) => b.t !== 'shot' && !WIDE.has(b.t))
        const heading = g.heading ? <H2 id={id}>{g.heading}</H2> : null

        if (shots.length) {
          const flip = pictures++ % 2 === 1
          return (
            <Section key={i} tone={tone} label={g.heading ? id : undefined}>
              <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-8">
                <div className={`flex min-w-0 flex-col gap-6 lg:col-span-6 ${flip ? 'lg:order-last' : ''}`}>
                  {heading}
                  {text.map((b, j) => (
                    <BlockView key={j} block={b} />
                  ))}
                </div>
                <div className="flex min-w-0 flex-col items-center gap-6 lg:col-span-6">
                  {shots.map((b, j) => (
                    <BlockView key={j} block={b} />
                  ))}
                </div>
              </div>
              {wide.map((b, j) => (
                <div key={j} className="mt-10">
                  <BlockView block={b} />
                </div>
              ))}
            </Section>
          )
        }

        return (
          <Section key={i} tone={tone} label={g.heading ? id : undefined}>
            <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
              <div className="min-w-0 lg:col-span-5">{heading}</div>
              {text.length ? (
                <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
                  {text.map((b, j) => (
                    <BlockView key={j} block={b} />
                  ))}
                </div>
              ) : null}
            </div>
            {wide.map((b, j) => (
              <div key={j} className="mt-10">
                <BlockView block={b} />
              </div>
            ))}
          </Section>
        )
      })}
    </>
  )
}

const prose = 'max-w-prose text-mk-body text-body [text-wrap:pretty]'

/** Columns for a row of `n` cards: the whole width, never a narrow row in the middle (4.2). */
export const cardColumns = (n: number) =>
  n >= 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : n === 3 ? 'md:grid-cols-3' : n === 2 ? 'md:grid-cols-2' : ''

function BlockView({ block: b, heading = false }: { block: Block; heading?: boolean }) {
  switch (b.t) {
    case 'h2':
      // only in an article's single column; a landing page's h2 opens a band instead
      return heading ? (
        <h2 className="m-0 mt-8 max-w-[30ch] font-display text-mk-h2 font-semibold [overflow-wrap:break-word] [text-wrap:balance]">
          {b.text}
        </h2>
      ) : null
    case 'h3':
      return <h3 className="m-0 mt-2 text-mk-h3 font-bold">{b.text}</h3>
    case 'p':
      return (
        <p className={`m-0 ${prose}`}>
          <Rich text={b.text} />
        </p>
      )
    case 'ul':
    case 'ol': {
      const List = b.t === 'ul' ? 'ul' : 'ol'
      return (
        <List className={`m-0 ${prose} flex flex-col gap-2 pl-6 ${b.t === 'ul' ? 'list-disc' : 'list-decimal'}`}>
          {b.items.map((item, i) => (
            <li key={i} className="pl-1">
              <Rich text={item} />
            </li>
          ))}
        </List>
      )
    }
    case 'quote':
      return (
        <figure className="m-0 max-w-prose border-l-4 border-ac pl-5">
          <blockquote className="m-0 text-mk-lead italic text-body [text-wrap:pretty]">«{b.text}»</blockquote>
          <figcaption className="mt-2 text-mk-small font-semibold text-mut">
            <Rich text={b.cite} />
          </figcaption>
        </figure>
      )
    case 'law':
      return (
        <div className="flex flex-col gap-2">
          {b.items.map((item, i) => (
            <span
              key={i}
              className="grid items-baseline gap-4 rounded-cta border border-line bg-bg px-4 py-3 [grid-template-columns:8rem_minmax(0,1fr)] max-sm:grid-cols-1 max-sm:gap-1"
            >
              <LawRef text={item.ref} className="text-mk-small font-bold" />
              <span className="text-mk-card [text-wrap:pretty]">
                <Rich text={item.text} />
              </span>
            </span>
          ))}
        </div>
      )
    case 'box':
      return (
        <aside className="max-w-prose rounded-note border-2 border-ink bg-sbg px-6 py-5">
          <span className="block text-mk-card font-bold">{b.title}</span>
          <span className="mt-2 block text-mk-card text-body [text-wrap:pretty]">
            <Rich text={b.text} />
          </span>
        </aside>
      )
    case 'cards':
      return (
        <div className={`grid gap-6 ${cardColumns(b.items.length)}`}>
          {b.items.map((item, i) => (
            <div key={i} className="rounded-note border border-line bg-bg p-6">
              <h3 className="m-0 text-mk-h3 font-bold [text-wrap:pretty]">{item.title}</h3>
              <p className="m-0 mt-2 text-mk-card text-mut [text-wrap:pretty]">
                <Rich text={item.text} />
              </p>
            </div>
          ))}
        </div>
      )
    case 'links':
      return <LinkCards items={b.items} />
    case 'plans':
      return <Plans />
    case 'shot':
      return <ProductShot id={b.id} />
    case 'table':
      return (
        <div className="overflow-x-auto rounded-note border border-line bg-bg">
          <table className="w-full border-collapse text-left text-mk-card">
            <thead>
              <tr>
                {b.head.map((h, i) => (
                  <th key={i} scope="col" className="border-b border-line px-4 py-3 text-mk-small font-bold text-mut">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, r) => (
                <tr key={r} className={r < b.rows.length - 1 ? 'border-b border-line' : ''}>
                  {row.map((cell, c) => (
                    <td key={c} className={`px-4 py-3 align-top ${c === 0 ? 'font-semibold' : ''}`}>
                      <Rich text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

/** Cards that are links to other pages of the site, across the whole width. */
export function LinkCards({ items }: { items: { href: string; title: string; text: string }[] }) {
  return (
    <div className={`grid gap-6 ${cardColumns(items.length)}`}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href as Route}
          className="group flex flex-col gap-2 rounded-note border border-line bg-bg p-6 text-ink no-underline hover:border-ink hover:text-ink hover:no-underline"
        >
          <span className="text-mk-h3 font-bold [text-wrap:pretty] group-hover:underline">{item.title}</span>
          <span className="text-mk-card text-mut [text-wrap:pretty]">{item.text}</span>
        </Link>
      ))}
    </div>
  )
}
