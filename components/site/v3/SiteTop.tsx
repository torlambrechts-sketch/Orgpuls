/** The band's bottom padding: the front page's 8px, a subpage's 56px under its hero */
const BOTTOM = { 0: 'pb-0', 8: 'pb-[8px]', 56: 'pb-[56px]' } as const

/**
 * The rest of the mint top band (D-190; nettside-v3/*.dc.html, `data-screen-label="Topp"`), holding
 * the page's hero. The layout draws the band's top with the header (`SiteHeader`, outside `<main>`);
 * a v3 page starts its `<main>` content with this, which continues the band without a seam: its
 * 18px top padding is the design's gap between the header card and the hero. The band is a column;
 * a hero places itself in it (`w-full max-w-[1240px] self-center`, as the design's hero sections do).
 *
 * The front page's sticky header holds on while this band is in view (`data-site-band`), as the
 * design's `position:sticky` inside its band does; Forside passes `bottom={8}`, the subpages keep 56.
 * With no hero yet it is the 18px gap alone.
 */
export function SiteTop({ bottom, children }: { bottom?: keyof typeof BOTTOM; children?: React.ReactNode }) {
  const pad = bottom ?? (children ? 56 : 0)
  return (
    <div data-site-band="" className={`flex flex-col bg-mint px-[18px] pt-[18px] max-sm:px-[16px] ${BOTTOM[pad]}`}>
      {children}
    </div>
  )
}
