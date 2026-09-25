import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import type { ShotId } from '@/lib/marketing/shot-ids'
import { SHOTS } from '@/lib/marketing/shots'

/**
 * A picture of the product (D-84): a real screen, captured from the app signed in to the
 * design fixture's organisation. The caption names that organisation, as the start page's
 * hero card does (D-37), so it cannot be read as anyone's own figures.
 *
 * A desktop screen is 16:10 and sits in a browser window, the frame the hero card already
 * draws. The questionnaire is 4:5 and sits in a phone, since that is where employees answer
 * it (docs/landingsside-gjennomgang.md 4.4). Both fill the column they are given, which the
 * page keeps at 560 px or more on a desktop so the figures can be read.
 *
 * `bleed` lets the hero's picture run past the container to the window's edge (4.2).
 */
export async function ProductShot({
  id,
  priority = false,
  bleed = false,
  testId,
  className = '',
}: {
  id: ShotId
  priority?: boolean
  bleed?: boolean
  testId?: string
  className?: string
}) {
  const t = await getTranslations()
  const { img, frame } = SHOTS[id]
  const caption = t('seo.shots.caption', { screen: t(`seo.shots.${id}.screen`) })
  const alt = t(`seo.shots.${id}.alt`)

  if (frame === 'phone') {
    return (
      <figure data-testid={testId} className={`m-0 w-full max-w-[36rem] ${className}`}>
        <div className="overflow-hidden rounded-device border-8 border-ink bg-ink shadow-phone">
          <Image src={img} alt={alt} sizes="(min-width: 640px) 576px, 100vw" priority={priority} className="block h-auto w-full rounded-screen" />
        </div>
        <figcaption className="mt-3 text-center text-mk-small text-mut">{caption}</figcaption>
      </figure>
    )
  }

  return (
    <figure
      data-testid={testId}
      className={`m-0 w-full overflow-hidden rounded-frame border border-line bg-sf shadow-shot ${
        bleed ? 'lg:w-[calc(100%+3rem+max(0px,(100vw-80rem)/2))] lg:max-w-none lg:rounded-r-none lg:border-r-0' : ''
      } ${className}`}
    >
      <figcaption className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span aria-hidden="true" className="block h-2 w-2 flex-none rounded-pill bg-line" />
        <span aria-hidden="true" className="block h-2 w-2 flex-none rounded-pill bg-line" />
        <span aria-hidden="true" className="block h-2 w-2 flex-none rounded-pill bg-line" />
        <span className="ml-2 min-w-0 truncate text-mk-small text-mut">{caption}</span>
      </figcaption>
      <Image
        src={img}
        alt={alt}
        sizes={bleed ? '(min-width: 1024px) 45vw, 100vw' : '(min-width: 1024px) 50vw, 100vw'}
        priority={priority}
        className="block h-auto w-full"
      />
    </figure>
  )
}
