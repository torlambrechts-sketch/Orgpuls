'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { FooterId } from '@/lib/site/nav'

export type FooterData = Record<FooterId, { head: string; links: { label: string; href?: string }[] }[]>

/**
 * The public footer (D-88; nettside/*.dc.html, the `<footer>`): the name and one sentence,
 * then four columns of links, then one line.
 *
 * Each page the design draws gets the footer it draws (lib/site/nav), which is why this
 * reads the path. Those pages end in a section that carries its own 72px of space; every
 * other public page ends in something that does not, so the footer keeps the 54px it had.
 */
export function SiteFooter({
  columns,
  designed,
  about,
  bottom,
}: {
  columns: FooterData
  designed: Record<string, FooterId>
  about: string
  bottom: React.ReactNode
}) {
  const pathname = usePathname()
  const id = designed[pathname] ?? 'second'

  return (
    <footer className={`border-t border-line bg-sf ${pathname in designed ? '' : 'mt-[54px]'}`}>
      <div className="mx-auto grid max-w-[1120px] gap-[24px] px-[26px] py-[36px] [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        <div>
          <span className="font-display text-[19px] font-semibold">Orgpuls</span>
          <p className="m-0 mt-[8px] max-w-[26ch] text-[12.5px] leading-[1.6] text-mut">{about}</p>
        </div>
        {columns[id].map((c) => (
          <nav key={c.head} aria-label={c.head}>
            <span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-mut">{c.head}</span>
            <span className="mt-[10px] flex flex-col gap-[6px] max-lg:gap-0">
              {c.links.map((l) =>
                l.href ? (
                  <Link
                    key={l.label}
                    href={l.href as Route}
                    className="text-[13px] text-ink hover:text-ink max-lg:inline-flex max-lg:min-h-[44px] max-lg:items-center"
                  >
                    {l.label}
                  </Link>
                ) : (
                  <span key={l.label} className="text-[13px] text-ink max-lg:inline-flex max-lg:min-h-[44px] max-lg:items-center">
                    {l.label}
                  </span>
                ),
              )}
            </span>
          </nav>
        ))}
      </div>
      <div className="mx-auto max-w-[1120px] px-[26px] pb-[22px] text-[11.5px] text-mut">{bottom}</div>
    </footer>
  )
}
