import type { HTMLAttributes, ReactNode } from 'react'

/**
 * The panel card: padding 26px, radius 20px, 1px #E8DFC9 hairline on #FFFDF6.
 * Bundle line 176. This is the container almost every screen is built from.
 */
export function Card({
  className = '',
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={`rounded-card border border-line bg-sf p-[26px] ${className}`} {...rest}>
      {children}
    </div>
  )
}

/**
 * The assistant note: radius 16, padding 16px 18px, on the soft yellow #FBEBBE.
 * Bundle line 203. Distinct from Card on purpose — it is a different radius and a
 * different fill, and the design uses that difference to mark it as Tuva speaking.
 */
export function NoteCard({
  className = '',
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={`rounded-note bg-sbg px-[18px] py-[16px] ${className}`} {...rest}>
      {children}
    </div>
  )
}

/**
 * A worklist row: radius 15, padding 15px 18px, hairline on #FFFDF6, with a
 * full-height tone stripe down the left edge. Bundle lines 224-225.
 */
export function Row({
  tone,
  className = '',
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { tone?: string; children: ReactNode }) {
  return (
    <div
      className={`flex items-center gap-[14px] rounded-row border border-line bg-sf px-[18px] py-[15px] ${className}`}
      {...rest}
    >
      {tone ? (
        <span
          aria-hidden="true"
          className="min-h-[38px] w-[7px] flex-none self-stretch rounded-pill"
          style={{ background: tone }}
        />
      ) : null}
      {children}
    </div>
  )
}
