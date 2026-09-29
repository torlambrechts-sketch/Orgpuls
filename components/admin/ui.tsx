import type { Route } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * The admin's shapes, as the Sentral design draws them (X-095; D-90 before it): the page head with
 * its one primary action, panels at radius 18, KPI cards, status pills with a coloured dot, tables
 * with small-caps headings, segmented filters with counts, initials avatars and progress bars. In
 * English, with the product's own tokens.
 */
export function PageHead({ title, lead, children }: { title: string; lead?: string; children?: ReactNode }) {
  return (
    <div className="mb-[22px] flex flex-wrap items-end justify-between gap-[16px] md:px-[18px]">
      <div className="min-w-0">
        <h1 className="m-0 font-display text-[28px] font-medium leading-[1.15] [text-wrap:balance]">{title}</h1>
        {lead ? <p className="mb-0 mt-[6px] max-w-[80ch] text-[13px] leading-[1.55] text-mut">{lead}</p> : null}
      </div>
      {children}
    </div>
  )
}

export function Card({
  title,
  children,
  className = '',
  aside,
}: {
  title?: string
  children: ReactNode
  className?: string
  aside?: ReactNode
}) {
  return (
    <section className={`rounded-panel border border-line bg-sf px-[20px] py-[20px] md:px-[26px] md:py-[24px] ${className}`}>
      {title || aside ? (
        <div className="mb-[16px] flex flex-wrap items-baseline justify-between gap-[12px]">
          {title ? <h2 className="m-0 font-display text-[22px] font-medium leading-[1.2]">{title}</h2> : <span />}
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-panel border border-line bg-sf px-[22px] py-[20px]">
      <span className="block text-[11px] uppercase tracking-[0.09em] text-mut">{label}</span>
      <span className="mt-[8px] block text-[30px] font-bold leading-[1.15]">{value}</span>
      {hint ? <span className="mt-[4px] block text-[12.5px] text-mut">{hint}</span> : null}
    </div>
  )
}

/** a status is a pill with a dot; the dot's colour is the state (the design's `dot()`) */
const DOTS = {
  green: 'bg-teal',
  yellow: 'bg-ac',
  red: 'bg-peach',
  grey: 'bg-mut',
  ink: 'bg-ink',
} as const
export type BadgeTone = keyof typeof DOTS
export function Badge({ tone = 'grey', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-[6px] whitespace-nowrap rounded-pill bg-sbg px-[11px] py-[5px] text-[11.5px] font-bold leading-none text-ink">
      <span aria-hidden="true" className={`block h-[6px] w-[6px] flex-none rounded-pill ${DOTS[tone]}`} />
      {children}
    </span>
  )
}

/** Initials in a round tile, the name in its title */
export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const ini =
    name
      .split(/[\s._@-]+/)
      .filter(Boolean)
      .map((w) => w[0]!.toUpperCase())
      .slice(0, 2)
      .join('') || '·'
  return (
    <span title={name} className="inline-flex flex-none items-center justify-center rounded-pill bg-sbg text-[11px] font-bold text-ink" style={{ width: size, height: size }}>
      <span aria-hidden="true">{ini}</span>
      <span className="sr-only">{name}</span>
    </span>
  )
}

/** A share of a whole, as the design draws seats and coverage: the bar, then the figure */
export function Bar({ value, max, label }: { value: number; max: number; label?: ReactNode }) {
  const pct = max > 0 ? Math.min(100, Math.round((100 * value) / max)) : 0
  return (
    <span className="flex min-w-0 items-center gap-[10px]">
      <span className="block h-[8px] min-w-[60px] flex-1 overflow-hidden rounded-pill bg-ink/10">
        <span className="block h-full rounded-pill bg-ac" style={{ width: `${pct}%` }} />
      </span>
      {label ?? null}
    </span>
  )
}

/** Segmented filter with counts: each segment an address, so a filter can be linked and kept */
export function Segments({ items, label }: { items: { key: string; label: string; n?: number; href: string; on: boolean }[]; label: string }) {
  return (
    <nav aria-label={label} className="inline-flex flex-wrap gap-[3px] rounded-[11px] bg-ink/5 p-[4px]">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href as Route}
          aria-current={i.on ? 'page' : undefined}
          className={`flex items-center gap-[6px] rounded-[8px] px-[12px] py-[7px] text-[12px] font-semibold text-ink no-underline hover:no-underline ${i.on ? 'bg-sf' : ''}`}
        >
          {i.label}
          {i.n === undefined ? null : <span className="font-medium text-mut">{i.n}</span>}
        </Link>
      ))}
    </nav>
  )
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: string }) {
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={head.join(', ')}>
      <table className="w-full border-collapse text-left text-[13px]">
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="whitespace-nowrap border-b border-line px-[12px] py-[10px] text-[11px] font-normal uppercase tracking-[0.09em] text-mut"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty ? <p className="m-0 px-[12px] py-[16px] text-[13px] text-mut">{empty}</p> : null}
    </div>
  )
}

