import type { Route } from 'next'
import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'

/**
 * A message's two inline marks, `**bold**` and `[label](href)`, as React nodes. Nothing else
 * is interpreted, and nothing becomes HTML: the text stays text. An internal href is a
 * `Link`; an external one opens in a new tab and says nothing about where it came from.
 * A link in running text is underlined, so it is told apart from the words around it by
 * more than its colour.
 */
const INLINE = 'underline decoration-[1px] underline-offset-[3px]'
const MARK = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g

export function Rich({ text }: { text: string }) {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(MARK)) {
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    if (m[1] !== undefined) {
      out.push(
        <strong key={at} className="font-semibold text-ink">
          {m[1]}
        </strong>,
      )
    } else {
      const [label, href] = [m[2] as string, m[3] as string]
      out.push(
        href.startsWith('/') ? (
          <Link key={at} href={href as Route} className={INLINE}>
            {label}
          </Link>
        ) : href.startsWith('mailto:') ? (
          <a key={at} href={href} className={INLINE}>
            {label}
          </a>
        ) : (
          <a key={at} href={href} target="_blank" rel="noopener noreferrer" className={INLINE}>
            {label}
          </a>
        ),
      )
    }
    last = at + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <Fragment>{out}</Fragment>
}
