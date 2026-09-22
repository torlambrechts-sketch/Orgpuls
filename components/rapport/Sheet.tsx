import type { ReactNode } from 'react'

/**
 * The printable sheet — the bundle's `<doc-page margin="0.85in">`, transcribed.
 *
 * `doc-page.js` is a web component the prototype loads; its screen rendering is a desk
 * background with one tall sheet on it, and its print rendering drops the desk, the
 * shadow and the radius and lets the browser paginate the flow. Recreating the
 * rendering rather than shipping the component is the same rule the rest of the
 * application follows — and the component carries a print pipeline (running headers,
 * `@page` injection, scaled-fit modes) that this document does not use.
 *
 * Values transcribed from doc-page.js lines 177-207 and the bundle's own attribute:
 *   desk    #f5f5f4, padding 48px 24px, min-height 100vh
 *   sheet   8.5in wide, #fff, radius 7px, shadow 0 2px 10px rgba(20,20,19,.12)
 *   margin  0.85in — the sheet's padding, from `margin="0.85in"` on the element
 *
 * The footer renders inside the sheet, below the flow, where the component's `tfoot`
 * spacer puts it on screen. In print it repeats per page in the component; here it is
 * printed once, at the end, because a running footer needs the table-frame machinery
 * this deliberately does not reproduce. Logged as a deviation.
 */
export function Sheet({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="doc-desk min-h-screen bg-[#f5f5f4] px-[24px] py-[48px]">
      <div
        className="doc-sheet mx-auto box-border w-[8.5in] rounded-[7px] bg-white p-[0.85in]"
        style={{ boxShadow: '0 2px 10px rgba(20, 20, 19, 0.12)' }}
      >
        <div className="font-sans text-ink">{children}</div>
        {footer ? (
          <div className="mt-[8px] flex justify-between gap-[16px] border-t border-line pt-[8px] font-sans text-[10px] text-mut">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