/** Cells hold figures and short codes, so they do not wrap; `wrap` is for the prose ones. */
export function Td({ children, className = '', wrap = false }: { children: ReactNode; className?: string; wrap?: boolean }) {
  return (
    <td className={`border-b border-line px-[12px] py-[12px] align-top ${wrap ? '' : 'whitespace-nowrap'} ${className}`}>
      {children}
    </td>
  )
}

export function ALink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href as Route} className="font-semibold text-link">
      {children}
    </Link>
  )
}

export function Problem({ text }: { text: string }) {
  return (
    <p
      role="alert"
      className="m-0 rounded-panel border border-line bg-peach px-[16px] py-[12px] text-[13.5px] font-semibold text-dangerdeep"
    >
      {text}
    </p>
  )
}

const fmt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Europe/Oslo' })
const fmtTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Oslo' })
export const day = (iso: string | null | undefined) => (iso ? fmt.format(new Date(iso)) : '—')
export const when = (iso: string | null | undefined) => (iso ? fmtTime.format(new Date(iso)) : '—')
export const nok = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `NOK ${n.toLocaleString('en-GB')}`)
export const pct = (a: number | null | undefined, b: number | null | undefined) =>
  a === null || a === undefined || !b ? '—' : `${Math.round((100 * a) / b)} %`

/**
 * The design's buttons, as classes so a link and a button look alike: the page's one primary action
 * (yellow), the modal's confirm (ink), a secondary (outlined) and a row's small action.
 */
export const BTN = {
  primary:
    'inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-ctl border-0 bg-ac px-[18px] py-[10px] text-[13.5px] font-bold text-ink no-underline hover:text-ink hover:no-underline disabled:cursor-default disabled:opacity-60',
  dark: 'inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-ctl border-0 bg-ink px-[18px] py-[10px] text-[13.5px] font-bold text-sf no-underline hover:text-sf hover:no-underline disabled:cursor-default disabled:opacity-60',
  secondary:
    'inline-flex cursor-pointer items-center justify-center gap-[8px] whitespace-nowrap rounded-ctl border border-line bg-transparent px-[15px] py-[9px] text-[12.5px] font-semibold text-ink no-underline hover:bg-ink/5 hover:text-ink hover:no-underline',
  row: 'inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-bar border border-line bg-transparent px-[12px] py-[7px] text-[12px] font-semibold text-ink no-underline hover:bg-ink/5 hover:text-ink hover:no-underline',
} as const

/** A field's label as the design's forms draw it: small capitals above the control */
export const FIELD_LABEL = 'mb-[8px] block text-[11px] uppercase tracking-[0.09em] text-mut'
export const FIELD =
  'box-border w-full max-w-full rounded-ctl border border-line bg-sf px-[13px] py-[10px] text-[13px] text-ink outline-none focus-visible:border-ink'
