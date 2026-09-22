import Link from 'next/link'
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ComponentProps,
  ReactNode,
} from 'react'

/**
 * Buttons in the Orgpuls bundle are not one control with one radius. Four distinct
 * sizes appear, each with its own height, padding, radius and type scale, and they are
 * used consistently enough to be a scale rather than noise. Transcribed:
 *
 *   lg     h44 · pad 0 20 · r12 · 14.5px/700   primary page CTA ("Se hele resultatet")
 *   md     h42 · pad 0 18 · r11 · 14px/600-700 page header actions ("＋ Ny måling")
 *   panel  h40 · pad 0 15-17 · r11 · 13px/600-700 panel footer ("Start neste puls nå")
 *   sm     h36 · pad 0 14-16 · r10 · 12.5px/700 row actions ("Oppdater", "Sammenlign")
 *   xs     h34 · pad 0 15 · r9  · 12.5px/700   in-card actions ("Les utkastet")
 *   act    h34 · pad 0 13 · r9  · 12px/600     table row action ("Vurder risiko", 828)
 *   xxs    h32 · pad 0 13 · r9  · 12.5px/600-700 screen-top actions ("← Målinger", 695)
 *
 * Tone:
 *   primary   #F5C64A on a #191510 hairline — the single strongest action on a screen
 *   secondary transparent on a #E8DFC9 hairline
 *   quiet     #FFFDF6 on a #191510 hairline — used inside tinted cards where a yellow
 *             fill would compete with the card itself
 *   solid     #191510 fill with #FFFDF6 text — the action on a high-risk row, where the
 *             row itself is already tinted and a hairline would disappear into it (828)
 *   ghost     transparent on a #E8DFC9 hairline with #5F5849 text — the back action at
 *             the top of the result screen (bundle line 695)
 *
 * The focus ring is not set here: globals.css applies the bundle's own
 * `3px solid #191510, offset 2px, radius 6px` to every :focus-visible control.
 *
 * Horizontal padding varies per instance in the bundle in a way the four sizes cannot
 * carry — the rounds list pairs 0/14 with 0/15 at the same height, the Deltakelse
 * footer pairs 0/15 with 0/17 — so `pad` overrides it. It is applied inline rather
 * than as a class on purpose: two arbitrary Tailwind values for the same utility
 * (`px-[16px]` and `px-[14px]`) have equal specificity, and which one wins depends on
 * the order Tailwind happens to emit them in, not on the order they appear in the
 * className. An inline style is the only reliable override.
 */
type Size = 'lg' | 'md' | 'panel' | 'sm' | 'xs' | 'act' | 'xxs'
type Tone = 'primary' | 'secondary' | 'quiet' | 'solid' | 'ghost'

/**
 * `leading-none` is part of the size, not of the base, because it is not part of every
 * instance. The bundle sets no line-height on a button, so one inherits `normal`; the
 * five sizes below were transcribed and verified with it pinned to 1, and the two that
 * the Resultat screen adds were measured against the baseline without it. Changing
 * either way moves text by a pixel, which the gate sees.
 */
const SIZE: Record<Size, string> = {
  lg: 'h-[44px] px-[20px] rounded-cta text-[14.5px] leading-none',
  md: 'h-[42px] px-[18px] rounded-btn text-[14px] leading-none',
  panel: 'h-[40px] px-[17px] rounded-btn text-[13px] leading-none',
  sm: 'h-[36px] px-[16px] rounded-ctl text-[12.5px] leading-none',
  xs: 'h-[34px] px-[15px] rounded-bar text-[12.5px] leading-none',
  act: 'h-[34px] px-[13px] rounded-bar text-[12px]',
  xxs: 'h-[32px] px-[13px] rounded-bar text-[12.5px]',
}

const TONE: Record<Tone, string> = {
  primary: 'border border-ink bg-ac text-ink font-bold',
  secondary: 'border border-line bg-transparent text-ink font-semibold',
  quiet: 'border border-ink bg-sf text-ink font-bold',
  solid: 'border border-ink bg-ink text-sf font-semibold',
  ghost: 'border border-line bg-transparent text-mut font-semibold',
}

const BASE =
  'inline-flex flex-none items-center justify-center whitespace-nowrap cursor-pointer'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: Size
  tone?: Tone
  /** Horizontal padding in px, when the bundle's instance differs from the size. */
  pad?: number
  children: ReactNode
}

export function Button({
  size = 'md',
  tone = 'primary',
  pad,
  className = '',
  style,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`${BASE} ${SIZE[size]} ${TONE[tone]} ${className}`}
      style={pad === undefined ? style : { paddingInline: `${pad}px`, ...style }}
      {...rest}
    >
      {children}
    </button>
  )
}

/**
 * The same control as a link.
 *
 * This is the control substitution CLAUDE.md permits and D-06 records: the bundle uses
 * `<button onClick>` for anything that changes the screen, because a prototype has no
 * router. Where the target is a real address — the result of a round, the way back to
 * Målinger — the honest control is a link, so middle-click, back and a screen reader's
 * link list work. It is the button's own styling, pixel for pixel.
 *
 * The two hover overrides are not decoration: globals.css gives every anchor the green
 * link colour and an underline on hover, at a specificity that beats a plain utility.
 * Without them a link styled as a button would turn green under the cursor and the
 * rendering would stop matching the bundle. Same reasoning as AppNav.
 */
export interface ButtonLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  /** Anything next/link accepts: a typed route, or a route with a query. */
  href: ComponentProps<typeof Link>['href']
  size?: Size
  tone?: Tone
  pad?: number
  children: ReactNode
}

export function ButtonLink({
  href,
  size = 'md',
  tone = 'primary',
  pad,
  className = '',
  style,
  children,
  ...rest
}: ButtonLinkProps) {
  const hover = tone === 'ghost' ? 'hover:text-mut' : tone === 'solid' ? 'hover:text-sf' : 'hover:text-ink'
  return (
    <Link
      href={href}
      className={`${BASE} ${SIZE[size]} ${TONE[tone]} no-underline hover:no-underline ${hover} ${className}`}
      style={pad === undefined ? style : { paddingInline: `${pad}px`, ...style }}
      {...rest}
    >
      {children}
    </Link>
  )
}
