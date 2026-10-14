import type { Route } from 'next'
import Link from '@/components/site/SitePaths'
import type { Block } from '@/lib/marketing/blocks'
import { DataTable } from './DataTable'
import { Cycle, Hub, Ladder, Timeline } from './Diagrams'
import { LawRef } from './LawRef'
import { Plans } from './Plans'
import { ProductShot } from './ProductShot'
import { QpsItems } from './QpsItems'
import { Rich } from './Rich'

/**
 * One renderer per block kind, in the splash page's own type and surfaces: the same
 * display face for headings, the same card, note and law-row treatments the start page
 * uses, at a reading measure. A page is its blocks in order; nothing here knows which page.
 */
export function Blocks({ blocks }: { blocks: Block[] }) {
  const ids = headingIds(blocks)
  return (
    <div className="flex flex-col gap-[16px]">
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} id={ids[i]} />
      ))}
    </div>
  )
}

/**
 * Each H2's anchor, by block index, for the contents list beside the text (WithAside): the
 * heading's own words as a slug, numbered when two would be the same.
 */
export function headingIds(blocks: Block[]): (string | undefined)[] {
  const seen = new Map<string, number>()
  return blocks.map((b) => {
    if (b.t !== 'h2') return undefined
    const base =
      b.text
        .toLowerCase()
        .replace(/æ/g, 'ae')
        .replace(/ø/g, 'o')
        .replace(/å/g, 'a')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'del'
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base}-${n}`
  })
}

// the column is the measure: the reading column beside the sidebar (WithAside, D-233) is what keeps lines short
const prose = 'text-[16px] leading-[1.7] text-body [text-wrap:pretty]'

function BlockView({ block: b, id }: { block: Block; id?: string }) {
  switch (b.t) {
    case 'h2':
      return (
        <h2
          id={id}
          className="mt-[26px] max-w-[30ch] scroll-mt-[118px] font-display text-[clamp(23px,3vw,29px)] font-semibold leading-[1.18] [overflow-wrap:break-word] [text-wrap:balance]"
        >
          {b.text}
        </h2>
      )
    case 'h3':
      return <h3 className="mt-[10px] text-[17px] font-bold leading-[1.35]">{b.text}</h3>
    case 'p':
      return (
        <p className={prose}>
          <Rich text={b.text} />
        </p>
      )
    case 'ul':
    case 'ol': {
      const List = b.t === 'ul' ? 'ul' : 'ol'
      return (
        <List className={`${prose} flex flex-col gap-[7px] pl-[22px] ${b.t === 'ul' ? 'list-disc' : 'list-decimal'}`}>
          {b.items.map((item, i) => (
            <li key={i} className="pl-[4px]">
              <Rich text={item} />
            </li>
          ))}
        </List>
      )
    }
    case 'quote':
      return (
        <figure className="m-0 border-l-[3px] border-ac pl-[18px]">
          <blockquote className="m-0 text-[15.5px] italic leading-[1.65] text-body [text-wrap:pretty]">«{b.text}»</blockquote>
          <figcaption className="mt-[6px] text-[12.5px] font-semibold text-mut">
            <Rich text={b.cite} />
          </figcaption>
        </figure>
      )
    case 'law':
      return (
        <div className="flex flex-col gap-[9px]">
          {b.items.map((item, i) => (
            <span
              key={i}
              className="grid items-baseline gap-[13px] rounded-cta border border-line bg-sf px-[15px] py-[13px] [grid-template-columns:110px_minmax(0,1fr)] max-sm:grid-cols-1 max-sm:gap-[4px]"
            >
              <LawRef text={item.ref} className="text-[12.5px] font-bold" />
              <span className="text-[14px] leading-[1.55] [text-wrap:pretty]">
                <Rich text={item.text} />
              </span>
            </span>
          ))}
        </div>
      )
    case 'box':
      return (
        <aside className="rounded-note border-2 border-ink bg-sbg px-[23px] py-[20px]">
          <span className="block text-[15.5px] font-bold leading-[1.35]">{b.title}</span>
          <span className="mt-[7px] block text-[14.5px] leading-[1.65] text-body [text-wrap:pretty]">
            <Rich text={b.text} />
          </span>
        </aside>
      )
    case 'cards':
      return (
        // by count, so a row is never left with one card: three side by side, two and four in pairs
        <div
          className={`grid gap-[13px] ${
            b.items.length === 3
              ? 'md:grid-cols-3'
              : b.items.length % 2 === 0
                ? 'sm:grid-cols-2'
                : '[grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]'
          }`}
        >
          {b.items.map((item, i) => (
            <div key={i} className="rounded-note border border-line bg-sf px-[23px] py-[22px]">
              <span className="block text-[15.5px] font-bold leading-[1.35] [text-wrap:pretty]">{item.title}</span>
              <span className="mt-[8px] block text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">
                <Rich text={item.text} />
              </span>
            </div>
          ))}
        </div>
      )
    case 'links':
      // auto-fill, not auto-fit: a section with one page keeps a card's width instead of a banner's
      return (
        <div className="grid gap-[13px] [grid-template-columns:repeat(auto-fill,minmax(min(400px,100%),1fr))]">
          {b.items.map((item) => (
            <Link
              key={item.href}
              href={item.href as Route}
              className="group flex flex-col gap-[8px] rounded-note border border-line bg-sf px-[23px] py-[22px] text-ink no-underline hover:border-ink hover:text-ink hover:no-underline"
            >
              <span className="text-[15.5px] font-bold leading-[1.35] [text-wrap:pretty] group-hover:underline">{item.title}</span>
              <span className="text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">{item.text}</span>
            </Link>
          ))}
        </div>
      )
    case 'cycle':
      return <Cycle center={b.center} items={b.items} />
    case 'hub':
      return <Hub center={b.center} items={b.items} />
    case 'ladder':
      return <Ladder items={b.items} />
    case 'timeline':
      return <Timeline items={b.items} />
    case 'plans':
      return <Plans />
    case 'shot':
      return <ProductShot id={b.id} className="my-[8px]" />
    case 'table':
      return <DataTable head={b.head} rows={b.rows} />
    case 'qps':
      return <QpsItems />
  }
}
