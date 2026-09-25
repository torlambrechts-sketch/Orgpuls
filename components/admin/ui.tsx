import type { Route } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * The admin's few shapes (D-90). It is an internal tool, in English, drawn with the product's
 * own tokens so it reads as Orgpuls, but without the product's design to match: plain cards,
 * tables and badges.
 */
export function PageHead({ title, lead, children }: { title: string; lead?: string; children?: ReactNode }) {
  return (
    <div className="mb-[20px] flex flex-wrap items-end justify-between gap-[14px]">
      <div className="min-w-0">
        <h1 className="m-0 font-display text-[28px] font-semibold leading-[1.1]">{title}</h1>
        {lead ? <p className="mb-0 mt-[6px] max-w-[70ch] text-[13.5px] leading-[1.55] text-mut">{lead}</p> : null}
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
    <section className={`rounded-panel border border-line bg-sf px-[20px] py-[18px] ${className}`}>
      {title || aside ? (
        <div className="mb-[12px] flex flex-wrap items-baseline justify-between gap-[10px]">
          {title ? <h2 className="m-0 text-[15px] font-bold">{title}</h2> : <span />}
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-panel border border-line bg-sf px-[18px] py-[16px]">
      <span className="block text-[11px] uppercase tracking-[0.1em] text-mut">{label}</span>
      <span className="mt-[6px] block font-display text-[28px] font-semibold leading-none">{value}</span>
      {hint ? <span className="mt-[6px] block text-[12px] text-mut">{hint}</span> : null}
    </div>
  )
}

const TONES = {
  green: 'bg-mint text-greendeep',
  yellow: 'bg-sbg text-cautiondeep',
  red: 'bg-peach text-dangerdeep',
  grey: 'bg-track text-mut',
  ink: 'bg-ink text-bg',
} as const
export type BadgeTone = keyof typeof TONES
export function Badge({ tone = 'grey', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-pill px-[9px] py-[3px] text-[11px] font-bold ${TONES[tone]}`}>
      {children}
    </span>
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
                className="whitespace-nowrap border-b border-line px-[10px] py-[8px] text-[11px] font-bold uppercase tracking-[0.06em] text-mut"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty ? <p className="m-0 px-[10px] py-[14px] text-[13px] text-mut">{empty}</p> : null}
    </div>
  )
}

/** Cells hold figures and short codes, so they do not wrap; `wrap` is for the prose ones. */
export function Td({ children, className = '', wrap = false }: { children: ReactNode; className?: string; wrap?: boolean }) {
  return (
    <td className={`border-b border-line px-[10px] py-[9px] align-top ${wrap ? '' : 'whitespace-nowrap'} ${className}`}>
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
