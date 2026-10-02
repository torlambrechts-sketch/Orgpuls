import { getTranslations } from 'next-intl/server'
import { OrgStart } from '../OrgStart'

/**
 * «Prøv det på deres egen virksomhet» (D-190; nettside-v3/*.dc.html, `#kom-i-gang`): the band the
 * v3 pages end their `<main>` with, above the footer, and the target of every «Prøv gratis» on the
 * page. The front page's version (`variant="front"`) has 40px above it instead of 56 and one
 * sentence more in its paragraph, as Forside draws it.
 *
 * Desktop is the design's. Below 640px (decision sheet G4.2) the section keeps 16px to the screen's
 * edge and 40/32px above and below, the card pads 24px 18px and the heading is 28px. The form is
 * OrgStart, stacked: the field fills its row and the button goes under it, as the design's
 * full-width field puts it. Unlike the design, the field has a visible label and the format as its
 * placeholder, 16px text and a darker border (D-187, G-12), and the button says «Prøv gratis» (G1).
 */
export async function StartBand({ variant = 'page' }: { variant?: 'front' | 'page' }) {
  const t = await getTranslations('site.chrome')
  const front = variant === 'front'
  return (
    <section
      id="kom-i-gang"
      data-screen-label="Kom i gang"
      className={`mx-auto w-full max-w-[1240px] px-[56px] max-sm:px-[16px] ${
        front ? 'pb-[56px] pt-[40px] max-sm:pb-[40px] max-sm:pt-[32px]' : 'py-[56px] max-sm:py-[40px]'
      }`}
    >
      <div className="grid items-center gap-[26px] rounded-[24px] border border-line bg-sf px-[40px] py-[36px] [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))] max-sm:px-[18px] max-sm:py-[24px]">
        <div>
          <h2 className="m-0 max-w-[22ch] font-display text-[32px] font-semibold leading-[1.14] [text-wrap:balance] max-sm:text-[28px]">
            {t('band.title')}
          </h2>
          <p className="m-0 mt-[12px] max-w-[48ch] text-[15px] leading-[1.65] text-body [text-wrap:pretty]">
            {t(front ? 'band.leadHome' : 'band.lead')}
          </p>
        </div>
        <OrgStart
          stacked
          label={t('start.label')}
          placeholder={t('start.placeholder')}
          submit={t('start.submit')}
          fetching={t.raw('start.fetching') as string}
          invalid={t('start.invalid')}
        />
      </div>
    </section>
  )
}
