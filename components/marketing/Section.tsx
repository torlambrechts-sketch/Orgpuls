/**
 * A band of the public site (docs/landingsside-gjennomgang.md 4.1-4.3, D-86): the background
 * runs the full width of the window, the content sits in one container — 1280 px at most,
 * with 24, 32 and 48 px margins — and bands alternate between the page's base and its
 * surface, so the page reads as sections without drawing a frame round each.
 *
 * `narrow` marks a band whose content is deliberately narrow; the layout test
 * (tests/landing-layout.spec.ts) leaves it out, and the review report says why.
 */
export function Section({
  tone = 'base',
  narrow = false,
  id,
  label,
  className = '',
  children,
}: {
  tone?: 'base' | 'surface'
  narrow?: boolean
  id?: string
  /** the id of the heading that names the band */
  label?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={label}
      data-layout={narrow ? 'narrow' : undefined}
      className={`w-full py-16 lg:py-24 ${tone === 'surface' ? 'bg-sf' : 'bg-bg'} ${className}`}
    >
      <Container>{children}</Container>
    </section>
  )
}

/** The site's one content container; the header and the footer use it too, so edges line up. */
export function Container({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl px-6 md:px-8 lg:px-12 ${className}`}>{children}</div>
}

/** A small label over a heading: sentence case, not capitals (the guide, 3). */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-mk-small font-semibold text-mut">{children}</p>
}

/** A band's heading in the site's H2 size. */
export function H2({ id, children, className = '' }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <h2
      id={id}
      className={`m-0 mt-2 font-display text-mk-h2 font-semibold [hyphens:auto] [overflow-wrap:break-word] [text-wrap:balance] ${className}`}
    >
      {children}
    </h2>
  )
}
