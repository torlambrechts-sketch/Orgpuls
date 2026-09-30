import type { ReactNode } from 'react'
import { DOT_CLASS, type DotTone } from '@/lib/admin/dots'
import { initialsOf } from '@/lib/admin/growthMath'

/**
 * The shapes design revision 3 of Sentral repeats across Growth, Consent, Brønnøysund triggers,
 * Partners, Tools & lead magnets and Deliverability (D-181), transcribed from the design's markup
 * (Sentral_Admin.dc.html, the views from `isGboard` to `isDeliverability`):
 *
 *   KpiStrip        the row of KPI cards (Live · Building · Planned · Week); the card itself is
 *                   ui.tsx's `Stat`, which already matches the design's card to the pixel
 *   StatusChip      a pill on the soft yellow with a 6 px dot, the dot's colour from lib/admin/dots;
 *                   sizes 4 × 10 at 11 and 11.5, 3 × 8 at 10.5 and 11, 5 × 11 at 11.5 (CHIP_SIZE)
 *   TierColumn      a column of the board: its name, count and why over a rule, then its cards
 *   BoardCard       a board item: rank, name, why, and a footer of status, effort and owner
 *   BulletRow       a line with a dot before it: a gate, an assumption, a firewall check
 *   BenchmarkRow    a labelled figure with its source under it
 *   SectionCard     a panel with a Playfair heading and a sub-line, padded or with flush rows
 *   PhaseEmpty      the design's empty treatment: a dashed panel with a line and a sentence
 *
 * The design sets its root's line-height to 1.5 and the product's is `normal` (globals.css), so
 * every shape here sets 1.5 where the design inherits it. None carries an outer margin: the design
 * spaces a block by where it sits (22 px under the head or a KPI row, 18 px between panels), so the
 * page does.
 */

const CHIP_SIZE = {
  // the board, the plan, rules, experiments, risks, coverage
  sm: 'px-[10px] py-[4px] text-[11px]',
  // a customer's health score in the lowest-first list
  md: 'px-[10px] py-[4px] text-[11.5px]',
  // a recommendation's priority
  xs: 'px-[8px] py-[3px] text-[10.5px]',
  // a task's 1-hour SLA under its due time
  sla: 'px-[8px] py-[3px] text-[11px]',
  // the design's common status pill (consent, partners, magnets, deliverability), as ui.tsx's Badge
  lg: 'px-[11px] py-[5px] text-[11.5px]',
} as const

export function StatusChip({
  tone,
  children,
  size = 'sm',
  outline = false,
  inButton = false,
  className = '',
}: {
  tone: DotTone
  children: ReactNode
  size?: keyof typeof CHIP_SIZE
  /**
   * the header's «Dry run» chip: a hairline border and no fill. It is a sentence in the design and
   * wraps there (no nowrap) inside a sub-line that wraps too, so it may wrap here: at 390 px a
   * nowrap chip that long would push the page sideways
   */
  outline?: boolean
  /** inside a design `<button>`, whose UA font resets the line-height to normal (the lowest-first list) */
  inButton?: boolean
  /** where the design puts a margin on the chip itself (the plan's «mt 6» under the weeks) */
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-[6px] rounded-pill font-bold text-ink ${inButton ? 'leading-[normal]' : 'leading-[1.5]'} ${CHIP_SIZE[size]} ${outline ? 'border border-line' : 'whitespace-nowrap bg-sbg'} ${className}`}
    >
      <span aria-hidden="true" className={`block h-[6px] w-[6px] flex-none rounded-pill ${DOT_CLASS[tone]}`} />
      {children}
    </span>
  )
}

/** The KPI cards' row: as many as fit at 200 px (240 px for the guardrails), 16 px apart */
export function KpiStrip({ children, min = 200, className = '' }: { children: ReactNode; min?: 200 | 240; className?: string }) {
  return (
    <div
      className={`grid gap-[16px] leading-[1.5] ${className} ${min === 240 ? '[grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]' : '[grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]'}`}
    >
      {children}
    </div>
  )
}

/**
 * The board's column templates, one per tier count, spelled out so Tailwind emits each (no inline
 * style). The design draws five tiers; the others are there for a registry with fewer or more.
 */
const BOARD_COLUMNS = {
  3: '[grid-template-columns:repeat(3,minmax(230px,1fr))]',
  4: '[grid-template-columns:repeat(4,minmax(230px,1fr))]',
  5: '[grid-template-columns:repeat(5,minmax(230px,1fr))]',
  6: '[grid-template-columns:repeat(6,minmax(230px,1fr))]',
} as const

/** The board: one column per tier, side by side, scrolling sideways below 1180 px */
export function Board({ columns, children, className = '' }: { columns: keyof typeof BOARD_COLUMNS; children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto pb-[6px] leading-[1.5] ${className}`}>
      <div className={`grid min-w-[1180px] gap-[14px] ${BOARD_COLUMNS[columns]}`}>
        {children}
      </div>
    </div>
  )
}

export function TierColumn({ name, count, why, children }: { name: string; count: ReactNode; why: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-[10px]">
      <div className="border-b border-line px-[4px] pb-[8px]">
        <div className="flex items-center gap-[8px]">
          <h2 className="m-0 flex-1 text-[13.5px] font-bold leading-[1.5]">{name}</h2>
          <span className="text-[12px] text-mut">{count}</span>
        </div>
        <div className="mt-[2px] text-[12px] text-mut">{why}</div>
      </div>
      {children}
    </section>
  )
}

/** Initials in a 24 px round tile, the admin's address in its title, as the board's owner */
function Owner({ email }: { email: string }) {
  return (
    <span title={email} className="flex h-[24px] w-[24px] flex-none items-center justify-center rounded-pill bg-sbg text-[10.5px] font-bold">
      <span aria-hidden="true">{initialsOf(email)}</span>
      <span className="sr-only">{email}</span>
    </span>
  )
}

