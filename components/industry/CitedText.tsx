import { Fragment } from 'react'
import { splitCites } from '@/content/industries/cites'

/**
 * Text with {{cite:key}} tokens, drawn with superscript links to the page's source list
 * (#k-<key>). Adjacent citations share one superscript: "1,2". Numbers are the page's own
 * (citeOrder), so they follow reading order.
 */
export function CitedText({
  text,
  numbers,
  titles,
}: {
  text: string
  numbers: Map<string, number>
  titles: Map<string, string>
}) {
  return (
    <>
      {splitCites(text).map((s, i) =>
        'text' in s ? (
          <Fragment key={i}>{s.text}</Fragment>
        ) : (
          <sup key={i} className="leading-none">
            {s.cites.map((k, j) => (
              <Fragment key={k}>
                {j ? ',' : null}
                <a
                  href={`#k-${k}`}
                  title={titles.get(k)}
                  className="px-[1px] text-[11px] font-bold no-underline hover:underline"
                >
                  {numbers.get(k)}
                </a>
              </Fragment>
            ))}
          </sup>
        ),
      )}
    </>
  )
}
