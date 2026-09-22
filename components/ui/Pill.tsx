import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * The filter/tab pill: padding 7px 14px, fully round, 12.5px.
 * Selected   -> #FFFDF6 fill, #191510 border, weight 700
 * Unselected -> transparent,   #C4BCA8 border, weight 500
 * Bundle line 84-90. The weight change is part of the selected state, not decoration:
 * it is what makes the active filter readable at a glance in a long row of them.
 */
export function Pill({
  selected = false,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; children: ReactNode }) {
  const tone = selected
    ? 'border-ink bg-sf font-bold'
    : 'border-rule bg-transparent font-medium'
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`inline-flex flex-none items-center rounded-pill border px-[14px] py-[7px] text-[12.5px] leading-none text-ink cursor-pointer ${tone} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