/**
 * A board item, as the design draws it: a `<button>` that opens the item's card (build, KPI,
 * guardrail). A button's UA line-height is normal, and the design's rank and footer inherit it, so
 * the card sets it too (the product's reset makes a button inherit instead).
 */
export function BoardCard({
  rank,
  name,
  why,
  status,
  meta,
  owner,
  onOpen,
}: {
  rank: string
  name: string
  why: string
  status: { tone: DotTone; label: string }
  meta: string
  /** the owning admin's address; the avatar shows only when one is set */
  owner: string | null
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className="flex w-full cursor-pointer flex-col gap-[8px] rounded-cta border border-line bg-sf px-[16px] py-[14px] text-left leading-[normal] text-ink hover:border-ink"
    >
      <span className="block text-[11px] text-mut">{rank}</span>
      <span className="block text-[14px] font-semibold leading-[1.3] [text-wrap:pretty]">{name}</span>
      <span className="block text-[12.5px] leading-[1.45] text-mut [text-wrap:pretty]">{why}</span>
      <span className="mt-[2px] flex w-full items-center justify-between gap-[8px] border-t border-line pt-[8px]">
        <StatusChip tone={status.tone} inButton>
          {status.label}
        </StatusChip>
        <span className="text-[11.5px] text-mut">{meta}</span>
        {owner ? <Owner email={owner} /> : <span className="h-[24px] w-[24px] flex-none" />}
      </span>
    </button>
  )
}

/**
 * A line with a dot before it: a gate (line), an assumption (yellow), a firewall check (teal), a cut
 * (mut). `pretty` only for the firewall's checks: the design sets text-wrap: pretty on those rows
 * and on no other, so the gates, assumptions and cuts wrap plainly.
 */
export function BulletRow({ tone, children, small = false, pretty = false }: { tone: DotTone; children: ReactNode; small?: boolean; pretty?: boolean }) {
  return (
    <div className={`flex gap-[8px] leading-[1.45] ${pretty ? '[text-wrap:pretty]' : ''} ${small ? 'text-[12.5px]' : 'text-[13px]'}`}>
      <span aria-hidden="true" className={`mt-[6px] block h-[6px] w-[6px] flex-none rounded-pill ${DOT_CLASS[tone]}`} />
      <span className="min-w-0">{children}</span>
    </div>
  )
}

/** A benchmark as the funnel labels it: the metric, its figure on the right, its source under it */
export function BenchmarkRow({ metric, value, source }: { metric: string; value: string; source: string }) {
  return (
    <div className="border-b border-line py-[10px] text-[13px] leading-[1.5]">
      <div className="flex justify-between gap-[10px]">
        <span className="font-semibold">{metric}</span>
        <span className="text-right">{value}</span>
      </div>
      <div className="mt-[2px] text-[11.5px] text-mut">{source}</div>
    </div>
  )
}

/**
 * A panel with a heading. Padded (24 × 26) for prose and lists of lines; `flush` for a panel whose
 * rows run edge to edge under a head padded 20 px, as the lead math and the open decisions are.
 * `dashed` is the «Cut or deferred» panel: a dashed hairline on the canvas colour.
 */
export function SectionCard({
  title,
  sub,
  aside,
  flush = false,
  dashed = false,
  children,
}: {
  title: string
  sub?: ReactNode
  aside?: ReactNode
  flush?: boolean
  dashed?: boolean
  children?: ReactNode
}) {
  const head = (
    <>
      <div className={aside ? 'flex items-baseline justify-between gap-[12px]' : ''}>
        <h2 className="m-0 font-display text-[22px] font-medium">{title}</h2>
        {aside}
      </div>
      {sub ? <div className="mt-[4px] text-[12.5px] text-mut">{sub}</div> : null}
    </>
  )
  const frame = `min-w-0 rounded-panel border border-line leading-[1.5] ${dashed ? 'border-dashed bg-bg' : 'bg-sf'}`
  return flush ? (
    <section className={frame}>
      <div className="px-[20px] pt-[20px]">{head}</div>
      {children}
    </section>
  ) : (
    <section className={`${frame} px-[20px] py-[20px] md:px-[26px] md:py-[24px]`}>
      {head}
      {children}
    </section>
  )
}

/** The design's empty treatment (`isSiteEmpty`): a dashed panel, one line and one sentence, nothing that reads as data */
export function PhaseEmpty({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className="rounded-panel border border-dashed border-line bg-bg px-[20px] py-[44px] text-center leading-[1.5] md:px-[32px]">
      <div className="text-[15px] font-semibold">{title}</div>
      <div className="mx-auto mt-[6px] max-w-[520px] text-[13px] text-mut [text-wrap:pretty]">{text}</div>
      {children ? <div className="mt-[18px]">{children}</div> : null}
    </div>
  )
}

/**
 * «Export board», «Export plan», «Export review»: the design's outlined ink button, here a link to the
 * CSV route (app/(admin)/admin/growth/export), which is navigation, not an action on the page (D-06).
 * A plain anchor, so nothing prefetches an audited export.
 */
export function ExportButton({ kind, label }: { kind: 'board' | 'plan' | 'review'; label: string }) {
  return (
    <a
      href={`/admin/growth/export?kind=${kind}`}
      download
      className="inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-ctl border border-ink bg-transparent px-[15px] py-[9px] text-[12.5px] font-semibold leading-[normal] text-ink no-underline hover:bg-ink/5 hover:text-ink hover:no-underline"
    >
      {label}
    </a>
  )
}
