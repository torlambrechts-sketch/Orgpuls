import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import type { ShotId } from '@/lib/marketing/shot-ids'
import { SHOTS } from '@/lib/marketing/shots'

/**
 * A picture of the product (D-84): a real screen, captured from the app signed in to the
 * design fixture's organisation. The caption names that organisation, as the start page's
 * hero card does (D-37), so it cannot be read as anyone's own figures.
 *
 * A desktop screen sits in a browser window, the frame the hero card already draws; the
 * questionnaire sits in a phone, since that is where employees answer it. Neither is
 * wider than the picture was captured, so it is never scaled up.
 */
export async function ProductShot({
  id,
  priority = false,
  className = '',
}: {
  id: ShotId
  priority?: boolean
  className?: string
}) {
  const t = await getTranslations()
  const { img, frame } = SHOTS[id]
  const caption = t('seo.shots.caption', { screen: t(`seo.shots.${id}.screen`) })
  const width = Math.round(img.width / 2)

  if (frame === 'phone') {
    return (
      <figure className={`m-0 w-full max-w-[290px] ${className}`}>
        <div className="overflow-hidden rounded-[34px] border-[7px] border-ink bg-ink shadow-[0_18px_40px_-24px_rgba(25,21,16,.45)]">
          <Image
            src={img}
            alt={t(`seo.shots.${id}.alt`)}
            sizes="290px"
            priority={priority}
            className="block h-auto w-full rounded-[27px]"
          />
        </div>
        <figcaption className="mt-[10px] text-center text-[11.5px] text-mut">{caption}</figcaption>
      </figure>
    )
  }

  return (
    <figure
      className={`m-0 w-full overflow-hidden rounded-[22px] border border-line bg-sf shadow-[0_18px_40px_-28px_rgba(25,21,16,.35)] ${className}`}
      style={{ maxWidth: width }}
    >
      <figcaption className="flex items-center gap-[8px] border-b border-line px-[18px] py-[11px]">
        <span aria-hidden="true" className="block h-[9px] w-[9px] flex-none rounded-pill bg-line" />
        <span aria-hidden="true" className="block h-[9px] w-[9px] flex-none rounded-pill bg-line" />
        <span aria-hidden="true" className="block h-[9px] w-[9px] flex-none rounded-pill bg-line" />
        <span className="ml-[6px] min-w-0 truncate text-[11.5px] text-mut">{caption}</span>
      </figcaption>
      <Image
        src={img}
        alt={t(`seo.shots.${id}.alt`)}
        sizes={`(max-width: ${width + 60}px) 100vw, ${width}px`}
        priority={priority}
        className="block h-auto w-full"
      />
    </figure>
  )
}
