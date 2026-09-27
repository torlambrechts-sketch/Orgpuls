import { getFormatter, getTranslations } from 'next-intl/server'
import { leaveDemo, resetDemo } from '@/lib/demo/actions'
import type { DemoState } from '@/lib/demo/read'

/**
 * The line over every screen in a demo copy (0094, D-143): that the data is fictional, that
 * nothing leaves, and when the copy is made fresh, with «Tilbakestill» and the way to an
 * account of one's own. It is drawn the way AccessNotice draws its lines. Outside a demo it
 * draws nothing, so the screens stay as the design draws them.
 */
export async function DemoNotice({ state }: { state: DemoState }) {
  if (!state.demo) return null
  const t = await getTranslations('demo.notice')
  const format = await getFormatter()
  const fresh = format.dateTime(new Date(state.freshAfter), { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Oslo' })
  const button =
    'inline-flex h-[32px] flex-none cursor-pointer items-center rounded-bar border border-ink px-[13px] text-[12.5px] font-bold text-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink'

  return (
    <div role="status" className="border-b border-line bg-sbg print:hidden">
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-[14px] gap-y-[6px] px-[16px] py-[10px] text-[13px] leading-[1.5] md:px-[28px]">
        <span className="min-w-0 flex-1 [text-wrap:pretty]">
          <strong className="font-bold">{t('head')}</strong> {t('body', { fresh })}
        </span>
        <form action={resetDemo}>
          <button type="submit" className={`${button} bg-sf`}>
            {t('reset')}
          </button>
        </form>
        <form action={leaveDemo}>
          <button type="submit" title={t('ownHint')} className={`${button} bg-ac`}>
            {t('own')}
          </button>
        </form>
      </div>
    </div>
  )
}

/**
 * The report's stamp in a demo: across every printed page, so a demo report cannot pass as a
 * real one. A fixed element repeats on each page a browser prints.
 */
export async function DemoStamp({ state }: { state: DemoState }) {
  if (!state.demo) return null
  const t = await getTranslations('demo')
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[5] flex items-center justify-center overflow-hidden print:z-[5]"
    >
      <span className="-rotate-[30deg] whitespace-nowrap font-display text-[clamp(48px,9vw,110px)] font-semibold text-danger opacity-[0.14]">
        {t('stamp')}
      </span>
    </div>
  )
}
