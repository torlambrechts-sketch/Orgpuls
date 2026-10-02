import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import type { ShotId } from '@/lib/marketing/shot-ids'
import { SHOTS } from '@/lib/marketing/shots'

/**
 * A product picture on /demo's «Dette kan du utforske» cards (D-191): the same captured screens
 * as ProductShot (D-84), in the same browser window and with the same caption naming the
 * example organisation, so none of them can be read as anyone's own figures.
 *
 * The cards sit side by side, and the screens range from a wide strip (the year wheel) to an
 * almost square page (the report). Each is therefore shown whole in a window of one shape,
 * top-aligned on the app's own canvas colour — the colour the screens were captured on — so a
 * shorter screen simply ends where it ends, with nothing cropped and nothing stretched.
 */
export async function DemoShot({ id }: { id: ShotId }) {
  const t = await getTranslations()
  const { img } = SHOTS[id]
  return (
    <figure className="m-0 overflow-hidden rounded-[16px] border border-line bg-sf">
      <figcaption className="flex items-center gap-[7px] border-b border-line px-[14px] py-[9px]">
        <span aria-hidden="true" className="block h-[8px] w-[8px] flex-none rounded-pill bg-line" />
        <span aria-hidden="true" className="block h-[8px] w-[8px] flex-none rounded-pill bg-line" />
        <span aria-hidden="true" className="block h-[8px] w-[8px] flex-none rounded-pill bg-line" />
        <span className="ml-[5px] min-w-0 truncate text-[11.5px] text-mut">
          {t('seo.shots.caption', { screen: t(`seo.shots.${id}.screen`) })}
        </span>
      </figcaption>
      <div className="relative aspect-[16/10] bg-bg">
        <Image
          src={img}
          alt={t(`seo.shots.${id}.alt`)}
          fill
          sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 380px"
          className="object-contain object-top"
        />
      </div>
    </figure>
  )
}
