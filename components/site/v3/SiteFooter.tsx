'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useId } from 'react'
import { footerFor, isV3Route, type FooterId } from '@/lib/site/nav'

export type FooterData = Record<FooterId, { head: string; links: { label: string; href?: string }[] }[]>

/** Pages whose last section carries its own space below it, so the footer adds none */
const ENDS_IN_SPACE = ['/hvorfor']

/**
 * The public footer (D-190; nettside-v3/*.dc.html, the `<footer>`): «Orgpuls» and one sentence,
 * then four columns of links, then one line.
 *
 * Each page gets the columns its design draws (lib/site/nav `footerFor`), which is why this reads
 * the path; so does the grid's minimum column, 180px on the front page and 170px on the subpages,
 * as each design sets it. The columns are one «Bunnmeny» navigation, a list per column named by its
 * eyebrow (G-23), and a link row is 18px tall, so links sit 24px apart (G-24, one pixel more than
 * drawn). The bottom line's right end holds the language switch, which the design does not draw.
 */
export function SiteFooter({
  columns,
  label,
  about,
  bottom,
  language,
}: {
  columns: FooterData
  /** the navigation's name, «Bunnmeny» */
  label: string
  about: string
  bottom: React.ReactNode
  language: React.ReactNode
}) {
  const pathname = usePathname()
  const id = footerFor(pathname)
  const uid = useId()
  const gap = isV3Route(pathname) || ENDS_IN_SPACE.includes(pathname) ? '' : 'mt-[54px]'

  return (
    <footer className={`border-t border-line bg-sf ${gap}`}>
      <nav
        aria-label={label}
        className={`mx-auto grid max-w-[1120px] gap-[24px] px-[26px] py-[36px] max-sm:px-[16px] ${
          id === 'home' ? '[grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]' : '[grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]'
        }`}
      >
        <div>
          <span className="font-display text-[19px] font-semibold">Orgpuls</span>
          <p className="m-0 mt-[8px] max-w-[28ch] text-[12.5px] leading-[1.6] text-mut">{about}</p>
        </div>
        {columns[id].map((c, n) => (
          <div key={c.head}>
            <span id={`${uid}-${n}`} className="block text-[11px] font-bold uppercase tracking-[0.1em] text-mut">
              {c.head}
            </span>
            <ul aria-labelledby={`${uid}-${n}`} className="m-0 mt-[10px] flex list-none flex-col gap-[6px] p-0">
              {c.links.map((l) => (
                <li key={l.label} className="text-[13px] leading-[18px] text-ink">
                  {l.href ? (
                    <Link href={l.href as Route} className="text-ink hover:text-ink">
                      {l.label}
                    </Link>
                  ) : (
                    l.label
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-x-[18px] gap-y-[8px] px-[26px] pb-[22px] text-[11.5px] text-mut max-sm:px-[16px]">
        <span>{bottom}</span>
        {language}
      </div>
    </footer>
  )
}
